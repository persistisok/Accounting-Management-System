import { expect, test } from '@playwright/test';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('用户名').fill('admin');
  await page.getByLabel('密码').fill('Admin123!');
  await page.getByRole('button', { name: /登录/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: '先处理差额，再推进项目' })).toBeVisible();
}

test('登录后可查看项目资金轨道和来源金额', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: '项目台账' }).click();
  await expect(page.getByRole('heading', { name: '项目台账' })).toBeVisible();
  await page.getByText('基层呼吸健康能力提升项目').first().click();
  await expect(page.getByText('项目资金轨道')).toBeVisible();
  await expect(page.getByText('支持协议').first()).toBeVisible();
  await expect(page.getByText('已收支持款')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/business-ledger-project.png', fullPage: true });
});

test('移动端导航可访问八类台账', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole('button', { name: '打开导航' }).click();
  await expect(page.getByRole('link', { name: '银行日记账' })).toBeVisible();
  await page.getByRole('link', { name: '专家库' }).click();
  await expect(page.getByRole('heading', { name: '专家库' })).toBeVisible();
  await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/business-ledger-mobile.png', fullPage: true });
});

test('新建项目弹窗覆盖完整视口且表单可滚动', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  await page.getByRole('link', { name: '项目台账' }).click();
  await page.getByRole('button', { name: '新建项目' }).click();

  await expect(page.getByRole('dialog', { name: '新建项目' })).toBeVisible();
  await expect(page.locator('input[name="pmName"]')).toHaveCount(0);
  await expect(page.locator('select[name="pmUserId"]')).toHaveCount(1);
  await expect(page.locator('input[name="periodValue"]')).toHaveCount(1);
  await expect(page.locator('select[name="periodUnit"]')).toHaveCount(1);
  await expect(page.locator('input[name="executionCost"]')).toHaveCount(1);
  await expect(page.locator('input[name="period"], input[name="periodStart"], input[name="periodEnd"], input[name="executionBudget"]')).toHaveCount(0);
  await expect(page.getByRole('dialog').locator('input[placeholder], textarea[placeholder]')).toHaveCount(0);
  const backdrop = page.locator('.modal-backdrop');
  const box = await backdrop.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.width).toBe(viewport?.width);
  expect(box?.height).toBe(viewport?.height);
  const saveButton = page.getByRole('button', { name: '保存项目' });
  await expect(saveButton).toBeVisible();
  await expect(saveButton).toBeInViewport();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/business-ledger-new-project-modal.png' });
});

test('管理员可以维护 PM 且停用后不再进入项目下拉框', async ({ page }) => {
  const suffix = Date.now();
  const username = `pm.e2e.${suffix}`;
  const displayName = `测试经理${String(suffix).slice(-4)}`;
  await login(page);
  await page.getByRole('link', { name: 'PM 管理' }).click();
  await page.getByRole('button', { name: '新增 PM' }).click();
  await page.getByLabel('姓名').fill(displayName);
  await page.getByLabel('登录用户名').fill(username);
  await page.getByLabel('所属部门').fill('测试项目部');
  await page.getByLabel('初始密码').fill('PmTest123!');
  await page.getByRole('button', { name: '创建 PM' }).click();

  const row = page.getByRole('row').filter({ hasText: username });
  await expect(row).toContainText(displayName);
  await page.screenshot({ path: '/tmp/business-ledger-project-managers.png', fullPage: true });
  await row.getByRole('button', { name: '删除' }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(row).toContainText('已停用');

  await page.getByRole('link', { name: '项目台账' }).click();
  await page.getByRole('button', { name: '新建项目' }).click();
  await expect(page.locator('select[name="pmUserId"] option', { hasText: displayName })).toHaveCount(0);
});
