import { expect, test } from '@playwright/test';

test('desktop match detail surface fills the full two-column layout', async ({ page }) => {
  await page.route('**/api/world-cup/data', (route) => route.fulfill({
    status: 502,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: 'layout test fallback' }),
  }));
  await page.route('**/api/world-cup/research', (route) => route.fulfill({
    status: 502,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: 'layout test fallback' }),
  }));
  await page.route(/raw\.githubusercontent\.com|api\.github\.com|cdn\.jsdelivr\.net/, (route) =>
    route.abort());

  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto('/#/sports/football/world-cup-2026');
  await expect(page.getByRole('heading', { name: '世界杯比赛中心' })).toBeVisible();

  const metrics = await page
    .locator('main > section[aria-label="世界杯比赛列表与详情"]')
    .evaluate((center) => {
      const [listPanel, detailPanel] = Array.from(center.children);
      const listRect = listPanel.getBoundingClientRect();
      const detailRect = detailPanel.getBoundingClientRect();
      const detailStyle = getComputedStyle(detailPanel);

      return {
        listHeight: listRect.height,
        detailHeight: detailRect.height,
        detailMaxHeight: detailStyle.maxHeight,
        detailOverflowY: detailStyle.overflowY,
      };
    });

  expect(metrics.detailHeight).toBeGreaterThanOrEqual(metrics.listHeight - 1);
  expect(metrics.detailMaxHeight).toBe('none');
  expect(metrics.detailOverflowY).not.toBe('auto');
});
