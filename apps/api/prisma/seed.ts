import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

function encryptSensitive(value: string) {
  const material = process.env.FIELD_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'development-only-change-this-secret';
  const key = createHash('sha256').update(material).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

async function main() {
  const passwordHash = await hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { role: 'SYSTEM_ADMIN', status: 'ACTIVE' },
    create: {
      username: 'admin',
      passwordHash,
      displayName: '系统管理员',
      role: 'SYSTEM_ADMIN',
    },
  });

  const existingPm = await prisma.projectManager.findFirst({ where: { displayName: '林知夏' } });
  const pm = existingPm
    ? await prisma.projectManager.update({
      where: { id: existingPm.id },
      data: { department: '项目部', status: 'ACTIVE' },
    })
    : await prisma.projectManager.create({
      data: { displayName: '林知夏', department: '项目部', status: 'ACTIVE' },
    });

  const supporter = await prisma.organization.upsert({
    where: { organizationCode: 'SUP-0001' },
    update: {},
    create: {
      organizationCode: 'SUP-0001',
      name: '远川医学公益基金会',
      normalizedName: '远川医学公益基金会',
      platform: '公益合作平台',
      normalizedPlatform: '公益合作平台',
      ownerUserId: pm.id,
      contactName: '周老师',
      contactPhone: '138****7031',
      roles: { create: { roleType: 'SUPPORTER' } },
    },
  });

  const executor = await prisma.organization.upsert({
    where: { organizationCode: 'EXE-0001' },
    update: {},
    create: {
      organizationCode: 'EXE-0001',
      name: '知行健康传播中心',
      normalizedName: '知行健康传播中心',
      platform: '执行伙伴平台',
      normalizedPlatform: '执行伙伴平台',
      ownerUserId: pm.id,
      contactName: '陈经理',
      contactPhone: '139****2256',
      roles: { create: { roleType: 'EXECUTOR' } },
    },
  });

  const project = await prisma.project.upsert({
    where: { projectCode: 'PRJ-2026-001' },
    update: { platformAbbreviation: 'GY', pmName: pm.displayName, pmUserId: pm.id, projectType: '公益项目', periodMonths: 10, executionCost: '430000.00' },
    create: {
      projectCode: 'PRJ-2026-001',
      platform: '公益合作平台',
      platformAbbreviation: 'GY',
      publishedOn: new Date('2026-03-01'),
      name: '基层呼吸健康能力提升项目',
      nature: '公益支持',
      projectType: '公益项目',
      periodMonths: 10,
      approvedAmount: '800000.00',
      executionCost: '430000.00',
      pmName: pm.displayName,
      pmUserId: pm.id,
      status: 'ACTIVE',
    },
  });
  await prisma.contract.upsert({
    where: { contractNo: 'SUP-2026-001' },
    update: {},
    create: {
      contractNo: 'SUP-2026-001',
      projectId: project.id,
      contractDirection: 'RECEIVABLE',
      contractType: 'SUPPORT',
      contractEntity: '示例业务主体',
      counterpartyId: supporter.id,
      amount: '800000.00',
      signedOn: new Date('2026-03-08'),
      status: 'SIGNED',
    },
  });

  await prisma.contract.upsert({
    where: { contractNo: 'EXE-2026-001' },
    update: {},
    create: {
      contractNo: 'EXE-2026-001',
      projectId: project.id,
      contractDirection: 'PAYABLE',
      contractType: 'EXECUTION',
      contractEntity: '示例业务主体',
      counterpartyId: executor.id,
      amount: '350000.00',
      signedOn: new Date('2026-03-15'),
      status: 'SIGNED',
    },
  });

  const account = await prisma.bankAccount.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      accountName: '示例业务主体',
      bankName: '示例银行上海分行',
      accountNumberEncrypted: 'demo-encrypted-account',
      accountNumberMasked: '**** **** **** 2026',
    },
  });

  const receipt = await prisma.bankTransaction.upsert({
    where: { sourceRowHash: 'seed-receipt-001' },
    update: {},
    create: {
      bankAccountId: account.id,
      transactionNo: 'BANK-IN-20260320-001',
      transactionAt: new Date('2026-03-20T02:18:00Z'),
      counterpartyName: supporter.name,
      direction: 'IN',
      amount: '600000.00',
      nature: '项目支持款',
      matchStatus: 'MATCHED',
      sourceType: 'MANUAL',
      sourceRowHash: 'seed-receipt-001',
    },
  });

  const receiptAllocation = await prisma.bankAllocation.findFirst({
    where: { bankTransactionId: receipt.id, projectId: project.id, category: 'SUPPORT_RECEIPT' },
  });
  if (!receiptAllocation) {
    await prisma.bankAllocation.create({
      data: {
        bankTransactionId: receipt.id,
        projectId: project.id,
        category: 'SUPPORT_RECEIPT',
        allocatedAmount: '600000.00',
        status: 'CONFIRMED',
        confirmedBy: admin.id,
        confirmedAt: new Date(),
      },
    });
  }

  await prisma.invoice.upsert({
    where: { invoiceCode_invoiceNumber: { invoiceCode: '0310026001', invoiceNumber: '00000126' } },
    update: {},
    create: {
      invoiceCode: '0310026001',
      invoiceNumber: '00000126',
      projectId: project.id,
      issuedOn: new Date('2026-03-22'),
      invoiceType: '增值税普通发票',
      invoicePlatform: '电子税务平台',
      buyerName: supporter.name,
      amountExcludingTax: '471698.11',
      taxRate: '0.06',
      taxAmount: '28301.89',
      totalAmount: '500000.00',
      kind: 'BLUE',
      status: 'NORMAL',
    },
  });

  const person = await prisma.person.upsert({
    where: { idNumberHash: 'demo-expert-hash-001' },
    update: {},
    create: {
      name: '顾明远',
      phoneEncrypted: 'demo-encrypted-phone',
      phoneMasked: '138****1098',
      idNumberEncrypted: 'demo-encrypted-id',
      idNumberHash: 'demo-expert-hash-001',
      idNumberMasked: '310***********103X',
      email: 'expert@example.org',
      organizationName: '市第一人民医院',
      department: '呼吸科',
      position: '科室主任',
    },
  });
  const demoExpertBankAccount = '6222000012346218';
  await prisma.expertProfile.upsert({
    where: { personId: person.id },
    update: {
      bankName: '示例银行',
      bankAccountEncrypted: encryptSensitive(demoExpertBankAccount),
      bankAccountMasked: '**** **** **** 6218',
    },
    create: {
      personId: person.id,
      professionalTitle: '主任医师',
      bankName: '示例银行',
      bankAccountEncrypted: encryptSensitive(demoExpertBankAccount),
      bankAccountMasked: '**** **** **** 6218',
      formOwnerId: pm.id,
      reviewerId: admin.id,
      reviewStatus: 'APPROVED',
    },
  });

  const committee = await prisma.committee.upsert({
    where: { committeeCode: 'COM-RESP-01' },
    update: {},
    create: {
      committeeCode: 'COM-RESP-01',
      name: '呼吸健康专业委员会',
      establishedOn: new Date('2026-01-18'),
      ownerUserId: pm.id,
    },
  });
  const membership = await prisma.membership.findFirst({
    where: { committeeId: committee.id, memberName: '启明医学中心' },
  });
  const member = membership ?? await prisma.membership.create({
    data: {
      committeeId: committee.id,
      memberName: '启明医学中心',
      memberType: '单位会员',
      pmUserId: pm.id,
      joinedOn: new Date('2026-01-20'),
    },
  });
  await prisma.memberDue.upsert({
    where: { dueCode: 'DUE-2026-001' },
    update: {},
    create: {
      membershipId: member.id,
      dueCode: 'DUE-2026-001',
      periodLabel: '2026 年度',
      amountDue: '10000.00',
      dueOn: new Date('2026-04-30'),
    },
  });

  console.info('Seed complete. Login: admin / Admin123!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
