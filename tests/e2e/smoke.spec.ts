import { expect, test } from '@playwright/test';

const gameNames = ['百家乐', '二十一点', '轮盘', '老虎机', '骰宝', '龙虎斗', '三公', '花旗骰'];

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test('lobby exposes all games and two playable smoke flows stay stable', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '赌场教育模拟器' })).toBeVisible();
  for (const gameName of gameNames) {
    await expect(page.getByRole('button', { name: new RegExp(gameName) })).toBeVisible();
  }

  await page.getByRole('button', { name: /百家乐/ }).click();
  await expect(page.getByRole('heading', { name: '百家乐 (Baccarat)' })).toBeVisible();
  await page.getByRole('button', { name: '?' }).click();
  await expect(page.getByRole('heading', { name: '游戏指南 & 规则' })).toBeVisible();
  await page.getByRole('button', { name: '×' }).click();
  await expect(page.getByRole('heading', { name: '游戏指南 & 规则' })).toBeHidden();
  await page.getByPlaceholder('自定义').fill('50');
  await page.getByRole('button', { name: /闲 PLAYER/ }).click();
  await page.getByRole('button', { name: '发牌' }).click();
  await expect(page.getByText('当前余额:')).toBeVisible();
  await expect(page.getByText('当前下注:')).toBeVisible();
  await page.getByRole('button', { name: '← 返回大厅' }).click();
  await expect(page.getByRole('heading', { name: '赌场教育模拟器' })).toBeVisible();

  await page.getByRole('button', { name: /老虎机/ }).click();
  await expect(page.getByRole('heading', { name: '老虎机 (Slot Machine)' })).toBeVisible();
  await page.getByRole('button', { name: '?' }).click();
  await expect(page.getByRole('heading', { name: '🎰 老虎机规则' })).toBeVisible();
  await page.getByRole('button', { name: '×' }).click();
  await expect(page.getByRole('heading', { name: '🎰 老虎机规则' })).toBeHidden();
  await page.getByPlaceholder('自定义').fill('2');
  await page.getByRole('button', { name: /旋转/ }).click();
  await expect(page.getByText('余额').first()).toBeVisible();
  await page.getByRole('button', { name: '← 返回大厅' }).click();
  await expect(page.getByRole('heading', { name: '赌场教育模拟器' })).toBeVisible();
});
