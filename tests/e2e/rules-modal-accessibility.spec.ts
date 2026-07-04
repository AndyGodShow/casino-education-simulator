import { expect, test } from '@playwright/test';

test('shared rules modal traps focus and restores it after Escape', async ({ page }) => {
  await page.goto('/#/traditional/games/baccarat');

  const rulesButton = page.getByRole('button', { name: '?' });
  await rulesButton.click();

  const dialog = page.getByRole('dialog', { name: '游戏指南 & 规则' });
  const closeButton = dialog.getByRole('button', { name: /关闭规则弹窗/ });
  await expect(dialog).toBeVisible();
  await expect(closeButton).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(rulesButton).toBeFocused();
});
