export const formatMoney = (value: string | number | undefined) =>
  new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 }).format(Number(value ?? 0));

export const formatDate = (value: string | undefined, withTime = false) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', withTime
    ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
};

export const formatProjectPeriod = (months: number) =>
  months % 12 === 0 ? `${months / 12} 年` : `${months} 月`;

export const statusLabels: Record<string, string> = {
  ACTIVE: '进行中', CLOSED: '已结项', ABORTED: '已中止', INACTIVE: '已停用',
  UNARCHIVED: '未归档', ARCHIVED: '已归档',
  SIGNED: '已签署', TERMINATED: '已终止', VOID: '已作废', NORMAL: '正常',
  MATCHED: '已匹配', PARTIAL: '部分匹配', UNMATCHED: '待匹配', EXCLUDED: '已作废',
  PENDING: '待复核', APPROVED: '已通过', REJECTED: '已退回',
  CONFIRMED: '已确认', REVERSED: '已撤销', PAID: '已缴清', UNPAID: '未缴', WAIVED: '已免除',
  SUPPORT: '支持协议', EXECUTION: '执行协议', RECEIVABLE: '应收', PAYABLE: '应付',
  IN: '收入', OUT: '支出', BLUE: '蓝票', RED: '红票', ISSUED: '已开票', RECEIVED: '已收票',
  SUPPORT_RECEIPT: '支持款收入', MEMBER_DUE: '会费收入', EXECUTION_PAYMENT: '执行款支出', EXPERT_FEE: '专家费支出', OTHER: '其他',
  COLLECTED: '已归集', COLLECTION_PENDING: '待归集', NOT_APPLICABLE: '无需归集',
  SUPPORT_RECEIPT_ISSUED: '支持款收入票据', MEMBER_DUE_ISSUED: '会费收入票据',
  EXECUTION_PAYMENT_RECEIVED: '执行款支出票据', EXPERT_FEE_RECEIVED: '专家费支出票据',
};
