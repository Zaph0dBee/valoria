import { expect, test } from '@playwright/test';

const PAGES = ['/dashboard', '/transacoes', '/categorias', '/metas', '/importar'];

for (const path of PAGES) {
  test(`${path} não rola para os lados em tela de 360px`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
}

test('menu do celular mostra todas as seções', async ({ page }) => {
  await page.goto('/dashboard');
  const nav = page.locator('header nav');
  for (const label of ['Painel', 'Lançamentos', 'Categorias', 'Metas', 'Importar']) {
    await expect(nav.getByRole('link', { name: label })).toBeInViewport();
  }
});

test('lista de lançamentos mostra valor e ações sem rolar a tabela', async ({ page }) => {
  await page.goto('/transacoes');
  const firstRow = page.locator('tbody tr').first();
  test.skip((await firstRow.count()) === 0, 'Conta sem lançamentos');
  await expect(firstRow.getByText(/R\$/)).toBeInViewport();
  await expect(firstRow.getByRole('button', { name: /^Apagar / })).toBeInViewport();
});
