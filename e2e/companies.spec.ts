import { expect, test, type Page } from '@playwright/test';
import { RUN_ID, acceptDialogs, deleteTransactionsContaining } from './helpers';

const COMPANY = `Empresa ${RUN_ID}`;

// Os testes compartilham a empresa criada no beforeAll; rodam em sequência.
test.describe.configure({ mode: 'serial' });

async function switchProfile(page: Page, label: string | RegExp) {
  await page.getByRole('button', { name: /^Perfil: .*Trocar perfil$/ }).first().click();
  await page.getByRole('menuitem', { name: label }).click();
  await expect(page.getByTestId('active-profile').first()).toHaveText(label);
}

async function deleteCompanyByName(page: Page, name: string) {
  acceptDialogs(page);
  await page.goto('/empresas');
  const button = page.getByRole('button', { name: `Excluir ${name}` });
  if ((await button.count()) > 0) {
    await button.click();
    await expect(button).toHaveCount(0);
  }
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/user.json' });
  await page.goto('/empresas');
  await page.getByRole('button', { name: /Nova empresa|Cadastrar empresa/ }).first().click();
  await page.getByLabel('Nome da empresa').fill(COMPANY);
  await page.getByRole('button', { name: 'Cadastrar empresa' }).last().click();
  await expect(page.getByText('Empresa cadastrada', { exact: true })).toBeVisible();
  await page.close();
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/user.json' });
  await deleteTransactionsContaining(page, RUN_ID);
  await switchProfile(page, 'Você (PF)').catch(() => undefined);
  await deleteCompanyByName(page, COMPANY);
  await page.close();
});

test('painel por perfil', async ({ page }) => {
  await page.goto('/dashboard');
  await switchProfile(page, 'Você (PF)');
  await expect(page.getByText(/painel · você \(pf\)/i)).toBeVisible();
  await expect(page.getByText('Meu dinheiro está indo para onde eu quero?')).toBeVisible();

  await switchProfile(page, COMPANY);
  await expect(page.getByText(new RegExp(`painel · ${COMPANY}`, 'i'))).toBeVisible();
  await expect(page.getByText('Meu dinheiro está indo para onde eu quero?')).toHaveCount(0);

  await switchProfile(page, 'Consolidado');
  await expect(page.getByText(/painel · consolidado/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /definir/i })).toHaveCount(0);

  await switchProfile(page, 'Você (PF)');
});
