import { expect, type Page } from '@playwright/test';

/** Sufixo único por execução, para identificar (e apagar) o que o teste criou. */
export const RUN_ID = `e2e-${Date.now().toString(36)}`;

/** Abre o formulário de novo lançamento já com o tipo escolhido. */
export async function openNewTransaction(page: Page, kind: 'receita' | 'despesa' | 'reserva') {
  await page.goto(`/transacoes?new=1&kind=${kind}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Novo lançamento' })).toBeVisible();
  return dialog;
}

/** Apaga, pela interface, todos os lançamentos cuja descrição contém `text`. */
export async function deleteTransactionsContaining(page: Page, text: string) {
  page.on('dialog', (d) => d.accept());
  await page.goto('/transacoes');
  const buttons = page.getByRole('button', { name: new RegExp(`^Apagar .*${escapeRegex(text)}`) });
  while ((await buttons.count()) > 0) {
    const before = await buttons.count();
    await buttons.first().click();
    await expect(buttons).toHaveCount(before - 1);
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
