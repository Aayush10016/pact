import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const id = 'f4259f31-b4d3-4f8d-9072-10e6b116a088';
const service = {
  id,
  owner_id: '8a867845-a902-49ef-bbd6-4de3ea7cadbb',
  display_name: 'Sample professional',
  title: 'A focused backend developer resume',
  description: 'A complete backend engineering resume based on your experience and projects.',
  category: 'Writing',
  acceptance_criteria:
    'A readable resume with backend skills, relevant experience, and project outcomes.',
  expected_evidence: 'One complete resume PDF.',
  amount_minor: '2500',
  currency: 'USD',
  delivery_days: 7,
  published: true,
  version: 1,
  paypal_ready: false,
  review_count: 0,
  average_rating: null,
};
test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/pact\/marketplace(?:\/|\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    const data = url.pathname.endsWith(id)
      ? service
      : url.searchParams.get('q') === 'no matches'
        ? []
        : [service];
    await route.fulfill({ json: { data } });
  });
});
test('public catalogue, search, service terms and sign-in boundary work without overflow', async ({
  page,
}, testInfo) => {
  await page.goto('/marketplace');
  await expect(
    page.getByRole('heading', { name: 'A clearer way to work together.' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: service.title, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: service.title, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acceptance criteria' })).toBeVisible();
  await expect(page.getByText(service.acceptance_criteria, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in to create an agreement' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request this service' })).toHaveCount(0);
  await expect(page.getByText('No confirmed agreement reviews yet')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('marketplace-service.png'), fullPage: true });
  await page.goto('/marketplace');
  await page.getByLabel('Search services').fill('no matches');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No matching services yet.' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('link', { name: service.title, exact: true })).toBeVisible();
});

test('catalogue failures have a working retry instead of a dead end', async ({ page }) => {
  let attempts = 0;
  await page.route(/\/api\/pact\/marketplace(?:\?|$)/, async (route) => {
    attempts++;
    await route.fulfill(
      attempts === 1
        ? { status: 503, json: { error: { message: 'Services are temporarily unavailable.' } } }
        : { json: { data: [service] } },
    );
  });
  await page.goto('/marketplace');
  const error = page
    .getByRole('alert')
    .filter({ hasText: 'Services are temporarily unavailable.' });
  await expect(error).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('link', { name: service.title, exact: true })).toBeVisible();
  await expect(error).toHaveCount(0);
});
test('account and listing management require a verified Pact session', async ({ page }) => {
  for (const path of ['/workspace/account', '/workspace/services']) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: 'Continue to PayPal Sandbox' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save service' })).toHaveCount(0);
  }
});
