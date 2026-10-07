import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const [width, height] of [
  [1440, 900],
  [1366, 768],
  [1024, 768],
  [768, 1024],
  [390, 844],
]) {
  test(`workspace introduction ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto('/workspace');
    await expect(
      page.getByRole('heading', {
        name: /^(A shared record starts with you\.|Identity setup is required\.)$/,
      }),
    ).toBeVisible();
    test.skip(
      await page.getByRole('heading', { name: 'Identity setup is required.' }).isVisible(),
      'The signed-out introduction requires configured Clerk; unavailable identity keeps its existing state.',
    );
    const intro = page.getByRole('region', { name: 'A shared record starts with you.' });
    const layout = await intro.evaluate((el) => {
      const message = el.firstElementChild!.getBoundingClientRect();
      const artifact = el.lastElementChild!.getBoundingClientRect();
      return {
        horizontal: document.documentElement.scrollWidth > innerWidth,
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: innerHeight,
        messageX: message.x,
        artifactX: artifact.x,
        messageBottom: message.bottom,
        artifactTop: artifact.top,
        artifactWidth: artifact.width,
      };
    });
    expect(layout.horizontal).toBe(false);
    expect(layout.artifactWidth).toBeGreaterThan(250);
    if (width > 800) {
      expect(layout.documentHeight).toBeLessThanOrEqual(layout.viewportHeight + 1);
      expect(layout.artifactX).toBeGreaterThan(layout.messageX);
    } else expect(layout.artifactTop).toBeGreaterThan(layout.messageBottom);
    await expect(page.getByRole('link', { name: 'Sign in to Pact', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explore the design preview' })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`introduction-${width}x${height}.png`),
      fullPage: true,
    });
    await page.getByRole('link', { name: 'Sign in to Pact', exact: true }).click();
    await expect(page.locator('.cl-card')).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole('heading', { name: 'Your promises. Your shared record.' }),
    ).toBeVisible();
  });
}

test('landing features use typography without decorative icons', async ({ page }, testInfo) => {
  await page.goto('/');
  const features = page.locator('.workflow-grid');
  await expect(features.locator('article')).toHaveCount(3);
  await expect(features.locator('svg')).toHaveCount(0);
  await expect(features.getByRole('heading')).toHaveText([
    'Make it clear.',
    'Keep the record.',
    'Find a fair outcome.',
  ]);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await features.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('landing-features.png') });
});
