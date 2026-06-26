import { expect, test } from '@playwright/test';

const adminUser = process.env.E2E_ADMIN_USER || 'admin@example.invalid';
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'admin123';

async function loginViaUi(page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(adminUser);
  await page.getByLabel('Senha').fill(adminPassword);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe('Tela de Aulas - Calendário', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page);
  });

  test('navega para Aulas via menu e vê o calendário', async ({ page }) => {
    await page.getByRole('link', { name: 'Aulas' }).click();
    await expect(page).toHaveURL(/\/aulas$/);
    // Verifica que o calendário está visível (FullCalendar renderiza com classe fc)
    await expect(page.locator('.fc')).toBeVisible();
    // Verifica tabs Dia/Semana/Mês (usa locator mais específico para evitar ambiguidade)
    await expect(page.locator('.fc-timeGridDay-button')).toBeVisible();
    await expect(page.locator('.fc-timeGridWeek-button')).toBeVisible();
    await expect(page.locator('.fc-dayGridMonth-button')).toBeVisible();
    // Verifica botão Hoje
    await expect(page.locator('.fc-today-button')).toBeVisible();
    // Verifica botão Adicionar
    await expect(page.getByRole('button', { name: /Adicionar/i })).toBeVisible();
  });

  test('cria uma nova aula e ela aparece no calendário', async ({ page }) => {
    await page.goto('/aulas');
    await expect(page.locator('.fc')).toBeVisible();

    // Clica em Adicionar
    await page.getByRole('button', { name: /Adicionar/i }).click();

    // Preenche o formulário
    await page.getByLabel('Nome da Aula').fill('Aula E2E Teste');
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    await page.getByLabel('Início').fill(`${dateStr}T09:00`);
    await page.getByLabel('Fim').fill(`${dateStr}T10:30`);

    // Salva
    await page.getByRole('button', { name: 'Salvar' }).click();

    // Verifica que a aula aparece no calendário
    await expect(page.getByText('Aula E2E Teste')).toBeVisible({ timeout: 10000 });
  });

  test('efetua chamada com todos os campos preenchidos', async ({ page }) => {
    await page.goto('/aulas');
    await expect(page.locator('.fc')).toBeVisible();

    // Se houver aulas, clica na primeira
    const events = page.locator('.fc-event');
    const count = await events.count();
    if (count === 0) return; // skip se não há aulas

    await events.first().click();
    await expect(page.getByRole('button', { name: /Efetuar Chamada/i })).toBeVisible();

    // Abre formulário de chamada
    await page.getByRole('button', { name: /Efetuar Chamada/i }).click();

    // Verifica que todos os campos estão presentes
    await expect(page.getByLabel('Data')).toBeVisible();
    await expect(page.getByLabel('Aluno')).toBeVisible();
    await expect(page.getByLabel('Presença')).toBeVisible();
    await expect(page.getByLabel('Matrícula')).toBeVisible();

    // Preenche
    const today = new Date().toISOString().split('T')[0];
    await page.getByLabel('Data').fill(today);

    // Seleciona primeiro aluno disponível
    const alunoSelect = page.getByLabel('Aluno');
    const options = await alunoSelect.locator('option').all();
    if (options.length > 1) {
      await alunoSelect.selectOption({ index: 1 });
    }

    await page.getByLabel('Presença').selectOption('Presente');

    // Salva
    await page.getByRole('button', { name: 'Salvar' }).click();

    // Verifica notificação de sucesso
    await expect(page.getByText(/Chamada registrada/i)).toBeVisible({ timeout: 5000 });
  });

  test('clica em uma aula e vê os detalhes', async ({ page }) => {
    await page.goto('/aulas');
    await expect(page.locator('.fc')).toBeVisible();

    // Se houver aulas visíveis, clica na primeira
    const events = page.locator('.fc-event');
    const count = await events.count();
    if (count > 0) {
      await events.first().click();
      // Verifica que o painel de detalhes abriu
      await expect(page.getByText('Turma:')).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole('button', { name: 'Editar' })).toBeVisible();
      await expect(page.getByRole('button', { name: /Efetuar Chamada/i })).toBeVisible();
    }
  });

  test('alterna entre views Dia, Semana e Mês', async ({ page }) => {
    await page.goto('/aulas');
    await expect(page.locator('.fc')).toBeVisible();

    // Muda para Dia
    await page.locator('.fc-timeGridDay-button').click();
    await expect(page.locator('.fc-timeGridDay-view')).toBeVisible();

    // Muda para Mês
    await page.locator('.fc-dayGridMonth-button').click();
    await expect(page.locator('.fc-dayGridMonth-view')).toBeVisible();

    // Volta para Semana
    await page.locator('.fc-timeGridWeek-button').click();
    await expect(page.locator('.fc-timeGridWeek-view')).toBeVisible();
  });

  test('cria aula, edita e remove', async ({ page }) => {
    await page.goto('/aulas');
    await expect(page.locator('.fc')).toBeVisible();

    // Cria
    await page.getByRole('button', { name: /Adicionar/i }).click();
    await page.getByLabel('Nome da Aula').fill('Aula CRUD E2E');
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    await page.getByLabel('Início').fill(`${dateStr}T14:00`);
    await page.getByLabel('Fim').fill(`${dateStr}T15:00`);
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Aula CRUD E2E')).toBeVisible({ timeout: 10000 });

    // Clica para ver detalhes
    await page.getByText('Aula CRUD E2E').click();
    await expect(page.getByRole('button', { name: 'Editar' })).toBeVisible();

    // Edita
    await page.getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Nome da Aula').fill('Aula CRUD E2E Editada');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Aula CRUD E2E Editada')).toBeVisible({ timeout: 10000 });

    // Remove
    await page.getByText('Aula CRUD E2E Editada').click();
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Remover' }).click();

    // Verifica que não aparece mais
    await expect(page.getByText('Aula CRUD E2E Editada')).not.toBeVisible({ timeout: 5000 });
  });
});
