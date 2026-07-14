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

test('roulette keyboard betting places one chip per activation', async ({ page }) => {
  await page.goto('/#/traditional/games/roulette');

  const seventeen = page.getByRole('button', { name: /直注 17/ });
  const red = page.getByRole('button', { name: '红色', exact: true });
  const firstDozen = page.getByRole('button', { name: '第一打 1 到 12', exact: true });

  await expect(seventeen).toHaveCount(1);
  await expect(red).toHaveCount(1);
  await expect(firstDozen).toHaveCount(1);

  await seventeen.focus();
  await page.keyboard.press('Enter');
  await expect(seventeen).toHaveAccessibleName(/直注 17，当前下注 \$100/);

  await page.keyboard.press('Space');
  await expect(seventeen).toHaveAccessibleName(/直注 17，当前下注 \$200/);
});

test('custom stake labels primary', async ({ page }) => {
  const customStakeLabels = [
    { route: '/#/traditional/games/baccarat', label: '自定义下注金额' },
    { route: '/#/traditional/games/blackjack', label: '自定义下注金额' },
    { route: '/#/traditional/games/roulette', label: '自定义下注金额' },
    { route: '/#/traditional/games/slot-machine', label: '自定义每线注额' },
  ] as const;

  for (const { route, label } of customStakeLabels) {
    await page.goto(route);
    const customStake = page.getByLabel(label, { exact: true });
    await expect(customStake).toHaveCount(1);
    await expect(customStake).toBeVisible();
  }
});

test('primary games expose one live status with the current balance', async ({ page }) => {
  const routes = [
    '/#/traditional/games/baccarat',
    '/#/traditional/games/blackjack',
    '/#/traditional/games/roulette',
  ] as const;

  for (const route of routes) {
    await page.goto(route);

    const liveStatus = page.getByRole('status');
    await expect(liveStatus).toHaveCount(1);
    await expect(liveStatus).toContainText('余额');
  }
});

test('dice and slot games expose one live status with the current balance', async ({ page }) => {
  for (const gameId of ['slot-machine', 'sic-bo', 'craps']) {
    await page.goto(`/#/traditional/games/${gameId}`);
    const status = page.getByRole('status');
    await expect(status).toHaveCount(1);
    await expect(status).toContainText('余额');
  }
});

test('card comparison games expose one live status with the current balance', async ({ page }) => {
  for (const gameId of ['dragon-tiger', 'three-card']) {
    await page.goto(`/#/traditional/games/${gameId}`);
    const status = page.getByRole('status');
    await expect(status).toHaveCount(1);
    await expect(status).toContainText('余额');
  }
});

test('remaining custom stake controls have unique accessible labels', async ({ page }) => {
  const routes = [
    '/#/traditional/games/craps',
    '/#/traditional/games/dragon-tiger',
    '/#/traditional/games/three-card',
    '/#/traditional/games/sic-bo',
  ] as const;

  for (const route of routes) {
    await page.goto(route);

    const customStake = page.getByLabel('自定义下注金额', { exact: true });
    await expect(customStake).toHaveCount(1);
    await expect(customStake).toBeVisible();

    const accessibility = await new AxeBuilder({ page }).analyze();
    const labelViolations = accessibility.violations
      .filter(({ id }) => id.includes('label'))
      .map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.flatMap((node) => node.target).slice(0, 12),
      }));
    expect(labelViolations).toEqual([]);
  }
});
