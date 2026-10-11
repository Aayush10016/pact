import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
for (const [width, height] of [
  [1440, 900],
  [1366, 768],
  [1024, 768],
  [768, 1024],
  [390, 844],
]) {
  test(`login composition ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto('/sign-in');
    await expect(
      page.getByRole('heading', { name: 'Your promises. Your shared record.' }),
    ).toBeVisible();
    const configured =
      (await page.getByText('Identity is not configured yet.', { exact: false }).count()) === 0;
    if (configured) await expect(page.locator('.cl-card')).toBeVisible({ timeout: 20000 });
    const geometry = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const introduction = document
        .querySelector('main > section:first-child')!
        .getBoundingClientRect();
      const auth = document.querySelector('main > section:last-child')!.getBoundingClientRect();
      const card = document.querySelector('.cl-cardBox')?.getBoundingClientRect();
      return {
        columns: getComputedStyle(main).gridTemplateColumns.split(' ').length,
        horizontal: document.documentElement.scrollWidth > innerWidth,
        vertical: document.documentElement.scrollHeight > innerHeight + 1,
        introX: introduction.x,
        authX: auth.x,
        centerOffset: card ? Math.abs(card.x + card.width / 2 - auth.x - auth.width / 2) : 0,
      };
    });
    expect(geometry.horizontal).toBe(false);
    expect(geometry.columns).toBe(width > 800 ? 2 : 1);
    if (width > 800) {
      expect(geometry.vertical).toBe(false);
      expect(geometry.introX).toBeLessThan(geometry.authX);
    }
    expect(geometry.centerOffset).toBeLessThanOrEqual(2);
    await expect(
      page.locator('[aria-hidden="true"]').filter({ hasText: 'ONE SHARED RECORD' }),
    ).toHaveCount(1);
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`login-${width}x${height}.png`),
      fullPage: true,
    });
  });
}
test('login supports keyboard entry with visible focus', async ({ page }) => {
  await page.goto('/sign-in');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pact home' })).toBeFocused();
  expect(
    await page
      .getByRole('link', { name: 'Pact home' })
      .evaluate((el) => getComputedStyle(el).outlineStyle),
  ).not.toBe('none');
});
