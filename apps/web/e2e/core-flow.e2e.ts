import { expect, test } from '@playwright/test';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('用户名').fill('admin');
  await page.getByLabel('密码').fill('Admin123!');
  await page.getByRole('button', { name: /登录/ }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('heading', { name: '项目台账' })).toBeVisible();
}

test('登录后可查看项目资金轨道和来源金额', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: '项目台账' }).click();
  await expect(page.getByRole('heading', { name: '项目台账' })).toBeVisible();
  await expect(page.getByRole('note').getByText('点击项目行可进入详情')).toBeVisible();
  await expect(page.getByRole('note')).toContainText('合同、流水和发票');
  await page.getByRole('row').filter({ hasText: '基层呼吸健康能力提升项目' }).getByRole('button', { name: '查看详情' }).click();
  await expect(page.getByText('项目资金轨道')).toBeVisible();
  await expect(page.getByRole('button', { name: '执行方遴选' })).toHaveCount(0);
  await expect(page.getByText('支持协议').first()).toBeVisible();
  await expect(page.getByText('已收支持款')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/business-ledger-project.png', fullPage: true });
});

test('移动端导航可访问主要台账', async ({ page }) => {
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
  await expect(page.getByRole('dialog').locator('input[placeholder]:not(.date-display):not(.searchable-input), textarea[placeholder]')).toHaveCount(0);
  await expect(page.getByRole('dialog').getByPlaceholder('年/月/日')).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('发布日期')).toHaveValue('');
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

test('新建业务记录的日期默认不选择', async ({ page }) => {
  await login(page);
  const cases = [
    { link: '合同台账', button: '登记合同', dialog: '登记合同', field: '签约日期' },
    { link: '发票台账', button: '登记发票', dialog: '登记发票', field: '开票日期' },
    { link: '专家库', button: '新增专家', dialog: '新增专家', field: '入库时间' },
  ];

  for (const item of cases) {
    await page.getByRole('link', { name: item.link }).click();
    await page.getByRole('button', { name: item.button }).click();
    const dialog = page.getByRole('dialog', { name: item.dialog });
    await expect(dialog.getByLabel(item.field)).toHaveValue('');
    await expect(dialog.getByPlaceholder('年/月/日')).toBeVisible();
    if (item.link === '合同台账') {
      await expect(dialog.locator('.field')).toHaveCount(6);
      const contractType = dialog.locator('select[name="contractType"]');
      await expect(contractType).toHaveValue('SUPPORT');
      await expect(contractType.locator('option')).toHaveText(['支持协议', '执行协议']);
      await expect(dialog.locator('[name="contractNo"], [name="contractDirection"], [name="remark"]')).toHaveCount(0);
      const project = dialog.getByRole('combobox', { name: '关联项目' });
      await project.fill('PRJ-2026-001');
      await expect(dialog.getByRole('option', { name: /PRJ-2026-001/ })).toBeVisible();
      const supporter = dialog.getByRole('combobox', { name: '支持方' });
      await supporter.fill('远川医学');
      await expect(dialog.getByRole('option', { name: /远川医学公益基金会/ })).toBeVisible();
      await contractType.selectOption('EXECUTION');
      const executor = dialog.getByRole('combobox', { name: '执行方' });
      await executor.fill('知行健康');
      await expect(dialog.getByRole('option', { name: /知行健康传播中心/ })).toBeVisible();
    } else if (item.link === '发票台账') {
      await expect(dialog.locator('.field')).toHaveCount(9);
      await expect(dialog.getByLabel('开票类型')).toBeVisible();
      await expect(dialog.getByLabel('开票平台')).toBeVisible();
      await expect(dialog.getByLabel('购买方名称')).toBeVisible();
      const amount = dialog.locator('[name="amountExcludingTax"]');
      const taxRate = dialog.locator('[name="taxRate"]');
      const taxAmount = dialog.locator('[name="taxAmount"]');
      const totalAmount = dialog.locator('[name="totalAmount"]');
      await expect(amount).toBeVisible();
      await expect(taxRate).toBeVisible();
      await expect(taxAmount).toBeVisible();
      await expect(totalAmount).toBeVisible();
      await amount.fill('100');
      await taxRate.fill('6');
      await expect(taxAmount).toHaveValue('6.00');
      await expect(taxAmount).toHaveAttribute('readonly', '');
      await expect(totalAmount).toHaveValue('106.00');
      await expect(totalAmount).toHaveAttribute('readonly', '');
      await expect(dialog.locator('[name="invoiceCode"], [name="invoiceNumber"], [name="kind"], [name="originalInvoiceId"]')).toHaveCount(0);
      const project = dialog.getByRole('combobox', { name: '关联项目' });
      await project.fill('PRJ-2026-001');
      await expect(dialog.getByRole('option', { name: /PRJ-2026-001/ })).toBeVisible();
    }
    await dialog.getByRole('button', { name: '关闭' }).click();
  }
});

test('会员可搜索专委会和 PM 并查看全部会费记录', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: '会员库' }).click();
  await page.getByRole('button', { name: '新增会员' }).click();

  const memberDialog = page.getByRole('dialog', { name: '新增会员' });
  const committee = memberDialog.getByRole('combobox', { name: '所属专委会' });
  await committee.fill('呼吸健康');
  await expect(memberDialog.getByRole('option', { name: /呼吸健康专业委员会/ })).toBeVisible();
  const pm = memberDialog.getByRole('combobox', { name: '负责 PM' });
  await pm.fill('林知夏');
  await expect(memberDialog.getByRole('option', { name: /林知夏/ })).toBeVisible();
  await expect(memberDialog.getByPlaceholder('年/月/日')).toBeVisible();
  await memberDialog.getByRole('button', { name: '关闭' }).click();

  await page.getByRole('row').filter({ hasText: '启明医学中心' }).getByRole('button', { name: '记录' }).click();
  const historyDialog = page.getByRole('dialog', { name: '会费记录' });
  await expect(historyDialog.getByText('DUE-2026-001')).toBeVisible();
  await expect(historyDialog.getByText('test', { exact: true })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/tmp/business-ledger-member-dues.png', fullPage: true });
});

test('银行流水直接选择项目和资金分类并保留中文日期', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: '银行日记账' }).click();
  await page.getByRole('button', { name: '录入流水' }).click();

  const dialog = page.getByRole('dialog', { name: '录入银行流水' });
  const fieldLabels = await dialog.locator('.field > span').allTextContents();
  expect(fieldLabels.slice(0, 2)).toEqual(['收支方向', '资金分类']);
  await expect(dialog.getByLabel('收支方向')).toHaveValue('IN');
  await expect(dialog.getByLabel('资金分类').locator('option')).toHaveText(['支持款收入', '会员会费收入']);
  const ownAccount = dialog.getByRole('combobox', { name: '本方银行账户' });
  await ownAccount.fill('示例银行');
  await dialog.getByRole('option', { name: /示例银行上海分行/ }).click();
  await expect(dialog.locator('select[name="bankAccountId"]')).toHaveValue('00000000-0000-4000-8000-000000000001');
  await expect(dialog.getByText('对方账户', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('银行名称')).toBeVisible();
  await expect(dialog.getByLabel('银行账号')).toBeVisible();
  await expect(dialog.getByLabel('性质')).toBeVisible();
  const project = dialog.getByRole('combobox', { name: '关联项目' });
  await project.fill('PRJ-2026-001');
  await expect(dialog.getByRole('option', { name: /PRJ-2026-001/ })).toBeVisible();
  await expect(dialog.getByLabel('资金分类')).toHaveValue('SUPPORT_RECEIPT');
  await expect(dialog.locator('[name="transactionNo"]')).toHaveCount(0);
  await expect(dialog.getByPlaceholder('年/月/日')).toBeVisible();
  await expect(dialog.getByLabel('交易日期')).toBeVisible();
  await expect(dialog.getByLabel('交易时间')).toHaveAttribute('type', 'time');
  await expect(dialog.locator('input[type="datetime-local"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '分配' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '分配流水' })).toHaveCount(0);

  await dialog.getByLabel('收支方向').selectOption('OUT');
  await expect(dialog.getByLabel('资金分类').locator('option')).toHaveText(['执行款支出', '专家费支出']);
  await dialog.getByLabel('资金分类').selectOption('EXPERT_FEE');
  const expert = dialog.getByRole('combobox', { name: '专家' });
  await expert.fill('顾明远');
  await dialog.getByRole('option', { name: '顾明远' }).click();
  await expect(dialog.getByLabel('对方账户名称')).toHaveValue('顾明远');
  await expect(dialog.getByLabel('银行名称')).toHaveValue('示例银行');
  await expect(dialog.getByLabel('银行账号')).toHaveValue('6222000012346218');
  await dialog.getByLabel('银行名称').fill('修改后的银行');
  await expect(dialog.getByLabel('银行名称')).toHaveValue('修改后的银行');

  await dialog.getByLabel('收支方向').selectOption('IN');
  await dialog.getByLabel('资金分类').selectOption('MEMBER_DUE');
  await expect(dialog.getByRole('combobox', { name: '关联项目' })).toHaveCount(0);
  const member = dialog.getByRole('combobox', { name: '会员' });
  await member.fill('启明医学中心');
  await expect(dialog.getByRole('option', { name: /启明医学中心.*未缴/ })).toBeVisible();
});

test('已匹配银行流水可以编辑和作废', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: '银行日记账' }).click();

  const matchedRow = page.locator('tbody tr').filter({ hasText: '已匹配' }).first();
  await expect(matchedRow).toBeVisible();
  await expect(matchedRow.getByRole('button', { name: '编辑' })).toBeEnabled();
  await expect(matchedRow.getByRole('button', { name: '作废' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '排除' })).toHaveCount(0);

  await matchedRow.getByRole('button', { name: '编辑' }).click();
  await expect(page.getByRole('dialog', { name: '编辑银行流水' })).toBeVisible();
  await expect(page.getByText('先选择收支方向和资金分类，再填写对应业务信息。')).toBeVisible();
});

test('管理员可以增删改查本方银行账户', async ({ page }) => {
  const suffix = String(Date.now());
  const bankName = `端到端测试银行${suffix.slice(-5)}`;
  const updatedName = `${bankName}更新`;
  const accountNumber = `62220000${suffix.slice(-10)}`;
  await login(page);
  await page.getByRole('link', { name: '银行日记账' }).click();
  await page.getByRole('button', { name: '本方账户管理' }).click();

  await page.getByRole('dialog', { name: '本方银行账户' }).getByRole('button', { name: '新增账户' }).click();
  const createDialog = page.getByRole('dialog', { name: '新增本方银行账户' });
  await createDialog.getByLabel('银行名称').fill(bankName);
  await createDialog.getByLabel('银行账号').fill(accountNumber);
  await createDialog.getByRole('button', { name: '保存账户' }).click();

  const manager = page.getByRole('dialog', { name: '本方银行账户' });
  await manager.getByPlaceholder('搜索银行名称或账号尾号').fill(bankName);
  let row = manager.getByRole('row').filter({ hasText: bankName });
  await expect(row).toContainText(accountNumber.slice(-4));
  await row.getByRole('button', { name: '编辑' }).click();

  const editDialog = page.getByRole('dialog', { name: '编辑本方银行账户' });
  await editDialog.getByLabel('银行名称').fill(updatedName);
  await editDialog.getByRole('button', { name: '保存修改' }).click();
  row = page.getByRole('dialog', { name: '本方银行账户' }).getByRole('row').filter({ hasText: updatedName });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: '停用' }).click();
  await page.getByRole('button', { name: '确认停用' }).click();
  await expect(page.getByRole('dialog', { name: '本方银行账户' }).getByRole('row').filter({ hasText: updatedName })).toContainText('已停用');
});

test('管理员可以维护 PM 且停用后不再进入项目下拉框', async ({ page }) => {
  const suffix = Date.now();
  const displayName = `测试经理${String(suffix).slice(-4)}`;
  await login(page);
  await page.getByRole('link', { name: 'PM 管理' }).click();
  await page.getByRole('button', { name: '新增 PM' }).click();
  await page.getByLabel('姓名').fill(displayName);
  await page.getByLabel('所属部门').fill('测试项目部');
  await page.getByRole('button', { name: '创建 PM' }).click();

  const row = page.getByRole('row').filter({ hasText: displayName });
  await expect(row).toContainText(displayName);
  await page.screenshot({ path: '/tmp/business-ledger-project-managers.png', fullPage: true });
  await row.getByRole('button', { name: '停用' }).click();
  await page.getByRole('button', { name: '确认停用' }).click();
  await expect(row).toContainText('已停用');

  await page.getByRole('link', { name: '项目台账' }).click();
  await page.getByRole('button', { name: '新建项目' }).click();
  await expect(page.locator('select[name="pmUserId"] option', { hasText: displayName })).toHaveCount(0);
});

test('访客账号只能查看且不能进入系统管理', async ({ page }) => {
  const suffix = Date.now();
  const username = `guest.e2e.${suffix}`;
  const displayName = `访客${String(suffix).slice(-4)}`;
  await login(page);
  await page.getByRole('link', { name: '账号管理' }).click();
  await page.getByRole('button', { name: '新增账号' }).click();
  const dialog = page.getByRole('dialog', { name: '新增账号' });
  await dialog.getByLabel('姓名').fill(displayName);
  await dialog.getByLabel('登录用户名').fill(username);
  await dialog.getByLabel('初始密码').fill('GuestTest123!');
  await dialog.getByRole('button', { name: '创建账号' }).click();
  await expect(page.getByRole('row').filter({ hasText: username })).toContainText('访客');

  await page.getByRole('button', { name: '退出登录' }).click();
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill('GuestTest123!');
  await page.getByRole('button', { name: /登录/ }).click();
  await expect(page.getByRole('heading', { name: '项目台账' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建项目' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'PM 管理' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '账号管理' })).toHaveCount(0);

  await page.getByRole('button', { name: '退出登录' }).click();
  await login(page);
  await page.getByRole('link', { name: '账号管理' }).click();
  await page.getByPlaceholder('搜索姓名、用户名或绑定 PM').fill(username);
  const guestRow = page.getByRole('row').filter({ hasText: username });
  await guestRow.getByRole('button', { name: '停用' }).click();
  await page.getByRole('button', { name: '确认停用' }).click();
});

test('普通管理员可编辑业务但不能管理账号', async ({ page }) => {
  const suffix = Date.now();
  const username = `admin.e2e.${suffix}`;
  await login(page);
  await page.getByRole('link', { name: '账号管理' }).click();
  await page.getByRole('button', { name: '新增账号' }).click();
  const dialog = page.getByRole('dialog', { name: '新增账号' });
  await dialog.getByLabel('姓名').fill(`普通管理员${String(suffix).slice(-4)}`);
  await dialog.getByLabel('登录用户名').fill(username);
  await dialog.getByLabel('账号类型').selectOption('ADMIN');
  await dialog.getByLabel('初始密码').fill('AdminTest123!');
  await dialog.getByRole('button', { name: '创建账号' }).click();
  await expect(page.getByRole('row').filter({ hasText: username })).toContainText('普通管理员');

  await page.getByRole('button', { name: '退出登录' }).click();
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill('AdminTest123!');
  await page.getByRole('button', { name: /登录/ }).click();
  await expect(page.getByRole('button', { name: '新建项目' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'PM 管理' })).toBeVisible();
  await expect(page.getByRole('link', { name: '账号管理' })).toHaveCount(0);
  await page.goto('/accounts');
  await expect(page).toHaveURL(/\/projects$/);

  await page.getByRole('button', { name: '退出登录' }).click();
  await login(page);
  await page.getByRole('link', { name: '账号管理' }).click();
  await page.getByPlaceholder('搜索姓名、用户名或绑定 PM').fill(username);
  const adminRow = page.getByRole('row').filter({ hasText: username });
  await adminRow.getByRole('button', { name: '停用' }).click();
  await page.getByRole('button', { name: '确认停用' }).click();
});

test('系统管理员可以新增和维护其他系统管理员', async ({ page }) => {
  const suffix = Date.now();
  const username = `system.e2e.${suffix}`;
  await login(page);
  await page.getByRole('link', { name: '账号管理' }).click();
  await page.getByRole('button', { name: '新增账号' }).click();
  const dialog = page.getByRole('dialog', { name: '新增账号' });
  await dialog.getByLabel('姓名').fill(`系统管理员${String(suffix).slice(-4)}`);
  await dialog.getByLabel('登录用户名').fill(username);
  await dialog.getByLabel('账号类型').selectOption('SYSTEM_ADMIN');
  await dialog.getByLabel('初始密码').fill('SystemTest123!');
  await dialog.getByRole('button', { name: '创建账号' }).click();

  const row = page.getByRole('row').filter({ hasText: username });
  await expect(row).toContainText('系统管理员');
  await row.getByRole('button', { name: '编辑' }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑账号' });
  await editDialog.getByLabel('姓名').fill(`系统管理员${String(suffix).slice(-4)}改`);
  await editDialog.getByRole('button', { name: '保存修改' }).click();
  await expect(row).toContainText('改');
  await row.getByRole('button', { name: '停用' }).click();
  await page.getByRole('button', { name: '确认停用' }).click();
  await expect(row).toContainText('已停用');
});
