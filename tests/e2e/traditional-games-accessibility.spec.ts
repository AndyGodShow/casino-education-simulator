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

const traditionalGames = [
  { id: 'baccarat', heading: '百家乐 (Baccarat)', stakeLabel: '自定义下注金额' },
  { id: 'blackjack', heading: '二十一点 (Blackjack)', stakeLabel: '自定义下注金额' },
  { id: 'roulette', heading: '轮盘 (Roulette)', stakeLabel: '自定义下注金额' },
  { id: 'slot-machine', heading: '老虎机 (Slot Machine)', stakeLabel: '自定义每线注额' },
  { id: 'sic-bo', heading: '骰宝 (Sic Bo)', stakeLabel: '自定义下注金额' },
  { id: 'dragon-tiger', heading: '龙虎斗 (Dragon Tiger)', stakeLabel: '自定义下注金额' },
  { id: 'three-card', heading: '三公 (San Gong)', stakeLabel: '自定义下注金额' },
  { id: 'craps', heading: '花旗骰 (Craps)', stakeLabel: '自定义下注金额' },
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

test('all traditional games pass Axe in game and simulation modes', async ({ page }) => {
  for (const game of traditionalGames) {
    await page.goto(`/#/traditional/games/${game.id}`);
    await expect(page.getByRole('heading', { name: game.heading })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: '模拟测试' }).click();
    await expect(page.getByLabel('模拟局数:', { exact: true })).toBeVisible();
    await expectNoAxeViolations(page);
  }
});

test('every game supports a keyboard stake and primary-action journey', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const game of traditionalGames) {
    await page.goto(`/#/traditional/games/${game.id}`);
    await expect(page.getByRole('heading', { name: game.heading })).toBeVisible();

    const status = page.getByRole('status');
    const stake = page.getByLabel(game.stakeLabel, { exact: true });
    await stake.focus();
    await page.keyboard.press('ControlOrMeta+A');
    const stakeValue = game.id === 'slot-machine' ? '1' : '10';
    await page.keyboard.type(stakeValue);
    await expect(stake).toHaveValue(stakeValue);

    let primaryAction = page.getByRole('button', { name: /旋转/ });
    switch (game.id) {
      case 'baccarat':
        await page.getByRole('button', { name: /闲 PLAYER/ }).focus();
        await page.keyboard.press('Enter');
        primaryAction = page.getByRole('button', { name: '发牌', exact: true });
        break;
      case 'blackjack':
        await page.getByRole('button', { name: '确认下注' }).focus();
        await page.keyboard.press('Enter');
        primaryAction = page.getByRole('button', { name: /发牌 \(DEAL\)/ });
        break;
      case 'roulette':
        await page.getByRole('button', { name: /直注 17/ }).focus();
        await page.keyboard.press('Enter');
        primaryAction = page.getByRole('button', { name: '开始支付 / 旋转' });
        break;
      case 'slot-machine':
        primaryAction = page.getByRole('button', { name: /旋转/ });
        break;
      case 'sic-bo':
        await page.getByRole('button', { name: /^小/ }).first().focus();
        await page.keyboard.press('Enter');
        primaryAction = page.getByRole('button', { name: /掷骰/ });
        break;
      case 'dragon-tiger':
        await page.getByRole('button', { name: /^龙.*1:1/ }).focus();
        await page.keyboard.press('Enter');
        primaryAction = page.getByRole('button', { name: /发牌/ });
        break;
      case 'three-card':
        await page.getByRole('button', { name: /^闲赢.*1:1/ }).focus();
        await page.keyboard.press('Enter');
        primaryAction = page.getByRole('button', { name: /发牌/ });
        break;
      case 'craps':
        await page.getByRole('button', { name: /^过线注/ }).focus();
        await page.keyboard.press('Enter');
        primaryAction = page.getByRole('button', { name: /掷骰/ });
        break;
    }

    const preActionStatus = await status.innerText();
    await primaryAction.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => status.innerText()).not.toBe(preActionStatus);
  }
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

test('slot reduced motion skips JS and CSS reel animation', async ({ page }) => {
  await page.addInitScript(() => {
    const trackedWindow = window as typeof window & {
      __slotMotionCalls: { interval: number; raf: number };
    };
    const nativeInterval = window.setInterval.bind(window);
    const nativeRaf = window.requestAnimationFrame.bind(window);
    trackedWindow.__slotMotionCalls = { interval: 0, raf: 0 };
    window.setInterval = ((...args: Parameters<typeof window.setInterval>) => {
      trackedWindow.__slotMotionCalls.interval += 1;
      return nativeInterval(...args);
    }) as typeof window.setInterval;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      trackedWindow.__slotMotionCalls.raf += 1;
      return nativeRaf(callback);
    }) as typeof window.requestAnimationFrame;
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/traditional/games/slot-machine');
  await page.evaluate(() => {
    (window as typeof window & { __slotMotionCalls: { interval: number; raf: number } })
      .__slotMotionCalls = { interval: 0, raf: 0 };
  });
  await page.getByRole('button', { name: /旋转/ }).click();
  await expect(page.getByRole('status')).toContainText(/赢得|未中奖/, { timeout: 5_000 });
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __slotMotionCalls: { interval: number; raf: number } }
  ).__slotMotionCalls)).toEqual({ interval: 0, raf: 0 });
  await expect(page.locator('[class*="light"]').first()).toHaveCSS('animation-name', 'none');
});

test('mobile touch targets keep a 44 pixel baseline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/traditional/games/roulette');

  const targets = [
    page.getByRole('button', { name: '← 返回大厅' }),
    page.getByRole('button', { name: /直注 17/ }),
    page.getByRole('button', { name: '街注 1 到 3', exact: true }),
    page.getByRole('button', { name: '重置余额并清空当前局' }),
  ];

  for (const target of targets) {
    await expect(target).toBeVisible();
    const box = await target.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }

  await page.goto('/#/traditional/games/slot-machine');
  const slotPreset = page.getByRole('button', { name: '1', exact: true }).first();
  await expect(slotPreset).toBeVisible();
  const slotPresetBox = await slotPreset.boundingBox();
  expect(slotPresetBox?.width).toBeGreaterThanOrEqual(44);
  expect(slotPresetBox?.height).toBeGreaterThanOrEqual(44);
});

test('card and craps simulation labels target their controls', async ({ page }) => {
  const games = [
    { gameId: 'craps', heading: /花旗骰/ },
    { gameId: 'dragon-tiger', heading: /龙虎斗/ },
    { gameId: 'three-card', heading: /三公/ },
  ] as const;

  for (const { gameId, heading } of games) {
    await page.goto(`/#/traditional/games/${gameId}`);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await page.getByRole('button', { name: '模拟测试' }).click();

    const progressionStrategy = page.getByLabel('加注策略:', { exact: true });
    await expect(progressionStrategy).toHaveCount(1);
    await expect(progressionStrategy).toBeVisible();
    await expectNoAxeViolations(page);
  }
});

test('sic bo and slot simulation labels target their controls', async ({ page }) => {
  const games = [
    { gameId: 'sic-bo', heading: /骰宝/, label: '加注策略:' },
    { gameId: 'slot-machine', heading: /老虎机/, label: '赔付线数:' },
  ] as const;

  for (const { gameId, heading, label } of games) {
    await page.goto(`/#/traditional/games/${gameId}`);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await page.getByRole('button', { name: '模拟测试' }).click();

    const extraControl = page.getByLabel(label, { exact: true });
    await expect(extraControl).toHaveCount(1);
    await expect(extraControl).toBeVisible();
    await expectNoAxeViolations(page);
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
