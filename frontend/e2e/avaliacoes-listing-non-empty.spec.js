import { expect, test } from '@playwright/test';

const adminUser = process.env.E2E_ADMIN_USER || 'admin@example.invalid';
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'admin123';

function uniqueMarker(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
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
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return payload.access_token;
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

test.describe('Avaliações - listagem não vazia', () => {
  test('deve exibir ao menos a avaliação recém-criada na listagem', async ({ page, request }) => {
    const token = await getAccessToken(request);
    const marker = uniqueMarker('E2E_AVALIACAO_VISIVEL');

    let createdAvaliacaoId = null;

    try {
      const formOptionsResponse = await request.get('/api/avaliacoes/form-options', {
        headers: authHeaders(token),
      });
      expect(formOptionsResponse.ok()).toBeTruthy();

      const formOptions = await formOptionsResponse.json();
      const aluno = (formOptions?.alunos || [])[0];
      const curso = (formOptions?.cursos || [])[0];

      expect(aluno?.id, 'Nenhum aluno disponível para criar avaliação no teste').toBeTruthy();
      expect(curso?.id, 'Nenhum curso disponível para criar avaliação no teste').toBeTruthy();

      const createResponse = await request.post('/api/avaliacoes/', {
        headers: {
          ...authHeaders(token),
          'Content-Type': 'application/json',
        },
        data: {
          IdAluno: aluno.id,
          IdCurso: curso.id,
          Nota: -1,
          Status: 'E2E',
          OBS: marker,
        },
      });

      expect(createResponse.ok()).toBeTruthy();
      const created = await createResponse.json();
      createdAvaliacaoId = created?.IdAvaliacao || null;

      await loginViaUi(page);
      await page.goto('/avaliacoes');
      await expect(page).toHaveURL(/\/avaliacoes$/);

      // A avaliação criada usa OBS único para tornar a validação determinística na tabela.
      await expect(page.getByText(marker).first()).toBeVisible();
    } finally {
      if (createdAvaliacaoId) {
        await request.delete(`/api/avaliacoes/${createdAvaliacaoId}`, {
          headers: authHeaders(token),
        });
      }
    }
  });
});
