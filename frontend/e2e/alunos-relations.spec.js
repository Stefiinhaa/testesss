import { expect, request as playwrightRequest, test } from '@playwright/test';

const adminUser = process.env.E2E_ADMIN_USER || 'admin@example.invalid';
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'admin123';

function uniqueLabel(prefix) {
  return `${prefix} ${Date.now()} ${Math.random().toString(16).slice(2, 8)}`;
}

async function loginViaUi(page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(adminUser);
  await page.getByLabel('Senha').fill(adminPassword);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function getAccessToken(request) {
  const response = await request.post('/auth/login', {
    form: {
      username: adminUser,
      password: adminPassword,
    },
  });
  if (!response.ok()) {
    // Retry once — auth service may need a moment after heavy test runs
    const retry = await request.post('/auth/login', {
      form: { username: adminUser, password: adminPassword },
    });
    expect(retry.ok()).toBeTruthy();
    const payload = await retry.json();
    return payload.access_token;
  }
  const payload = await response.json();
  return payload.access_token;
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function extractItems(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;
  return [];
}

async function findAlunoByName(request, token, name) {
  const response = await request.get('/api/alunos', {
    headers: authHeaders(token),
    params: { q: name, page: 1, per_page: 5000, include_inativos: true },
  });
  if (!response.ok()) return null;
  const payload = await response.json();
  return extractItems(payload).find((item) => (item.nome || item.NomeAluno) === name) || null;
}

async function findTrilhaByName(request, token, name) {
  const response = await request.get('/api/trilhas/', {
    headers: authHeaders(token),
    params: { q: name, page: 1, per_page: 5000, include_inativos: true },
  });
  if (!response.ok()) return null;
  const payload = await response.json();
  return extractItems(payload).find((item) => (item.NomeTrilha || item.nome_trilha) === name) || null;
}

async function findInteresseByName(request, token, name) {
  const response = await request.get('/api/interesses/', {
    headers: authHeaders(token),
    params: { q: name, page: 1, per_page: 5000, include_inativos: true },
  });
  if (!response.ok()) return null;
  const payload = await response.json();
  return extractItems(payload).find((item) => (item.Descricao || item.descricao) === name) || null;
}

async function cleanupAlunoRelations(request, token, alunoId) {
  const trilhasResponse = await request.get(`/api/alunos/${alunoId}/trilhas`, {
    headers: authHeaders(token),
  });
  if (trilhasResponse.ok()) {
    const payload = await trilhasResponse.json();
    for (const item of extractItems(payload)) {
      const trilhaId = item.IdTrilha || item.id_trilha;
      if (!trilhaId) continue;
      await request.delete(`/api/alunos/${alunoId}/trilhas/${trilhaId}`, {
        headers: authHeaders(token),
      });
    }
  }

  const interessesResponse = await request.get('/api/alunos-interesses/', {
    headers: authHeaders(token),
    params: { id_aluno: alunoId, page: 1, per_page: 5000, include_inativos: true },
  });
  if (interessesResponse.ok()) {
    const payload = await interessesResponse.json();
    for (const item of extractItems(payload)) {
      const linkId = item.IdAlunoInteresse || item.id_aluno_interesse;
      if (!linkId) continue;
      await request.delete(`/api/alunos-interesses/${linkId}`, {
        headers: authHeaders(token),
      });
    }
  }
}

async function cleanupEntities(request, names) {
  const token = await getAccessToken(request);

  const aluno = await findAlunoByName(request, token, names.aluno);
  if (aluno) {
    const alunoId = aluno.id_aluno || aluno.IdAluno;
    await cleanupAlunoRelations(request, token, alunoId);
    await request.delete(`/api/alunos/${alunoId}`, {
      headers: authHeaders(token),
    });
  }

  const trilha = await findTrilhaByName(request, token, names.trilha);
  if (trilha) {
    const trilhaId = trilha.IdTrilha || trilha.id_trilha;
    await request.delete(`/api/trilhas/${trilhaId}`, {
      headers: authHeaders(token),
    });
  }

  const interesse = await findInteresseByName(request, token, names.interesse);
  if (interesse) {
    const interesseId = interesse.IdInteresse || interesse.id_interesse;
    await request.delete(`/api/interesses/${interesseId}`, {
      headers: authHeaders(token),
    });
  }
}

async function cleanupEntitiesIsolated(names) {
  const apiContext = await playwrightRequest.newContext({
    baseURL: process.env.E2E_BASE_URL || 'http://localhost',
  });

  try {
    await cleanupEntities(apiContext, names);
  } finally {
    await apiContext.dispose();
  }
}

async function ensureExpanded(section) {
  const expandButton = section.getByRole('button', { name: 'Expandir' });
  if (await expandButton.count()) {
    await expandButton.click();
  }
}

async function waitForOption(selectLocator, label) {
  await expect.poll(async () => selectLocator.locator('option').allTextContents()).toContain(label);
}

async function openInteresseCreateForm(page, interesseSection) {
  const interesseSelect = interesseSection.getByLabel('Selecionar interesse relacionado');
  await expect
    .poll(async () => {
      const options = await interesseSelect.locator('option').allTextContents();
      return options.some((text) => text.includes('Criar novo interesse'));
    })
    .toBeTruthy();

  await interesseSelect.selectOption('__create_new_interesse__');
  await expect(page).toHaveURL(/\/interesses\?.*create=1/);
}

async function openTrilhaCreateForm(page, trilhaSection) {
  const trilhaSelect = trilhaSection.getByLabel('Selecionar trilha');
  await expect
    .poll(async () => {
      const options = await trilhaSelect.locator('option').allTextContents();
      return options.some((text) => text.includes('Criar nova trilha'));
    })
    .toBeTruthy();

  await trilhaSelect.selectOption('__create_new_trilha__');
  await expect(page).toHaveURL(/\/trilhas\?.*create=1/);
}

test.describe('Alunos > Trilhas e Interesses', () => {
  test('cria aluno, cria itens relacionados pela GUI, vincula, persiste e remove os vínculos', async ({ page, request }) => {
    await page.addInitScript(() => {
      window.confirm = () => true;
    });

    const names = {
      aluno: uniqueLabel('AAA E2E Aluno'),
      interesse: uniqueLabel('E2E Interesse'),
      trilha: uniqueLabel('E2E Trilha'),
    };
    const token = await getAccessToken(request);

    await cleanupEntitiesIsolated(names);

    try {
      await loginViaUi(page);
      await page.goto('/alunos');

      await page.getByRole('button', { name: 'Adicionar aluno' }).click();

      const alunoForm = page.locator('.split-panel.open form.card').first();
      await alunoForm.locator('[data-aluno-field="nome"]').fill(names.aluno);
      await alunoForm.locator('[data-aluno-field="email"]').fill(`e2e.${Date.now()}@example.com`);
      await alunoForm.locator('[data-aluno-field="data_nascimento"]').fill('01012000');
      await alunoForm.locator('[data-aluno-field="cidade_naturalidade"]').fill('Marilia');
      await alunoForm.locator('[data-aluno-field="fone_celular_ddd"]').fill('14');
      await alunoForm.locator('[data-aluno-field="fone_celular_numero"]').fill('998765432');
      await alunoForm.locator('[data-aluno-field="escola_ensino_medio"]').fill('EE Centro');
      await alunoForm.locator('[data-aluno-field="escola_atual"]').fill('EE Atual');
      await alunoForm.locator('[data-aluno-field="turno"]').selectOption({ index: 1 });
      await alunoForm.locator('[data-aluno-field="id_turma"]').selectOption({ index: 1 });
      await alunoForm.locator('[data-aluno-field="situacao"]').selectOption({ index: 1 });
      await alunoForm.getByRole('button', { name: /^Salvar$/ }).click();

      await expect
        .poll(async () => Boolean(await findAlunoByName(request, token, names.aluno)))
        .toBeTruthy();

      const createdAluno = await findAlunoByName(request, token, names.aluno);
      const createdAlunoId = createdAluno.id_aluno || createdAluno.IdAluno;

      const alunoRow = page.locator('tr', { hasText: names.aluno }).first();
      await expect(alunoRow).toBeVisible();
      await alunoRow.click();
      await expect(page.locator('.split-panel.open form.card')).toBeVisible();
      await expect(page.locator('[data-aluno-field="nome"]')).toHaveValue(names.aluno);

      const interesseSection = page.locator('section.related-section-block').filter({ hasText: 'Interesses Relacionados' });
      await ensureExpanded(interesseSection);
      await openInteresseCreateForm(page, interesseSection);

      const interesseCreatePanel = page.locator('.split-panel.open form').filter({ has: page.getByRole('heading', { name: 'Novo Interesse' }) });
      await expect(interesseCreatePanel).toBeVisible();
      await interesseCreatePanel.getByLabel(/Descricao/i).fill(names.interesse);
      await interesseCreatePanel.getByRole('button', { name: /^Salvar$/ }).click();
      await expect
        .poll(async () => Boolean(await findInteresseByName(request, token, names.interesse)))
        .toBeTruthy();

      await page.goto(`/alunos?edit=${encodeURIComponent(createdAlunoId)}`);
      await expect(page.locator('.split-panel.open form.card')).toBeVisible();
      await expect(page.locator('[data-aluno-field="nome"]')).toHaveValue(names.aluno);
      const interesseSectionBack = page.locator('section.related-section-block').filter({ hasText: 'Interesses Relacionados' });
      await ensureExpanded(interesseSectionBack);

      const interesseSelect = interesseSectionBack.getByLabel('Selecionar interesse relacionado');
      await waitForOption(interesseSelect, names.interesse);
      await interesseSelect.selectOption({ label: names.interesse });
      await interesseSectionBack.getByRole('button', { name: 'Vincular Interesse' }).click();
      await expect(interesseSectionBack.locator('tbody').getByText(names.interesse)).toBeVisible();

      // Sair do foco da seção atual para tornar as demais seções disponíveis novamente.
      const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
      const alunoBreadcrumbButton = breadcrumb.getByRole('button', { name: names.aluno });
      if (await alunoBreadcrumbButton.count()) {
        await alunoBreadcrumbButton.click();
      } else {
        const alunoRowAgain = page.locator('tr', { hasText: names.aluno }).first();
        await expect(alunoRowAgain).toBeVisible();
        await alunoRowAgain.click();
      }
      await expect(page.locator('.split-panel.open form.card')).toBeVisible();

      const trilhaSection = page.locator('section.related-section-block').filter({ hasText: 'Trilhas Relacionadas' });
      await ensureExpanded(trilhaSection);
      await openTrilhaCreateForm(page, trilhaSection);

      const trilhaCreatePanel = page.locator('.split-panel.open form').filter({ has: page.getByRole('heading', { name: 'Nova Trilha' }) });
      await expect(trilhaCreatePanel).toBeVisible();
      await trilhaCreatePanel.getByLabel('Nome da Trilha').fill(names.trilha);
      await trilhaCreatePanel.getByLabel(/Descricao da Trilha/i).fill('Trilha criada pelo Playwright');
      await trilhaCreatePanel.getByRole('button', { name: /^Salvar$/ }).click();
      await expect
        .poll(async () => Boolean(await findTrilhaByName(request, token, names.trilha)))
        .toBeTruthy();

      await page.goto(`/alunos?edit=${encodeURIComponent(createdAlunoId)}`);
      await expect(page.locator('.split-panel.open form.card')).toBeVisible();
      await expect(page.locator('[data-aluno-field="nome"]')).toHaveValue(names.aluno);
      const trilhaSectionBack = page.locator('section.related-section-block').filter({ hasText: 'Trilhas Relacionadas' });
      await ensureExpanded(trilhaSectionBack);

      const trilhaSelect = trilhaSectionBack.getByLabel('Selecionar trilha');
      await waitForOption(trilhaSelect, names.trilha);
      await trilhaSelect.selectOption({ label: names.trilha });
      await expect
        .poll(async () => {
          const trilha = await findTrilhaByName(request, token, names.trilha);
          return trilha?.IdTrilha || trilha?.id_trilha || null;
        })
        .not.toBeNull();
      const createdTrilha = await findTrilhaByName(request, token, names.trilha);
      const createdTrilhaId = createdTrilha?.IdTrilha || createdTrilha?.id_trilha;

      await trilhaSectionBack.getByLabel('Nota da trilha').fill('8.5');
      await trilhaSectionBack.getByRole('button', { name: 'Vincular Trilha' }).click();
      await expect(trilhaSectionBack.locator('tbody').getByText(names.trilha)).toBeVisible();

      const noteInput = trilhaSectionBack.getByLabel(`Nota da trilha ${names.trilha}`);
      await noteInput.fill('9.25');
      await trilhaSectionBack.getByRole('button', { name: 'Salvar Nota' }).click();
      await expect(noteInput).toHaveValue('9.25');

      await page.reload();
      const persistedAlunoRow = page.locator('tr', { hasText: names.aluno }).first();
      await expect(persistedAlunoRow).toBeVisible();
      await persistedAlunoRow.click();
      await expect(page.locator('.split-panel.open form.card')).toBeVisible();

      const persistedBreadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
      const persistedAlunoBreadcrumbButton = persistedBreadcrumb.getByRole('button', { name: names.aluno });
      if (await persistedAlunoBreadcrumbButton.count()) {
        await persistedAlunoBreadcrumbButton.click();
      }
      const detailsPanel = page
        .locator('aside.split-panel.open')
        .filter({ has: page.getByRole('heading', { name: 'Detalhes do Aluno' }) })
        .first();
      const recolherButton = detailsPanel.getByRole('button', { name: 'Recolher' }).first();
      if (await recolherButton.count()) {
        await recolherButton.click();
      }

      const persistedInteresseSection = page.locator('section.related-section-block').filter({ hasText: 'Interesses Relacionados' });
      const persistedTrilhaSection = page.locator('section.related-section-block').filter({ hasText: 'Trilhas Relacionadas' });
      await ensureExpanded(persistedInteresseSection);
      await ensureExpanded(persistedTrilhaSection);

      await expect
        .poll(async () => {
          const response = await request.get(`/api/alunos/${createdAlunoId}/trilhas`, {
            headers: authHeaders(token),
          });
          if (!response.ok()) return null;
          const payload = await response.json();
          const item = extractItems(payload).find((link) => (link.IdTrilha || link.id_trilha) === createdTrilhaId);
          if (!item) return null;
          const nota = Number(item.NotaTrilha ?? item.nota_trilha);
          return Number.isFinite(nota) ? Math.round(nota * 100) : null;
        })
        .toBe(925);

      await expect(persistedInteresseSection.locator('tbody').getByText(names.interesse)).toBeVisible();
      await expect(persistedTrilhaSection.getByText('Sem trilhas vinculadas.')).not.toBeVisible();

      const persistedInteresseRow = persistedInteresseSection.locator('tbody tr').filter({ hasText: names.interesse }).first();
      await expect(persistedInteresseRow).toBeVisible();
      await persistedInteresseRow.getByRole('button', { name: 'Remover' }).click();
      await expect(persistedInteresseSection.getByText('Sem interesses vinculados.')).toBeVisible();

      await expect
        .poll(async () => {
          const response = await request.get(`/api/alunos/${createdAlunoId}/trilhas`, {
            headers: authHeaders(token),
          });
          if (!response.ok()) return false;
          const payload = await response.json();
          return extractItems(payload).some((link) => (link.IdTrilha || link.id_trilha) === createdTrilhaId);
        })
        .toBeTruthy();

      const removeTrilhaResponse = await request.delete(`/api/alunos/${createdAlunoId}/trilhas/${createdTrilhaId}`, {
        headers: authHeaders(token),
      });
      expect(removeTrilhaResponse.ok()).toBeTruthy();

      await expect
        .poll(async () => {
          const response = await request.get(`/api/alunos/${createdAlunoId}/trilhas`, {
            headers: authHeaders(token),
          });
          if (!response.ok()) return true;
          const payload = await response.json();
          return extractItems(payload).every((link) => (link.IdTrilha || link.id_trilha) !== createdTrilhaId);
        })
        .toBeTruthy();

      await page.reload();
      const alunoRowAfterRemoval = page.locator('tr', { hasText: names.aluno }).first();
      await expect(alunoRowAfterRemoval).toBeVisible();
      await alunoRowAfterRemoval.click();
      await expect(page.locator('.split-panel.open form.card')).toBeVisible();

      const trilhaSectionAfterRemoval = page.locator('section.related-section-block').filter({ hasText: 'Trilhas Relacionadas' });
      await ensureExpanded(trilhaSectionAfterRemoval);
      await expect(trilhaSectionAfterRemoval.getByText('Sem trilhas vinculadas.')).toBeVisible();
    } finally {
      await cleanupEntitiesIsolated(names);
    }
  });
});
