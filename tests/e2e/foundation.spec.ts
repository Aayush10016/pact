import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('landing, workspace filters, and evidence navigation remain usable', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Make the commitment.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('link', { name: 'Explore the workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your pacts.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Needs attention', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Studio website, thoughtfully built', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search pacts' }).fill('no such pact');
  await expect(page.getByRole('heading', { name: 'No pacts match.' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByRole('link', { name: 'A new identity for Fieldwork', exact: true }).click();
  await page.getByRole('button', { name: 'Evidence', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'A record that stays connected.' })).toBeVisible();
  await page.getByRole('button', { name: 'Resolution', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Financial actions unavailable' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('draft is local and never implies payment or invitation', async ({ page }) => {
  await page.goto('/workspace/new');
  await page.getByLabel('Pact name', { exact: true }).fill('Fieldwork brand identity');
  await page.getByLabel('Other party’s email', { exact: true }).fill('maya@example.com');
  await page
    .getByLabel('What are you agreeing to?', { exact: true })
    .fill('Create a complete brand identity with final assets and guidelines.');
  await page.getByLabel('Deliverable', { exact: true }).fill('Logo assets and brand guidelines');
  await page.getByLabel('Deadline', { exact: true }).fill('2099-10-30');
  await page.getByLabel('Agreed amount', { exact: true }).fill('2400.00');
  await page
    .getByLabel('When should payment be authorized?', { exact: true })
    .fill('After both parties approve the final identity package.');
  await page.getByRole('button', { name: 'Save preview draft' }).click();
  await expect(page.getByRole('heading', { name: 'Your preview draft is saved.' })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('pact-preview-draft')!).money.amountMinor,
    ),
  ).toBe('240000');
});
for (const route of [
  '/',
  '/workspace',
  '/workspace/new',
  '/workspace/pacts/brand-identity',
  '/about',
]) {
  test(`accessible foundation ${route}`, async ({ page }) => {
    await page.goto(route);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(result.violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
