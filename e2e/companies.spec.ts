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
  // Lançamentos da empresa só aparecem nela ou no Consolidado: limpa a partir do Consolidado.
  await page.goto('/transacoes');
  await switchProfile(page, 'Consolidado').catch(() => undefined);
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

test('categorias por perfil', async ({ page }) => {
  await page.goto('/categorias');
  await switchProfile(page, COMPANY);
  await expect(page.getByRole('button', { name: 'Impostos (DAS/Simples)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Casa', exact: true })).toHaveCount(0);
  await expect(page.getByText('Construção / Aportes')).toHaveCount(0);

  await switchProfile(page, 'Você (PF)');
  await expect(page.getByRole('button', { name: 'Casa', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Impostos (DAS/Simples)' })).toHaveCount(0);

  await switchProfile(page, 'Consolidado');
  await expect(page.getByText('Escolha um perfil para ver e editar categorias.')).toBeVisible();
  await switchProfile(page, 'Você (PF)');
});

test('lançamento na empresa não aparece na PF', async ({ page }) => {
  const description = `Despesa ${RUN_ID}`;
  await page.goto('/transacoes');
  await switchProfile(page, COMPANY);
  await page.goto('/transacoes?new=1&kind=despesa');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Valor (R$)').fill('100,00');
  await dialog.getByLabel('Descrição').fill(description);
  await dialog.getByRole('combobox', { name: 'Categoria', exact: true }).click();
  await page.getByRole('option', { name: 'Marketing' }).click();
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Lançamento criado', { exact: true })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(description) })).toBeVisible();

  await switchProfile(page, 'Você (PF)');
  await expect(page.getByRole('row', { name: new RegExp(description) })).toHaveCount(0);

  await switchProfile(page, 'Consolidado');
  const row = page.getByRole('row', { name: new RegExp(description) });
  await expect(row).toBeVisible();
  await expect(row).toContainText(COMPANY);
  await switchProfile(page, 'Você (PF)');
});

test('consolidado pede perfil', async ({ page }) => {
  await page.goto('/transacoes');
  await switchProfile(page, 'Consolidado');
  await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Perfil' }).click();
  await page.getByRole('option', { name: COMPANY }).click();
  await expect(dialog.getByRole('button', { name: 'Aporte' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Despesa' }).click();
  await dialog.getByRole('combobox', { name: 'Categoria', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Marketing' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Casa', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await switchProfile(page, 'Você (PF)');
});

test('mesmo CSV em perfis diferentes', async ({ page }) => {
  const description = `Importado ${RUN_ID}`;
  const file = {
    name: `extrato-${RUN_ID}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(`Data;Descrição;Valor\n02/11/2026;${description};-12,34\n`, 'latin1'),
  };
  const importInto = async (profile: string) => {
    await page.goto('/importar');
    await page.locator('input[type=file]').setInputFiles(file);
    const select = page.getByRole('combobox', { name: 'De quem é este extrato?' });
    await expect(select).toContainText(profile);
    await page.getByRole('button', { name: 'Importar 1' }).click();
  };

  await page.goto('/importar');
  await switchProfile(page, 'Você (PF)');
  await importInto('Você (PF)');
  await expect(page.getByText('1 lançamentos importados', { exact: true })).toBeVisible();

  await page.goto('/importar');
  await switchProfile(page, COMPANY);
  await importInto(COMPANY);
  await expect(page.getByText('1 lançamentos importados', { exact: true })).toBeVisible();

  await importInto(COMPANY);
  await expect(page.getByText('Nada novo para importar', { exact: true })).toBeVisible();
  await page.goto('/importar');
  await switchProfile(page, 'Você (PF)');
});

test('importar acompanha a troca de perfil no topo', async ({ page }) => {
  await page.goto('/importar');
  await switchProfile(page, 'Você (PF)');
  await switchProfile(page, COMPANY);
  await page.locator('input[type=file]').setInputFiles({
    name: `troca-${RUN_ID}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(`Data;Descrição;Valor\n03/11/2026;Troca ${RUN_ID};-1,00\n`, 'latin1'),
  });
  await expect(page.getByRole('combobox', { name: 'De quem é este extrato?' })).toContainText(COMPANY);
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await switchProfile(page, 'Você (PF)');
});

async function createTransaction(
  page: Page,
  opts: { kind: 'Receita' | 'Despesa' | 'Transferência'; amount: string; description: string; date: string; reason?: string; to?: string },
) {
  await page.goto('/transacoes');
  await page.getByRole('button', { name: 'Novo lançamento' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: opts.kind, exact: true }).click();
  if (opts.reason) {
    await dialog.getByRole('combobox', { name: 'Motivo' }).click();
    await page.getByRole('option', { name: opts.reason }).click();
  }
  if (opts.to) {
    await dialog.getByRole('combobox', { name: 'Para' }).click();
    await page.getByRole('option', { name: opts.to }).click();
  }
  await dialog.getByLabel('Data').fill(opts.date);
  await dialog.getByLabel('Valor (R$)').fill(opts.amount);
  await dialog.getByLabel('Descrição').fill(opts.description);
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText(/Lançamento criado|Transferência registrada/).first()).toBeVisible();
}

test('pró-labore aparece na PF e não duplica no consolidado', async ({ page }) => {
  await page.goto('/transacoes');
  await switchProfile(page, COMPANY);
  await createTransaction(page, { kind: 'Receita', amount: '10.000,00', description: `Venda ${RUN_ID}`, date: '2026-01-10' });
  await createTransaction(page, {
    kind: 'Transferência', reason: 'Pró-labore', to: 'Você (PF)',
    amount: '3.000,00', description: `Pró-labore ${RUN_ID}`, date: '2026-01-15',
  });

  await page.goto('/dashboard?y=2026&m=1');
  await expect(page.getByTestId('summary-resultado')).toContainText('R$ 7.000,00');
  // O card da empresa fecha a conta: entradas − saídas − pró-labore = resultado.
  await expect(page.getByTestId('summary-pró-labore')).toContainText('R$ 3.000,00');

  await switchProfile(page, 'Você (PF)');
  await expect(page.getByTestId('summary-entradas')).toContainText('R$ 3.000,00');
  // O pró-labore recebido já está em "entradas": não aparece de novo como transferência.
  await expect(page.getByTestId('summary-transferencias')).toHaveCount(0);

  await switchProfile(page, 'Consolidado');
  await expect(page.getByTestId('summary-entradas')).toContainText('R$ 10.000,00');
  await switchProfile(page, 'Você (PF)');
});

test('transferência pró-labore aparece nos dois perfis', async ({ page }) => {
  const description = `Transf ${RUN_ID}`;
  await page.goto('/transacoes');
  await switchProfile(page, COMPANY);
  await createTransaction(page, {
    kind: 'Transferência', reason: 'Pró-labore', to: 'Você (PF)',
    amount: '1.234,00', description, date: '2026-02-10',
  });
  const row = page.getByRole('row', { name: new RegExp(description) });
  await expect(row).toContainText('−R$ 1.234,00');
  await expect(row).toContainText('Pró-labore → Você (PF)');

  await switchProfile(page, 'Você (PF)');
  await expect(row).toContainText('+R$ 1.234,00');
  await expect(row).toContainText(`Pró-labore · ${COMPANY}`);
});

test('apagar transferência some dos dois perfis', async ({ page }) => {
  const description = `Transf ${RUN_ID}`;
  acceptDialogs(page);
  await page.goto('/transacoes');
  await switchProfile(page, COMPANY);
  await page.getByRole('button', { name: `Apagar ${description}` }).click();
  await expect(page.getByRole('row', { name: new RegExp(description) })).toHaveCount(0);
  await switchProfile(page, 'Você (PF)');
  await expect(page.getByRole('row', { name: new RegExp(description) })).toHaveCount(0);
});

test('mesma transferência nos dois extratos não duplica', async ({ page }) => {
  const out = `Prolabore saida ${RUN_ID}`;
  const incoming = `Prolabore entrada ${RUN_ID}`;
  const importTransfer = async (profile: string, other: string, line: string, description: string) => {
    await page.goto('/importar');
    await switchProfile(page, profile);
    await page.locator('input[type=file]').setInputFiles({
      name: `transf-${RUN_ID}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(`Data;Descrição;Valor\n${line}\n`, 'latin1'),
    });
    await page.getByRole('combobox', { name: `Tipo: ${description}` }).click();
    await page.getByRole('option', { name: 'Transferência' }).click();
    await page.getByRole('combobox', { name: `Outro perfil: ${description}` }).click();
    await page.getByRole('option', { name: other }).click();
    await page.getByRole('combobox', { name: `Motivo: ${description}` }).click();
    await page.getByRole('option', { name: 'Pró-labore' }).click();
    await page.getByRole('button', { name: 'Importar 1' }).click();
  };

  await importTransfer(COMPANY, 'Você (PF)', `05/01/2026;${out};-3.000,00`, out);
  await expect(page.getByText('1 lançamentos importados', { exact: true })).toBeVisible();

  await importTransfer('Você (PF)', COMPANY, `07/01/2026;${incoming};3.000,00`, incoming);
  await expect(page.getByText('Nada novo para importar', { exact: true })).toBeVisible();

  await page.goto('/transacoes');
  await expect(page.getByRole('row', { name: new RegExp(out) })).toContainText('+R$ 3.000,00');
  await expect(page.getByRole('row', { name: new RegExp(incoming) })).toHaveCount(0);
});
