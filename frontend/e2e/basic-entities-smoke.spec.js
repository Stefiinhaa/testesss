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

test.describe('Smoke de Entidades', () => {
  test('abre listagens principais sem quebrar', async ({ page }) => {
    await loginViaUi(page);

    await page.goto('/alunos');
    await expect(page.getByText('Alunos').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adicionar aluno' })).toBeVisible();

    await page.goto('/cursos');
    await expect(page.getByText('Matricular Cursos').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adicionar curso' })).toBeVisible();

    await page.goto('/chamadas');
    await expect(page.getByText('Frequência').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Nova chamada|Adicionar chamada/i })).toBeVisible();

    await page.goto('/avaliacoes');
    await expect(page.getByText('Avaliações').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adicionar avaliação' })).toBeVisible();
  });
});
