import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

async function login(page: Page, email: string, password = 'Passw0rd!') {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/');
}

// Flow 1 — login
test('1. a user can log in', async ({ page }) => {
  await login(page, 'kushagra@vayuz.com');
  await expect(page.getByText('Kushagra Bindra')).toBeVisible();
});

// Flow 2 — super_admin overview 145 / 14
test('2. super_admin sees the org overview (145 requirements, 14 closures)', async ({ page }) => {
  await login(page, 'kushagra@vayuz.com');
  await expect(page.getByText('Requirements Received')).toBeVisible();
  await expect(page.getByText('145').first()).toBeVisible();
  await expect(page.getByText('Total Closures')).toBeVisible();
  await expect(page.getByText('14').first()).toBeVisible();
});

// Flow 3 — consultant scoped + no admin
test('3. a consultant is scoped and sees no Admin nav', async ({ page }) => {
  await login(page, 'abha@vayuz.com');
  const sidebar = page.getByTestId('sidebar');
  await expect(sidebar.getByText('Home')).toBeVisible();
  await expect(sidebar.getByText('Users')).toHaveCount(0);
  await expect(sidebar.getByText('Team Hierarchy')).toHaveCount(0);
});

// Flow 4 — HDIS add → edit → pipeline update logged
test('4. HDIS add then pipeline update is logged', async ({ page }) => {
  await login(page, 'kushagra@vayuz.com');
  await page.getByTestId('sidebar').getByText('HDIS').click();
  await page.getByText('+ Add record').click();

  const jd = 'E2E_QA_20260601';
  await page.fill('input[placeholder="VAY_XX_20260601"]', jd);
  await page.locator('.field.full input').first().fill('E2E QA Engineer');
  await page.locator('input').nth(3).fill('E2E Client'); // client field
  await page.getByRole('button', { name: 'Save record' }).click();

  // Open the new record from the list.
  await page.getByText('E2E QA Engineer').click();
  await expect(page.getByText('Record pipeline activity')).toBeVisible();

  // Change R1 and log.
  const inputs = page.locator('.grid.g-3 input[type="number"]');
  await inputs.nth(1).fill('3');
  await page.getByRole('button', { name: 'Log update' }).click();

  await expect(page.getByText('pipeline update')).toBeVisible();
});

// Flow 5 — JD upload + download
test('5. an attachment can be uploaded and downloaded', async ({ page }) => {
  await login(page, 'kushagra@vayuz.com');
  // Use a seeded HDIS record.
  await page.goto('/hdis/EXO_DE_20261302');
  await expect(page.getByText('Attachments')).toBeVisible();

  const dir = mkdtempSync(path.join(tmpdir(), 'ppg-e2e-'));
  const file = path.join(dir, 'jd.pdf');
  writeFileSync(file, '%PDF-1.4 e2e sample');
  await page.setInputFiles('input[type="file"]', file);

  const link = page.getByTestId('attachment-link').first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toContain('/api/hdis/EXO_DE_20261302/attachments/');
});

// Flow 6 — HR blocked from super_admin edit
test('6. HR cannot edit a super_admin row', async ({ page }) => {
  await login(page, 'aarti@vayuz.com');
  await page.getByTestId('sidebar').getByText('Users').click();
  const kbRow = page.getByTestId('user-row-u_kb');
  await expect(kbRow).toBeVisible();
  await expect(kbRow).toHaveAttribute('data-locked', 'true');
  // Locked rows show a lock, not a role dropdown.
  await expect(kbRow.locator('select')).toHaveCount(0);
});
