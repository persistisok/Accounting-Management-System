import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { DataTable, type TableColumn } from '../components/DataTable';
import { DateInput, Field, FormActions, Input, MoneyInput, SearchableSelect, Select } from '../components/FormControls';
import { LedgerAttachmentList, PdfAttachmentInput, uploadLedgerAttachments } from '../components/LedgerAttachments';
import { LedgerExportButton } from '../components/LedgerExportButton';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_PAGE_SIZE, Pagination } from '../components/Pagination';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { api, queryString } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formObject } from '../lib/form';
import { formatDate, formatMoney } from '../lib/format';
import { hasPermission } from '../lib/permissions';
import type { DonationReceipt, DonationReceiptListResponse, Organization, Project } from '../lib/types';

export function DonationReceiptsPage() {
  const { user } = useAuth();
  const canCreate = hasPermission(user, 'DONATION_RECEIPTS', 'ENTRY');
  const canEdit = hasPermission(user, 'DONATION_RECEIPTS', 'EDIT');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [q, setQ] = useState('');
  const [projectId, setProjectId] = useState('');
  const [donorId, setDonorId] = useState('');
  const [status, setStatus] = useState('');
  const [issuedFrom, setIssuedFrom] = useState('');
  const [issuedTo, setIssuedTo] = useState('');
  const [draft, setDraft] = useState({ q: '', projectId: '', donorId: '', status: '', issuedFrom: '', issuedTo: '' });
  const [editing, setEditing] = useState<DonationReceipt | null>(null);
  const [creating, setCreating] = useState(false);
  const [voiding, setVoiding] = useState<DonationReceipt | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState('');
  const filterRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['donation-receipts', q, projectId, donorId, status, issuedFrom, issuedTo, page],
    queryFn: () => api.get<DonationReceiptListResponse>(`/donation-receipts${queryString({ q, projectId, donorId, status, issuedFrom, issuedTo, page, pageSize: DEFAULT_PAGE_SIZE })}`),
  });
  const projects = useQuery({ queryKey: ['project-options'], queryFn: () => api.get<Pick<Project, 'id' | 'projectCode' | 'name'>[]>('/projects/options') });
  const donors = useQuery({ queryKey: ['organization-options', 'SUPPORTER'], queryFn: () => api.get<Organization[]>('/organizations/options?roleType=SUPPORTER') });
  const save = useMutation({
    mutationFn: async ({ body, attachments }: { body: Record<string, string>; attachments: File[] }) => {
      const receipt = editing
        ? await api.patch<DonationReceipt>(`/donation-receipts/${editing.id}`, body)
        : await api.post<DonationReceipt>('/donation-receipts', body);
      return { failedUploads: await uploadLedgerAttachments('DONATION_RECEIPT', receipt.id, attachments) };
    },
    onSuccess: ({ failedUploads }) => {
      void queryClient.invalidateQueries({ queryKey: ['donation-receipts'] });
      void queryClient.invalidateQueries({ queryKey: ['project'] });
      setNotice(failedUploads ? `捐赠票据已保存，但有 ${failedUploads} 个附件上传失败，请编辑后重试。` : '');
      closeEditor();
    },
  });
  const voidReceipt = useMutation({
    mutationFn: (id: string) => api.post(`/donation-receipts/${id}/void`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['donation-receipts'] }); void queryClient.invalidateQueries({ queryKey: ['project'] }); setVoiding(null); },
  });

  const columns: TableColumn<DonationReceipt>[] = [
    { key: 'number', label: '票据编号', render: (row) => <span className="mono key-cell">{row.receiptNumber}</span> },
    { key: 'project', label: '关联项目', render: (row) => <span className="primary-cell"><strong>{row.project.name}</strong><small className="mono">{row.project.projectCode}</small></span> },
    { key: 'donor', label: '捐赠方', render: (row) => <span className="primary-cell"><strong>{row.donor.name}</strong><small className="mono">{row.donor.organizationCode}</small></span> },
    { key: 'date', label: '开具日期', render: (row) => formatDate(row.issuedOn) },
    { key: 'amount', label: '票据金额', className: 'number', render: (row) => <strong>{formatMoney(row.amount)}</strong> },
    { key: 'remark', label: '备注', render: (row) => row.remark || '—' },
    { key: 'attachments', label: '附件列表', render: (row) => <LedgerAttachmentList objectType="DONATION_RECEIPT" objectId={row.id} attachments={row.attachments ?? []} /> },
    { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
  ];
  if (canEdit) columns.push({ key: 'action', label: '操作', render: (row) => <span className="row-actions"><button type="button" className="table-action" disabled={row.status === 'VOID'} onClick={() => openEditor(row)}><Pencil size={14} />编辑</button>{row.status !== 'VOID' && <button type="button" className="table-action danger" onClick={() => setVoiding(row)}><Trash2 size={14} />作废</button>}</span> });

  function openEditor(receipt?: DonationReceipt) {
    setEditing(receipt ?? null); setCreating(!receipt); setFiles([]); setNotice(''); save.reset();
  }
  function closeEditor() { setEditing(null); setCreating(false); setFiles([]); }
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setQ(draft.q); setProjectId(draft.projectId); setDonorId(draft.donorId); setStatus(draft.status); setIssuedFrom(draft.issuedFrom); setIssuedTo(draft.issuedTo); setPage(1); setFiltersOpen(false);
  }
  const filterSummary = [q && `关键词：${q}`, projectId && '已选项目', donorId && '已选捐赠方', status && (status === 'NORMAL' ? '正常' : '已作废'), (issuedFrom || issuedTo) && `${issuedFrom || '不限'} 至 ${issuedTo || '不限'}`].filter(Boolean).join(' · ');

  return <div className="page-enter">
    <PageHeader eyebrow="业务台账 / 捐赠凭证" title="捐赠票据台账" description="登记捐赠票据并关联项目与捐赠方，票据金额独立统计。" action={(user?.role === 'SYSTEM_ADMIN' || canCreate) ? <div className="button-group">{user?.role === 'SYSTEM_ADMIN' && <LedgerExportButton dataset="donation-receipts" fileName="捐赠票据台账" filters={{ q, donationProjectId: projectId, donationDonorId: donorId, donationStatus: status, donationIssuedFrom: issuedFrom, donationIssuedTo: issuedTo }} />}{canCreate && <button type="button" className="button primary" onClick={() => openEditor()}><Plus size={17} />登记捐赠票据</button>}</div> : undefined} />
    {notice && <div className="operation-banner">{notice}</div>}
    <section className="invoice-summary-strip donation-summary-strip"><span><small>筛选票据数</small><strong>{query.data?.summary.count ?? 0} 张</strong></span><i /><span><small>筛选票据金额</small><strong>{formatMoney(query.data?.summary.amount)}</strong></span></section>
    <div className="toolbar"><div className={`expert-filter-popover${filtersOpen ? ' open' : ''}`} ref={filterRef}><button type="button" className="expert-filter-trigger" onClick={() => { setDraft({ q, projectId, donorId, status, issuedFrom, issuedTo }); setFiltersOpen((value) => !value); }}><Search size={16} /><span><strong>{filterSummary || '搜索与筛选捐赠票据'}</strong><small>票据编号、项目、捐赠方、日期和状态</small></span><SlidersHorizontal size={16} /></button>{filtersOpen && <form className="expert-filter-panel" onSubmit={applyFilters}><div className="expert-filter-panel-heading"><span><strong>筛选捐赠票据</strong><small>未选择的条件默认不限</small></span><button type="button" onClick={() => setDraft({ q: '', projectId: '', donorId: '', status: '', issuedFrom: '', issuedTo: '' })}><RotateCcw size={13} />清空条件</button></div><label><span>关键词</span><Input value={draft.q} onChange={(event) => setDraft((value) => ({ ...value, q: event.target.value }))} /></label><label><span>关联项目</span><SearchableSelect ariaLabel="筛选关联项目" defaultValue={draft.projectId} placeholder="全部项目" searchPlaceholder="搜索项目编码或名称" options={(projects.data ?? []).map((item) => ({ value: item.id, label: `${item.projectCode} · ${item.name}` }))} onValueChange={(value) => setDraft((current) => ({ ...current, projectId: value }))} /></label><label><span>捐赠方</span><SearchableSelect ariaLabel="筛选捐赠方" defaultValue={draft.donorId} placeholder="全部捐赠方" searchPlaceholder="搜索捐赠方" options={(donors.data ?? []).map((item) => ({ value: item.id, label: `${item.organizationCode} · ${item.name}` }))} onValueChange={(value) => setDraft((current) => ({ ...current, donorId: value }))} /></label><label><span>开具日期</span><span className="expert-filter-date-range"><DateInput aria-label="开具日期起始" defaultValue={draft.issuedFrom} onValueChange={(value) => setDraft((current) => ({ ...current, issuedFrom: value }))} /><em>至</em><DateInput aria-label="开具日期结束" defaultValue={draft.issuedTo} onValueChange={(value) => setDraft((current) => ({ ...current, issuedTo: value }))} /></span></label><label><span>状态</span><Select value={draft.status} onChange={(event) => setDraft((value) => ({ ...value, status: event.target.value }))}><option value="">全部状态</option><option value="NORMAL">正常</option><option value="VOID">已作废</option></Select></label><div className="expert-filter-actions"><button type="button" className="button ghost" onClick={() => setFiltersOpen(false)}>取消</button><button type="submit" className="button primary">应用筛选</button></div></form>}</div><span className="result-count">{query.data?.total ?? 0} 张票据</span></div>
    <section className="panel table-panel">{query.isLoading ? <LoadingState /> : query.error ? <ErrorState error={query.error} /> : <><DataTable tableId="donation-receipts" columns={columns} rows={query.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={query.data?.total ?? 0} onPageChange={setPage} /></>}</section>
    <Modal open={creating || Boolean(editing)} onClose={closeEditor} title={editing ? '编辑捐赠票据' : '登记捐赠票据'} description="捐赠票据编号不可重复，保存后可继续补充 PDF 附件。" size="large"><form key={editing?.id ?? 'new'} className="form-grid" onSubmit={(event) => { event.preventDefault(); save.mutate({ body: formObject(event.currentTarget), attachments: files }); }}><Field label="关联项目"><SearchableSelect name="projectId" required ariaLabel="关联项目" defaultValue={editing?.projectId ?? ''} placeholder="请选择项目" searchPlaceholder="搜索项目编码或名称" options={(projects.data ?? []).map((item) => ({ value: item.id, label: `${item.projectCode} · ${item.name}` }))} /></Field><Field label="捐赠方"><SearchableSelect name="donorId" required ariaLabel="捐赠方" defaultValue={editing?.donorId ?? ''} placeholder="请选择捐赠方" searchPlaceholder="搜索支持方编号或名称" options={(donors.data ?? []).map((item) => ({ value: item.id, label: `${item.organizationCode} · ${item.name}` }))} /></Field><Field label="票据编号"><Input name="receiptNumber" required maxLength={64} defaultValue={editing?.receiptNumber ?? ''} /></Field><Field label="开具日期"><DateInput name="issuedOn" required aria-label="开具日期" defaultValue={editing?.issuedOn.slice(0, 10) ?? ''} /></Field><Field label="票据金额"><MoneyInput name="amount" required min="0.01" defaultValue={editing?.amount ?? ''} /></Field><Field label="备注"><Input name="remark" maxLength={500} defaultValue={editing?.remark ?? ''} /></Field><Field label="附件列表" span={2} hint="可选；仅支持 PDF，每次添加一份，最多 10 份；单个文件不超过 10MB。"><PdfAttachmentInput files={files} onFilesChange={setFiles} existingCount={editing?.attachments?.length ?? 0} />{editing && <LedgerAttachmentList objectType="DONATION_RECEIPT" objectId={editing.id} attachments={editing.attachments} canDelete onDeleted={(attachmentId) => setEditing((current) => current ? { ...current, attachments: current.attachments.filter((item) => item.id !== attachmentId) } : current)} />}</Field>{save.error && <p className="form-error span-2">{save.error.message}</p>}<div className="span-2"><FormActions pending={save.isPending} onCancel={closeEditor} submitLabel={editing ? '保存修改' : '保存票据'} /></div></form></Modal>
    <ConfirmActionModal open={Boolean(voiding)} onClose={() => setVoiding(null)} onConfirm={() => voiding && voidReceipt.mutate(voiding.id)} pending={voidReceipt.isPending} error={voidReceipt.error} title="作废捐赠票据" description={voiding ? `确认作废票据“${voiding.receiptNumber}”？作废后保留历史记录，但不再计入统计。` : ''} confirmLabel="确认作废" />
  </div>;
}
