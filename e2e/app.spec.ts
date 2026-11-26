import { expect, test } from '@playwright/test';
import { RUN_ID, deleteTransactionsContaining, openNewTransaction } from './helpers';

test.describe('acesso', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('rotas protegidas mandam para o login', async ({ page }) => {
    for (const path of ['/dashboard', '/transacoes', '/categorias', '/metas', '/importar', '/relatorios']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });
});

// Limpeza garantida: apaga tudo que algum teste criou (marcado com "e2e-"),
// mesmo se o teste falhar no meio.
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'desktop') return;
  await deleteTransactionsContaining(page, 'e2e-');
});

test('painel carrega as seções principais', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByText('saldo disponível', { exact: false })).toBeVisible();
  await expect(page.getByText('Meu dinheiro está indo para onde eu quero?')).toBeVisible();
  await expect(page.getByText('Despesas por categoria')).toBeVisible();
  await expect(page.getByText('Últimos lançamentos')).toBeVisible();
});

test('lançamento com valor no formato brasileiro: criar, editar e apagar', async ({ page }) => {
  const description = `Despesa ${RUN_ID}`;
  const dialog = await openNewTransaction(page, 'despesa');
  await dialog.getByLabel('Valor (R$)').fill('1.234,56');
  await dialog.getByLabel('Descrição').fill(description);
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Lançamento criado', { exact: true })).toBeVisible();

  const row = page.getByRole('row', { name: new RegExp(description) });
  await expect(row).toContainText('R$ 1.234,56');

  // A edição mostra o valor em pt-BR e salva sem perder centavos.
  await row.getByRole('button', { name: `Editar ${description}` }).click();
  const editDialog = page.getByRole('dialog');
  await expect(editDialog.getByLabel('Valor (R$)')).toHaveValue('1.234,56');
  await editDialog.getByLabel('Valor (R$)').fill('1.500');
  await editDialog.getByRole('button', { name: 'Atualizar' }).click();
  await expect(page.getByText('Lançamento atualizado', { exact: true })).toBeVisible();
  await expect(row).toContainText('R$ 1.500,00');

  await deleteTransactionsContaining(page, RUN_ID);
  await expect(page.getByText(description)).toHaveCount(0);
});

test('importar o mesmo CSV duas vezes não duplica lançamentos', async ({ page }) => {
  const description = `Importado ${RUN_ID}`;
  const csv = Buffer.from(`Data;Descrição;Valor\n01/11/2026;${description};-12,34\n`, 'latin1');
  const file = { name: `extrato-${RUN_ID}.csv`, mimeType: 'text/csv', buffer: csv };

  await page.goto('/importar');
  await page.locator('input[type=file]').setInputFiles(file);
  // Arquivo em Windows-1252: o cabeçalho "Descrição" precisa ser reconhecido.
  await expect(page.getByText(description)).toBeVisible();
  await page.getByRole('button', { name: 'Importar 1' }).click();
  await expect(page.getByText('1 lançamentos importados', { exact: true })).toBeVisible();

  await page.goto('/importar');
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: 'Importar 1' }).click();
  await expect(page.getByText('Nada novo para importar', { exact: true })).toBeVisible();

  await page.goto('/transacoes');
  await expect(page.getByRole('row', { name: new RegExp(description) })).toHaveCount(1);

  await deleteTransactionsContaining(page, RUN_ID);
});

test('relatórios de quem só tem PF', async ({ page }) => {
  await page.goto('/dashboard');
  // Sem empresa, o menu não mostra Relatórios; o acesso direto funciona.
  await expect(page.getByRole('link', { name: 'Relatórios' })).toHaveCount(0);
  await page.goto('/relatorios');
  const table = page.getByTestId('report-comparison');
  await expect(table.getByRole('columnheader', { name: 'Você (PF)' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Consolidado' })).toBeVisible();
  await expect(table.getByRole('columnheader')).toHaveCount(2);
});
