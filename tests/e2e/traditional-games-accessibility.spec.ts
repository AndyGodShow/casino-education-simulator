import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

export const traditionalGameRoutes = [
  '/#/traditional/games/baccarat',
  '/#/traditional/games/blackjack',
  '/#/traditional/games/roulette',
  '/#/traditional/games/slot-machine',
  '/#/traditional/games/sic-bo',
  '/#/traditional/games/dragon-tiger',
  '/#/traditional/games/three-card',
  '/#/traditional/games/craps',
] as const;

export async function expectNoAxeViolations(page: Page) {
  const accessibility = await new AxeBuilder({ page }).analyze();
  const violations = accessibility.violations.map(({ id, impact, nodes }) => ({
    id,
    impact,
    targets: nodes.flatMap((node) => node.target).slice(0, 12),
  }));
  expect(violations).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test('shared simulation controls have programmatic labels', async ({ page }) => {
  await page.goto('/#/traditional/games/roulette');
  await page.getByRole('button', { name: '模拟测试' }).click();

  for (const label of ['模拟局数:', '初始注码:', '初始本金:', '下注策略:']) {
    const control = page.getByLabel(label, { exact: true });
    await expect(control).toHaveCount(1);
    await expect(control).toBeVisible();
  }
});
