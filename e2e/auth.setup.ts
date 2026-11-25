import { expect, test as setup } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

setup('login com a conta de testes', async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  setup.skip(!email || !password, 'Defina E2E_EMAIL e E2E_PASSWORD (ex.: no .env.local).');

  await page.goto('/login');
  await page.locator('#email').fill(email!);
  await page.locator('#password').fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: authFile });
});
