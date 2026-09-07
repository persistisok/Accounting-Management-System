export type ArchiveRequirement = 'REQUIRED' | 'CONDITIONAL' | 'OPTIONAL';

export interface ArchiveChecklistDefinition {
  key: string;
  label: string;
  requirement: ArchiveRequirement;
  condition?: string;
}

export const archiveChecklistDefinitions: ArchiveChecklistDefinition[] = [
  { key: 'PROJECT_APPLICATION', label: '立项申请', requirement: 'REQUIRED' },
  { key: 'PROJECT_PLAN', label: '项目方案', requirement: 'REQUIRED' },
  { key: 'BOARD_RESOLUTION', label: '理事会决议', requirement: 'CONDITIONAL', condition: '基金会项目金额达到或超过 15 万元时所需' },
  { key: 'PROJECT_INTRODUCTION', label: '项目介绍（官媒/网站发布）', requirement: 'REQUIRED' },
  { key: 'MEETING_INVITATION', label: '会议支持函、邀请函、日程', requirement: 'REQUIRED' },
  { key: 'SUPPORT_AGREEMENT', label: '捐赠协议/支持协议', requirement: 'REQUIRED' },
  { key: 'SUPPORT_INVOICE', label: '捐赠协议对应捐赠票据/支持协议对应发票', requirement: 'REQUIRED' },
  { key: 'SUPPLIER_SELECTION', label: '供应商遴选结果文件', requirement: 'REQUIRED' },
  { key: 'EXECUTION_AGREEMENT', label: '委托执行协议', requirement: 'REQUIRED' },
  { key: 'EXECUTION_INVOICE', label: '委托执行协议对应发票', requirement: 'REQUIRED' },
  { key: 'PROFESSIONAL_SELECTION', label: '专业人士遴选报告', requirement: 'CONDITIONAL', condition: '线下会议项目无需' },
  { key: 'EXPERT_PPT', label: '专家分享 PPT', requirement: 'REQUIRED' },
  { key: 'SIGN_IN_SHEET', label: '签到表', requirement: 'REQUIRED' },
  { key: 'MEETING_PROCESS', label: '会议过程文件（现场照片）', requirement: 'REQUIRED' },
  { key: 'EXPERT_EVIDENCE', label: '专家服务佐证图（每人 4 张）', requirement: 'REQUIRED' },
  { key: 'EXPERT_AGREEMENT', label: '专家劳务协议', requirement: 'REQUIRED' },
  { key: 'EXPERT_INVOICE', label: '专家劳务费发票', requirement: 'REQUIRED' },
  { key: 'VENUE_EVIDENCE', label: '场地类佐证材料', requirement: 'REQUIRED' },
  { key: 'EQUIPMENT_EVIDENCE', label: '设备类佐证材料', requirement: 'REQUIRED' },
  { key: 'TRANSPORT_EVIDENCE', label: '交通类佐证材料', requirement: 'REQUIRED' },
  { key: 'ACCOMMODATION_EVIDENCE', label: '住宿类佐证材料', requirement: 'REQUIRED' },
  { key: 'CATERING_EVIDENCE', label: '餐饮类佐证材料', requirement: 'REQUIRED' },
  { key: 'PUBLICITY_EVIDENCE', label: '宣传类佐证材料', requirement: 'REQUIRED' },
  { key: 'PM_SUPERVISION', label: 'PM 监督材料', requirement: 'CONDITIONAL', condition: '外地线下会议无需' },
  { key: 'SATISFACTION_SURVEY', label: '满意度调查问卷', requirement: 'REQUIRED' },
  { key: 'CLOSING_REPORT', label: '结项报告', requirement: 'REQUIRED' },
  { key: 'SETTLEMENT_STATEMENT', label: '结算单', requirement: 'REQUIRED' },
  { key: 'SPECIAL_AUDIT', label: '专项审计报告', requirement: 'CONDITIONAL', condition: '项目总金额超过 500 万元时所需' },
  { key: 'PROJECT_SUMMARY', label: '项目总结报告', requirement: 'REQUIRED' },
  { key: 'OTHER', label: '其他', requirement: 'OPTIONAL' },
];

export const blockingArchiveItemKeys = archiveChecklistDefinitions
  .filter((item) => item.requirement !== 'OPTIONAL')
  .map((item) => item.key);

export function archiveDefinition(key: string) {
  return archiveChecklistDefinitions.find((item) => item.key === key);
}
