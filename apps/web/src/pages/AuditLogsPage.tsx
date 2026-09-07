import { useQuery } from '@tanstack/react-query';
import { Eye, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { DateInput, Input, SearchableSelect } from '../components/FormControls';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_PAGE_SIZE, Pagination } from '../components/Pagination';
import { ErrorState, LoadingState } from '../components/States';
import { api, queryString } from '../lib/api';
import { formatMoney, statusLabels } from '../lib/format';
import type { AuditFilterOptions, AuditLog, ListResponse } from '../lib/types';

const actionLabels: Record<string, string> = {
  CREATE: '新增', UPDATE: '修改', DELETE: '删除/停用', VOID: '作废', UPLOAD: '上传附件', DOWNLOAD: '下载附件', DELETE_ATTACHMENT: '删除附件', COLLECT: '确认归集', EXPORT: '导出', EXPORT_SENSITIVE: '导出完整信息', LOGIN: '登录', VIEW_SENSITIVE: '查看敏感信息', REORDER: '调整顺序',
  REQUEST_STATUS_REVIEW: '提交结项/中止申请', REVIEW_PROJECT_STATUS: '复核结项/中止申请', REQUEST_ARCHIVE_REVIEW: '提交归档申请', REVIEW_PROJECT_ARCHIVE: '复核归档申请', SUBMIT_ARCHIVE_ITEM: '提交归档材料', SUBMIT_ARCHIVE_NA: '标记材料不适用', REVIEW_ARCHIVE_ITEM: '复核归档材料',
};
const objectLabels: Record<string, string> = {
  PROJECT: '项目', PROJECT_ARCHIVE_ITEM: '归档材料', CONTRACT: '合同', BANK_TRANSACTION: '银行流水', BANK_ACCOUNT: '本方银行账户', BANK_EXPERT_REPORT: '专家费导入结果', INVOICE: '发票', DONATION_RECEIPT: '捐赠票据', MEMBERSHIP: '会员', MEMBER_DUE: '会费', COMMITTEE: '专委会', EXPERT: '专家', EXPERT_CREDENTIAL: '专家资质附件', ORGANIZATION: '机构', SERVICE_CAPABILITY: '服务能力', ACCOUNT: '账号', PROJECT_MANAGER: 'PM', BUSINESS_LICENSE: '营业执照', COMMITMENT_LETTER: '承诺书', LEGAL_REP_ID: '法人身份证复印件',
};
const moduleLabels: Record<string, string> = {
  PROJECT: '项目台账', PROJECT_ARCHIVE_ITEM: '项目台账 · 归档清单', CONTRACT: '合同台账', BANK_TRANSACTION: '银行日记账', BANK_ACCOUNT: '银行账户管理', BANK_EXPERT_REPORT: '银行日记账 · 专家费',
  INVOICE: '发票台账', DONATION_RECEIPT: '发票台账 · 捐赠票据', MEMBERSHIP: '会员库', MEMBER_DUE: '会员库 · 会费', COMMITTEE: '会员库 · 专委会', EXPERT: '专家库', EXPERT_CREDENTIAL: '专家库 · 资质附件',
  ORGANIZATION: '支持方库 / 执行方库', SERVICE_CAPABILITY: '执行方库 · 服务能力', ACCOUNT: '账号管理', PROJECT_MANAGER: 'PM 管理',
  BUSINESS_LICENSE: '执行方库 · 营业执照', COMMITMENT_LETTER: '执行方库 · 承诺书', LEGAL_REP_ID: '执行方库 · 法人身份证',
};
const fieldLabels: Record<string, string> = {
  projectCode: '项目编码', projectId: '项目', name: '名称', contractNo: '合同编号', contractType: '合同类型', amount: '金额', totalAmount: '价税合计', amountExcludingTax: '金额', taxAmount: '税额', taxRate: '税率',
  donorName: '捐赠人', issuedOn: '发票日期', invoiceType: '发票类型', invoicePlatform: '开票平台', sellerName: '销售方名称', memberName: '会员姓名', dueCode: '会费编号', committeeName: '专委会',
  organizationCode: '机构编号', displayName: '姓名', username: '用户名', fileName: '文件名', status: '状态', reviewStatus: '复核状态', decision: '复核结果', reason: '原因', itemKey: '归档材料', rowCount: '记录数', attachmentCount: '附件数',
};

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [filters, setFilters] = useState({ q: '', actorUserId: '', action: '', objectType: '', occurredFrom: '', occurredTo: '' });
  const [draft, setDraft] = useState(filters);
  const logs = useQuery({ queryKey: ['audit-logs', filters, page], queryFn: () => api.get<ListResponse<AuditLog>>(`/audit-logs${queryString({ ...filters, page, pageSize: DEFAULT_PAGE_SIZE })}`) });
  const options = useQuery({ queryKey: ['audit-log-options'], queryFn: () => api.get<AuditFilterOptions>('/audit-logs/filter-options') });
  const columns: TableColumn<AuditLog>[] = [
    { key: 'time', label: '操作时间', render: (row) => <span className="audit-time">{formatDateTime(row.occurredAt)}</span> },
    { key: 'actor', label: '操作人', render: (row) => <span className="primary-cell"><strong>{row.actor?.displayName ?? '系统/已删除账号'}</strong><small>{row.actor ? `@${row.actor.username}` : '—'}</small></span> },
    { key: 'action', label: '操作类型', render: (row) => <span className="audit-action">{actionLabels[row.action] ?? row.action}</span> },
    { key: 'object', label: '业务对象', render: (row) => <span className="primary-cell"><strong>{moduleFor(row.objectType, row)}</strong><small>{objectLabels[row.objectType] ?? readableObjectType(row.objectType)}：{specificObject(row)}</small></span> },
    { key: 'summary', label: '变更摘要', render: (row) => summarize(row) },
    { key: 'action-detail', label: '操作', render: (row) => <button type="button" className="table-action" onClick={() => setSelected(row)}><Eye size={14} />详情</button> },
  ];
  function apply(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setFilters(draft); setPage(1); setOpen(false); }
  const activeCount = Object.values(filters).filter(Boolean).length;
  return <div className="page-enter"><PageHeader eyebrow="系统管理 / 审计" title="操作日志" description="按时间倒序记录业务变更、复核、附件和导出操作。" />
    <div className="toolbar"><div className={`expert-filter-popover audit-filter-popover${open ? ' open' : ''}`}><button type="button" className="expert-filter-trigger" onClick={() => { setDraft(filters); setOpen((value) => !value); }}><Search size={16} /><span><strong>{activeCount ? `已应用 ${activeCount} 个筛选条件` : '搜索与筛选操作日志'}</strong><small>操作人、操作类型、业务对象和时间</small></span><SlidersHorizontal size={16} /></button>{open && <form className="expert-filter-panel audit-filter-panel" onSubmit={apply}><div className="expert-filter-panel-heading"><span><strong>筛选操作记录</strong><small>日志按操作时间倒序展示</small></span><button type="button" onClick={() => setDraft({ q: '', actorUserId: '', action: '', objectType: '', occurredFrom: '', occurredTo: '' })}><RotateCcw size={13} />清空条件</button></div><label><span>关键词</span><Input value={draft.q} onChange={(event) => setDraft((value) => ({ ...value, q: event.target.value }))} /></label><label><span>操作人</span><SearchableSelect ariaLabel="筛选操作人" defaultValue={draft.actorUserId} placeholder="全部操作人" searchPlaceholder="搜索姓名或用户名" options={(options.data?.actors ?? []).map((item) => ({ value: item.id, label: `${item.displayName} · @${item.username}` }))} onValueChange={(value) => setDraft((current) => ({ ...current, actorUserId: value }))} /></label><label><span>操作类型</span><SearchableSelect ariaLabel="筛选操作类型" defaultValue={draft.action} placeholder="全部操作" searchPlaceholder="搜索操作类型" options={(options.data?.actions ?? []).map((item) => ({ value: item, label: actionLabels[item] ?? item, searchText: item }))} onValueChange={(value) => setDraft((current) => ({ ...current, action: value }))} /></label><label><span>业务对象</span><SearchableSelect ariaLabel="筛选业务对象" defaultValue={draft.objectType} placeholder="全部对象" searchPlaceholder="搜索业务对象" options={(options.data?.objectTypes ?? []).map((item) => ({ value: item, label: objectLabels[item] ?? item, searchText: item }))} onValueChange={(value) => setDraft((current) => ({ ...current, objectType: value }))} /></label><label><span>操作时间</span><span className="expert-filter-date-range"><DateInput aria-label="操作起始日期" defaultValue={draft.occurredFrom} onValueChange={(value) => setDraft((current) => ({ ...current, occurredFrom: value }))} /><em>至</em><DateInput aria-label="操作结束日期" defaultValue={draft.occurredTo} onValueChange={(value) => setDraft((current) => ({ ...current, occurredTo: value }))} /></span></label><div className="expert-filter-actions"><button type="button" className="button ghost" onClick={() => setOpen(false)}>取消</button><button type="submit" className="button primary">应用筛选</button></div></form>}</div><span className="result-count">{logs.data?.total ?? 0} 条记录</span></div>
    <section className="panel table-panel">{logs.isLoading ? <LoadingState /> : logs.error ? <ErrorState error={logs.error} /> : <><DataTable tableId="audit-logs" columns={columns} rows={logs.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={logs.data?.total ?? 0} onPageChange={setPage} /></>}</section>
    <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="操作详情" description={selected ? `${formatDateTime(selected.occurredAt)} · ${selected.actor?.displayName ?? '系统/已删除账号'}` : undefined} size="large">{selected && <div className="audit-detail"><div><span>操作</span><strong>{actionLabels[selected.action] ?? selected.action}</strong></div><div><span>所属模块</span><strong>{moduleFor(selected.objectType, selected)}</strong></div><div><span>具体对象</span><strong>{objectLabels[selected.objectType] ?? readableObjectType(selected.objectType)}：{specificObject(selected)}</strong></div><div><span>对象编号</span><strong className="mono">{selected.objectId}</strong></div><ReadableBlock title="变更前" value={selected.beforeData} /><ReadableBlock title="变更后" value={selected.afterData} /></div>}</Modal>
  </div>;
}

function summarize(log: AuditLog) {
  const before = log.beforeData ?? {};
  const after = log.afterData ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  if (!keys.length) return '—';
  return keys.slice(0, 2).map((key) => Object.hasOwn(before, key) && Object.hasOwn(after, key)
    ? `${fieldLabel(key)}：${formatAuditValue(key, before[key])} → ${formatAuditValue(key, after[key])}`
    : `${fieldLabel(key)}：${formatAuditValue(key, after[key] ?? before[key])}`).join(' · ');
}
function formatDateTime(value: string) { return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value)); }
function ReadableBlock({ title, value }: { title: string; value?: Record<string, unknown> | null }) { return <section><span>{title}</span>{value && Object.keys(value).length ? <dl className="audit-field-list">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{fieldLabel(key)}</dt><dd>{formatAuditValue(key, item)}</dd></div>)}</dl> : <strong>无</strong>}</section>; }
function fieldLabel(key: string) { return fieldLabels[key] ?? key.replace(/([A-Z])/g, ' $1').trim(); }
function formatAuditValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'string' && statusLabels[value]) return statusLabels[value];
  if (/amount|cost|total|taxAmount/i.test(key) && !Number.isNaN(Number(value))) return formatMoney(String(value));
  if (/taxRate/i.test(key) && !Number.isNaN(Number(value))) return `${Number(value) * 100}%`;
  if (typeof value === 'string' && /(On|At)$/.test(key) && !Number.isNaN(Date.parse(value))) return formatDateTime(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
function readableObjectType(type: string) { return type.replace(/^EXPORT_/, '').replaceAll('_', ' ').toLowerCase(); }
function moduleFor(type: string, log?: AuditLog) {
  if (type.startsWith('EXPORT_')) return `${exportModule(type.slice(7))} · 导出`;
  const data = { ...(log?.beforeData ?? {}), ...(log?.afterData ?? {}) };
  if (type === 'INVOICE' && typeof data.category === 'string') return `发票台账 · ${statusLabels[data.category] ?? data.category}`;
  if (type === 'BANK_TRANSACTION' && typeof data.category === 'string') return `银行日记账 · ${statusLabels[data.category] ?? data.category}`;
  if (type === 'ORGANIZATION' && data.roleType === 'SUPPORTER') return '支持方库';
  if (type === 'ORGANIZATION' && data.roleType === 'EXECUTOR') return '执行方库';
  return moduleLabels[type] ?? objectLabels[type] ?? readableObjectType(type);
}
function exportModule(dataset: string) {
  const labels: Record<string, string> = { PROJECTS: '项目台账', CONTRACTS: '合同台账', BANKING: '银行日记账', INVOICES: '发票台账', 'DONATION-RECEIPTS': '发票台账 · 捐赠票据', SUPPORTERS: '支持方库', EXECUTORS: '执行方库', EXPERTS: '专家库', MEMBERS: '会员库' };
  return labels[dataset] ?? dataset;
}
function specificObject(log: AuditLog) {
  if (log.objectDisplayName) return log.objectDisplayName;
  const data = { ...(log.beforeData ?? {}), ...(log.afterData ?? {}) };
  const primary = data.projectCode ?? data.contractNo ?? data.donorName ?? data.memberName ?? data.dueCode ?? data.committeeName ?? data.organizationCode ?? data.name ?? data.displayName ?? data.username ?? data.fileName ?? data.itemKey;
  return primary ? String(primary) : `编号 ${log.objectId.slice(0, 8)}`;
}
