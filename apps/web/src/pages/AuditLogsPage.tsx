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
import type { AuditFilterOptions, AuditLog, ListResponse } from '../lib/types';

const actionLabels: Record<string, string> = { CREATE: '新增', UPDATE: '修改', DELETE: '删除/停用', VOID: '作废', UPLOAD: '上传附件', DOWNLOAD: '下载附件', DELETE_ATTACHMENT: '删除附件', REVIEW: '复核', COLLECT: '归集', EXPORT: '导出', EXPORT_SENSITIVE: '导出敏感信息', LOGIN: '登录' };
const objectLabels: Record<string, string> = { PROJECT: '项目', CONTRACT: '合同', BANK_TRANSACTION: '银行流水', INVOICE: '发票', DONATION_RECEIPT: '捐赠票据', MEMBERSHIP: '会员', MEMBER_DUE: '会费', COMMITTEE: '专委会', EXPERT: '专家', ORGANIZATION: '机构', ACCOUNT: '账号', PROJECT_MANAGER: 'PM' };

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
    { key: 'object', label: '业务对象', render: (row) => <span className="primary-cell"><strong>{objectLabels[row.objectType] ?? row.objectType}</strong><small className="mono">{row.objectId.slice(0, 8)}</small></span> },
    { key: 'summary', label: '变更摘要', render: (row) => summarize(row) },
    { key: 'action-detail', label: '操作', render: (row) => <button type="button" className="table-action" onClick={() => setSelected(row)}><Eye size={14} />详情</button> },
  ];
  function apply(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setFilters(draft); setPage(1); setOpen(false); }
  const activeCount = Object.values(filters).filter(Boolean).length;
  return <div className="page-enter"><PageHeader eyebrow="系统管理 / 审计" title="操作日志" description="按时间倒序记录业务变更、复核、附件和导出操作。" />
    <div className="toolbar"><div className={`expert-filter-popover audit-filter-popover${open ? ' open' : ''}`}><button type="button" className="expert-filter-trigger" onClick={() => { setDraft(filters); setOpen((value) => !value); }}><Search size={16} /><span><strong>{activeCount ? `已应用 ${activeCount} 个筛选条件` : '搜索与筛选操作日志'}</strong><small>操作人、操作类型、业务对象和时间</small></span><SlidersHorizontal size={16} /></button>{open && <form className="expert-filter-panel audit-filter-panel" onSubmit={apply}><div className="expert-filter-panel-heading"><span><strong>筛选操作记录</strong><small>日志按操作时间倒序展示</small></span><button type="button" onClick={() => setDraft({ q: '', actorUserId: '', action: '', objectType: '', occurredFrom: '', occurredTo: '' })}><RotateCcw size={13} />清空条件</button></div><label><span>关键词</span><Input value={draft.q} onChange={(event) => setDraft((value) => ({ ...value, q: event.target.value }))} /></label><label><span>操作人</span><SearchableSelect ariaLabel="筛选操作人" defaultValue={draft.actorUserId} placeholder="全部操作人" searchPlaceholder="搜索姓名或用户名" options={(options.data?.actors ?? []).map((item) => ({ value: item.id, label: `${item.displayName} · @${item.username}` }))} onValueChange={(value) => setDraft((current) => ({ ...current, actorUserId: value }))} /></label><label><span>操作类型</span><SearchableSelect ariaLabel="筛选操作类型" defaultValue={draft.action} placeholder="全部操作" searchPlaceholder="搜索操作类型" options={(options.data?.actions ?? []).map((item) => ({ value: item, label: actionLabels[item] ?? item, searchText: item }))} onValueChange={(value) => setDraft((current) => ({ ...current, action: value }))} /></label><label><span>业务对象</span><SearchableSelect ariaLabel="筛选业务对象" defaultValue={draft.objectType} placeholder="全部对象" searchPlaceholder="搜索业务对象" options={(options.data?.objectTypes ?? []).map((item) => ({ value: item, label: objectLabels[item] ?? item, searchText: item }))} onValueChange={(value) => setDraft((current) => ({ ...current, objectType: value }))} /></label><label><span>操作时间</span><span className="expert-filter-date-range"><DateInput aria-label="操作起始日期" defaultValue={draft.occurredFrom} onValueChange={(value) => setDraft((current) => ({ ...current, occurredFrom: value }))} /><em>至</em><DateInput aria-label="操作结束日期" defaultValue={draft.occurredTo} onValueChange={(value) => setDraft((current) => ({ ...current, occurredTo: value }))} /></span></label><div className="expert-filter-actions"><button type="button" className="button ghost" onClick={() => setOpen(false)}>取消</button><button type="submit" className="button primary">应用筛选</button></div></form>}</div><span className="result-count">{logs.data?.total ?? 0} 条记录</span></div>
    <section className="panel table-panel">{logs.isLoading ? <LoadingState /> : logs.error ? <ErrorState error={logs.error} /> : <><DataTable tableId="audit-logs" columns={columns} rows={logs.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={logs.data?.total ?? 0} onPageChange={setPage} /></>}</section>
    <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="操作详情" description={selected ? `${formatDateTime(selected.occurredAt)} · ${selected.actor?.displayName ?? '系统/已删除账号'}` : undefined} size="large">{selected && <div className="audit-detail"><div><span>操作</span><strong>{actionLabels[selected.action] ?? selected.action}</strong></div><div><span>业务对象</span><strong>{objectLabels[selected.objectType] ?? selected.objectType}</strong></div><div className="span-2"><span>对象 ID</span><strong className="mono">{selected.objectId}</strong></div><JsonBlock title="变更前" value={selected.beforeData} /><JsonBlock title="变更后" value={selected.afterData} /></div>}</Modal>
  </div>;
}

function summarize(log: AuditLog) { const data = log.afterData ?? log.beforeData; if (!data) return '—'; return Object.entries(data).slice(0, 2).map(([key, value]) => `${key}: ${String(value ?? '—')}`).join(' · '); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value)); }
function JsonBlock({ title, value }: { title: string; value?: Record<string, unknown> | null }) { return <section><span>{title}</span><pre>{value ? JSON.stringify(value, null, 2) : '无'}</pre></section>; }
