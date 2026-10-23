import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const directory = resolve(process.argv[2] ?? '.recovery-local/ui');
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch();
const checks = [];
try {
  for (const width of [1440, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    for (const [name, route] of [
      ['workspace', '/preview'],
      ['detail', '/preview/pacts/brand-identity'],
      ['form', '/preview/new'],
      ['sign-in', '/sign-in'],
    ]) {
      await page.goto(`http://localhost:3000${route}`);
      if (name === 'sign-in') await page.locator('.cl-card').waitFor({ timeout: 20000 });
      await page.screenshot({ path: join(directory, `${name}-${width}.png`), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      const accessibility = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      checks.push({ name, width, overflow, violations: accessibility.violations.map((v) => v.id) });
    }
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(join(directory, 'ui-checks.json'), JSON.stringify(checks, null, 2));
console.log(
  JSON.stringify({ checks, passed: checks.every((c) => !c.overflow && c.violations.length === 0) }),
);
if (checks.some((c) => c.overflow || c.violations.length)) process.exitCode = 1;
