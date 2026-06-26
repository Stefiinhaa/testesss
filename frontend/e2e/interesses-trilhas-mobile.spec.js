import { expect, test } from '@playwright/test';

const adminUser = process.env.E2E_ADMIN_USER || 'admin@example.invalid';
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'admin123';

test.use({ viewport: { width: 390, height: 844 } });

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

async function gotoSection(page, pathPattern, path) {
  await page.goto(path);
  await expect(page).toHaveURL(pathPattern);
}

function addButtonFor(page, entityName) {
  return page
    .getByRole('button', { name: new RegExp(`Adicionar\\s+${entityName}|Adicionar`, 'i') })
    .first();
}

function interessePaneLocator(page) {
  return page
    .locator('main')
    .getByRole('complementary')
    .filter({ has: page.getByRole('button', { name: 'Voltar para lista de interesses' }) });
}

function trilhaPaneLocator(page) {
  return page
    .locator('main')
    .getByRole('complementary')
    .filter({ has: page.getByRole('button', { name: 'Voltar para lista de trilhas' }) });
}

test.describe('Interesses e Trilhas - fluxo feliz mobile', () => {
  test('abre painel de formulario direto ao tocar no card', async ({ page }) => {
    const interesseNome = uniqueLabel('AAA Mobile Interesse');
    const trilhaNome = uniqueLabel('AAA Mobile Trilha');

    await page.addInitScript(() => {
      window.confirm = () => true;
    });

    await loginViaUi(page);

    await gotoSection(page, /\/interesses$/, '/interesses');
    await expect(addButtonFor(page, 'interesse')).toBeVisible();
    await addButtonFor(page, 'interesse').click();
    const interessePane = interessePaneLocator(page);
    await expect(interessePane).toBeVisible();
    await interessePane.getByRole('textbox').first().fill(interesseNome);
    await interessePane.getByRole('button', { name: /^Salvar$/ }).click();

    const interesseCard = page.getByRole('button', { name: `Editar interesse ${interesseNome}` }).first();
    await expect(interesseCard).toBeVisible();
    await interesseCard.click();
    await expect(interessePane).toBeVisible();
    await expect(interessePane.getByRole('textbox').first()).toHaveValue(interesseNome);
    await page.getByRole('button', { name: `Apagar interesse ${interesseNome}` }).click();

    await gotoSection(page, /\/trilhas$/, '/trilhas');
    await expect(addButtonFor(page, 'trilha')).toBeVisible();
    await addButtonFor(page, 'trilha').click();
    const trilhaPane = trilhaPaneLocator(page);
    await expect(trilhaPane).toBeVisible();
    await trilhaPane.getByRole('textbox').first().fill(trilhaNome);
    await trilhaPane.getByRole('button', { name: /^Salvar$/ }).click();

    const trilhaCard = page.getByRole('button', { name: `Editar trilha ${trilhaNome}` }).first();
    await expect(trilhaCard).toBeVisible();
    await trilhaCard.click();
    await expect(trilhaPane).toBeVisible();
    await expect(trilhaPane.getByRole('textbox').first()).toHaveValue(trilhaNome);
    await page.getByRole('button', { name: `Apagar trilha ${trilhaNome}` }).click();
  });
});
