import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Trash2, Upload } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
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
import { hasPermission } from '../lib/permissions';
import { formObject } from '../lib/form';
import { formatDate, formatMoney } from '../lib/format';
import type { Invoice, InvoiceCategory, ListResponse, Project } from '../lib/types';

interface InvoiceImportResult {
  total: number;
  successCount: number;
  failureCount: number;
  collectedCount: number;
  pendingCount: number;
  errors: Array<{ row: number; message: string }>;
}

const invoiceCategoryConfig: Record<InvoiceCategory, { title: string; description: string; memberBased?: boolean; counterpart: string; requiresExpert?: boolean }> = {
  SUPPORT_RECEIPT_ISSUED: { title: '支持款收入票据', description: '登记项目支持款收入对应的票据。', counterpart: '购买方名称' },
  MEMBER_DUE_ISSUED: { title: '会费收入票据', description: '登记会员会费收入票据，可按需关联项目。', memberBased: true, counterpart: '购买方名称' },
  EXECUTION_PAYMENT_RECEIVED: { title: '执行款支出票据', description: '登记项目执行款支出收到的票据。', counterpart: '销售方名称' },
  EXPERT_FEE_RECEIVED: { title: '专家费支出票据', description: '登记项目专家费支出收到的票据，并关联收款专家。', counterpart: '销售方名称', requiresExpert: true },
};

interface MemberOption { id: string; memberName: string; memberType: string; committee?: { id: string; committeeCode: string; name: string } }
interface CommitteeOption { id: string; committeeCode: string; name: string }
interface ExpertOption { id: string; person: { name: string; organizationName?: string } }
interface InvoiceListResponse extends ListResponse<Invoice> {
  summary: { count: number; totalAmount: string; collectedMemberCount: number; pendingCount: number };
}

export function InvoicesPage({ category }: { category: InvoiceCategory }) {
  const { user } = useAuth();
  const config = invoiceCategoryConfig[category];
  const canEdit = hasPermission(user, 'INVOICES', 'EDIT');
  const canCreate = hasPermission(user, 'INVOICES', 'ENTRY');
  const canCollect = canEdit && (user?.role === 'SYSTEM_ADMIN' || user?.role === 'ADMIN');
  const [projectFilter, setProjectFilter] = useState('');
  const [memberFilter, setMemberFilter] = useState('');
  const [committeeFilter, setCommitteeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [collectionFilter, setCollectionFilter] = useState('');
  const [issuedFrom, setIssuedFrom] = useState('');
  const [issuedTo, setIssuedTo] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftProject, setDraftProject] = useState('');
  const [draftMember, setDraftMember] = useState('');
  const [draftCommittee, setDraftCommittee] = useState('');
  const [draftStatus, setDraftStatus] = useState('');
  const [draftCollection, setDraftCollection] = useState('');
  const [draftIssuedFrom, setDraftIssuedFrom] = useState('');
  const [draftIssuedTo, setDraftIssuedTo] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<InvoiceImportResult | null>(null);
  const [totalAmount, setTotalAmount] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [collecting, setCollecting] = useState<Invoice | null>(null);
  const [collectionMemberId, setCollectionMemberId] = useState('');
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState('');
  const filterRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const invoices = useQuery({ queryKey: ['invoices', category, projectFilter, memberFilter, committeeFilter, statusFilter, collectionFilter, issuedFrom, issuedTo, page], queryFn: () => api.get<InvoiceListResponse>(`/invoices${queryString({ category, projectId: projectFilter, membershipId: config.memberBased ? memberFilter : '', committeeId: config.memberBased ? committeeFilter : '', status: statusFilter, collectionStatus: config.memberBased ? collectionFilter : '', issuedFrom, issuedTo, page, pageSize: DEFAULT_PAGE_SIZE })}`) });
  const projects = useQuery({ queryKey: ['project-options'], queryFn: () => api.get<Pick<Project, 'id' | 'projectCode' | 'name'>[]>('/projects/options') });
  const members = useQuery({ queryKey: ['invoice-member-options'], queryFn: () => api.get<MemberOption[]>('/invoices/member-options'), enabled: config.memberBased });
  const committees = useQuery({ queryKey: ['committee-options'], queryFn: () => api.get<CommitteeOption[]>('/memberships/committees/options'), enabled: config.memberBased });
  const experts = useQuery({ queryKey: ['expert-options'], queryFn: () => api.get<ExpertOption[]>('/experts/options'), enabled: config.requiresExpert });
  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) setFilterOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);
  const downloadTemplate = useMutation({
    mutationFn: () => api.download(`/invoices/import-template${queryString({ category })}`),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${config.title}导入模板.csv`;
      link.click();
      URL.revokeObjectURL(url);
    },
  });
  const importInvoices = useMutation({
    mutationFn: (file: File) => api.upload<InvoiceImportResult>(`/invoices/import${queryString({ category })}`, file),
    onSuccess: (result) => {
      setImportResult(result);
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
  const save = useMutation({
    mutationFn: async ({ body, files }: { body: Record<string, string | null>; files: File[] }) => {
      const invoice = editing ? await api.patch<Invoice>(`/invoices/${editing.id}`, body) : await api.post<Invoice>('/invoices', body);
      return { failedUploads: await uploadLedgerAttachments('INVOICE', invoice.id, files) };
    },
    onSuccess: ({ failedUploads }) => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] }); void queryClient.invalidateQueries({ queryKey: ['projects'] });
      setNotice(failedUploads ? `票据已保存，但有 ${failedUploads} 个附件上传失败，请编辑票据后重试。` : '');
      setModal(false); setEditing(null); setAttachmentFiles([]); setTotalAmount(''); setTaxRate('');
    },
  });
  const voidInvoice = useMutation({
    mutationFn: (id: string) => api.post(`/invoices/${id}/void`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['invoices'] }); void queryClient.invalidateQueries({ queryKey: ['projects'] }); setVoiding(null); },
  });
  const collectInvoice = useMutation({
    mutationFn: ({ id, membershipId }: { id: string; membershipId: string }) => api.post<Invoice>(`/invoices/${id}/collect`, { membershipId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setCollecting(null);
      setCollectionMemberId('');
    },
  });
  const columns: TableColumn<Invoice>[] = [
    { key: 'project', label: '关联项目', render: (row) => row.project
      ? <span className="primary-cell"><strong>{row.project.name}</strong><small className="mono">{row.project.projectCode}</small></span>
      : <span className="muted">未关联</span> },
    { key: 'date', label: '发票日期', render: (row) => formatDate(row.issuedOn) },
    { key: 'type', label: '发票类型 / 平台', render: (row) => <span>{row.invoiceType}<small className="block-muted">{row.invoicePlatform}</small></span> },
    { key: 'buyer', label: config.counterpart, render: (row) => row.buyerName },
    { key: 'amount', label: '金额', className: 'number', render: (row) => formatMoney(row.amountExcludingTax) },
    { key: 'tax', label: '税率 / 税额', className: 'number', render: (row) => <span>{formatRate(row.taxRate)}<small className="block-muted">{formatMoney(row.taxAmount)}</small></span> },
    { key: 'total', label: '价税合计', className: 'number', render: (row) => <strong>{formatMoney(row.totalAmount)}</strong> },
    { key: 'attachments', label: '附件列表', render: (row) => <LedgerAttachmentList objectType="INVOICE" objectId={row.id} attachments={row.attachments ?? []} /> },
    { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
  ];
  if (config.memberBased) columns.splice(1, 0,
    { key: 'member', label: '交款人 / 关联会员', render: (row) => <span className="primary-cell"><strong>{row.payerName ?? row.membership?.memberName ?? '—'}</strong><small>{row.membership ? `已匹配：${row.membership.memberName}` : '尚未匹配会员'}</small></span> },
    { key: 'committee', label: '所属专委会', render: (row) => row.membership?.committee ? <span className="primary-cell"><strong>{row.membership.committee.name}</strong><small className="mono">{row.membership.committee.committeeCode}</small></span> : <span className="muted">未归集</span> },
    { key: 'collectionStatus', label: '归集状态', render: (row) => <StatusChip value={row.collectionStatus === 'PENDING' ? 'COLLECTION_PENDING' : row.collectionStatus} /> },
  );
  if (config.requiresExpert) columns.splice(1, 0, {
    key: 'expert', label: '关联专家', render: (row) => <span className="primary-cell"><strong>{row.expertProfile?.person.name ?? '—'}</strong><small>{row.expertProfile?.person.organizationName ?? '—'}</small></span>,
  });
  if (canEdit) columns.push({ key: 'action', label: '操作', render: (row) => <span className="row-actions">
    {canCollect && row.collectionStatus === 'PENDING' && <button className="table-action" onClick={() => { setCollectionMemberId(''); setCollecting(row); }}>确认归集</button>}
    <button className="table-action" disabled={row.status === 'VOID' || row.collectionStatus === 'PENDING'} onClick={() => { setTotalAmount(row.totalAmount); setTaxRate(formatRateInput(row.taxRate)); setAttachmentFiles([]); setNotice(''); setEditing(row); }}><Pencil size={14} />编辑</button>
    {row.status !== 'VOID' && <button className="table-action danger" onClick={() => setVoiding(row)}><Trash2 size={14} />作废</button>}
  </span> });
  const calculated = calculateInvoiceAmounts(totalAmount, taxRate);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: Record<string, string | null> = formObject(event.currentTarget);
    body.category = category;
    body.taxRate = (Number(body.taxRate) / 100).toString();
    if (config.memberBased && editing && !body.projectId) body.projectId = null;
    save.mutate({ body, files: attachmentFiles });
  }

  function openFilters() {
    setDraftProject(projectFilter);
    setDraftMember(memberFilter);
    setDraftCommittee(committeeFilter);
    setDraftStatus(statusFilter);
    setDraftCollection(collectionFilter);
    setDraftIssuedFrom(issuedFrom);
    setDraftIssuedTo(issuedTo);
    setFilterOpen(true);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProjectFilter(draftProject);
    setMemberFilter(draftMember);
    setCommitteeFilter(draftCommittee);
    setStatusFilter(draftStatus);
    setCollectionFilter(draftCollection);
    setIssuedFrom(draftIssuedFrom);
    setIssuedTo(draftIssuedTo);
    setPage(1);
    setFilterOpen(false);
  }

  const selectedProject = projects.data?.find((item) => item.id === projectFilter)?.name;
  const selectedMember = members.data?.find((item) => item.id === memberFilter)?.memberName;
  const selectedCommittee = committees.data?.find((item) => item.id === committeeFilter)?.name;
  const filterSummary = [
    selectedProject && `项目：${selectedProject}`,
    selectedMember && `会员：${selectedMember}`,
    selectedCommittee && `专委会：${selectedCommittee}`,
    (issuedFrom || issuedTo) && `${issuedFrom ? formatDate(issuedFrom) : '起始不限'}至${issuedTo ? formatDate(issuedTo) : '结束不限'}`,
    statusFilter && (statusFilter === 'NORMAL' ? '正常' : '已作废'),
    collectionFilter && (collectionFilter === 'COLLECTED' ? '已归集' : '待归集'),
  ].filter(Boolean).join(' · ');

  return <div className="page-enter">
    <PageHeader eyebrow="业务台账 / 发票台账" title={config.title} description={config.description} action={(user?.role === 'SYSTEM_ADMIN' || canCreate) ? <div className="button-group">{user?.role === 'SYSTEM_ADMIN' && <LedgerExportButton dataset="invoices" fileName={config.title} filters={{ invoiceCategory: category, invoiceStatus: statusFilter, invoiceCollectionStatus: config.memberBased ? collectionFilter : '', issuedFrom, issuedTo, invoiceProjectId: projectFilter, invoiceMembershipId: config.memberBased ? memberFilter : '', invoiceCommitteeId: config.memberBased ? committeeFilter : '' }} />}{canCreate && <button className="button secondary" onClick={() => { setImportFile(null); setImportResult(null); importInvoices.reset(); setImportOpen(true); }}><Upload size={16} />模板导入</button>}{canCreate && <button className="button primary" onClick={() => { setTotalAmount(''); setTaxRate(''); setAttachmentFiles([]); setNotice(''); setModal(true); }}><Plus size={17} />登记票据</button>}</div> : undefined} />
    {notice && <div className="operation-banner">{notice}</div>}
    <section className={`invoice-summary-bar${config.memberBased ? ' member-collection-summary' : ''}`}>
      <span><small>筛选票据数量</small><strong>{invoices.data?.summary.count ?? 0} 张</strong></span><i />
      <span><small>筛选票据总金额</small><strong>{formatMoney(invoices.data?.summary.totalAmount)}</strong></span>
      {config.memberBased && <><i /><span><small>已归集会员数</small><strong>{invoices.data?.summary.collectedMemberCount ?? 0} 位</strong></span><i /><span><small>待归集票据数</small><strong>{invoices.data?.summary.pendingCount ?? 0} 张</strong></span></>}
    </section>
    <div className="toolbar invoice-toolbar">
      <div className={`expert-filter-popover invoice-filter-popover${filterOpen ? ' open' : ''}`} ref={filterRef}>
        <button type="button" className="expert-filter-trigger" aria-expanded={filterOpen} aria-haspopup="dialog" onClick={() => filterOpen ? setFilterOpen(false) : openFilters()}><Search size={16} /><span><strong>{filterSummary || '搜索与筛选票据'}</strong><small>{filterSummary ? '点击修改筛选条件' : config.memberBased ? '会员、专委会、项目、日期区间、状态' : '项目、日期区间、状态'}</small></span><SlidersHorizontal size={16} /></button>
        {filterOpen && <form className="expert-filter-panel invoice-filter-panel" role="dialog" aria-label="票据搜索与筛选" onSubmit={applyFilters}>
          <div className="expert-filter-panel-heading"><span><strong>搜索与筛选</strong><small>未选择的条件默认不限</small></span><button type="button" onClick={() => { setDraftProject(''); setDraftMember(''); setDraftCommittee(''); setDraftStatus(''); setDraftCollection(''); setDraftIssuedFrom(''); setDraftIssuedTo(''); }}><RotateCcw size={13} />清空条件</button></div>
          {config.memberBased && <label><span>会员</span><SearchableSelect ariaLabel="按会员筛选" defaultValue={draftMember} disabled={members.isLoading || members.isError} placeholder="全部会员" searchPlaceholder="搜索会员名称或类别" onValueChange={setDraftMember} options={(members.data ?? []).map((item) => ({ value: item.id, label: item.memberName, searchText: item.memberType }))} /></label>}
          {config.memberBased && <label><span>专委会</span><SearchableSelect ariaLabel="按专委会筛选" defaultValue={draftCommittee} disabled={committees.isLoading || committees.isError} placeholder="全部专委会" searchPlaceholder="搜索专委会名称或编码" onValueChange={setDraftCommittee} options={(committees.data ?? []).map((item) => ({ value: item.id, label: item.name, searchText: item.committeeCode }))} /></label>}
          <label><span>项目</span><SearchableSelect ariaLabel="按项目筛选" defaultValue={draftProject} disabled={projects.isLoading || projects.isError} placeholder="全部项目" searchPlaceholder="搜索项目编码或名称" onValueChange={setDraftProject} options={(projects.data ?? []).map((item) => ({ value: item.id, label: `${item.projectCode} · ${item.name}` }))} /></label>
          <label><span>票据日期</span><span className="expert-filter-date-range"><DateInput key={`draft-from-${draftIssuedFrom}`} aria-label="票据日期起始时间" defaultValue={draftIssuedFrom} max={draftIssuedTo || undefined} onValueChange={setDraftIssuedFrom} /><em>至</em><DateInput key={`draft-to-${draftIssuedTo}`} aria-label="票据日期结束时间" defaultValue={draftIssuedTo} min={draftIssuedFrom || undefined} onValueChange={setDraftIssuedTo} /></span></label>
          <label><span>状态</span><Select aria-label="票据状态筛选" value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)}><option value="">全部状态</option><option value="NORMAL">正常</option><option value="VOID">已作废</option></Select></label>
          {config.memberBased && <label><span>归集状态</span><Select aria-label="归集状态筛选" value={draftCollection} onChange={(event) => setDraftCollection(event.target.value)}><option value="">全部归集状态</option><option value="COLLECTED">已归集</option><option value="PENDING">待归集</option></Select></label>}
          <div className="expert-filter-actions"><button type="button" className="button ghost" onClick={() => setFilterOpen(false)}>取消</button><button type="submit" className="button primary">应用筛选</button></div>
        </form>}
      </div>
      <span className="result-count">{invoices.data?.total ?? 0} 张票据</span>
    </div>
    <section className="panel table-panel">{invoices.isLoading ? <LoadingState /> : invoices.error ? <ErrorState error={invoices.error} /> : <><DataTable tableId={`invoices-${category}`} columns={columns} rows={invoices.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={invoices.data?.total ?? 0} onPageChange={setPage} /></>}</section>
    <Modal open={modal || Boolean(editing)} onClose={() => { setModal(false); setEditing(null); setAttachmentFiles([]); }} title={editing ? `编辑${config.title}` : `登记${config.title}`} description="填写价税合计和税率后，金额与税额自动倒算。" size="large">
      <form className="form-grid" onSubmit={submit} key={editing?.id ?? 'new'}>
        {config.memberBased && <Field label="关联会员"><SearchableSelect name="membershipId" ariaLabel="关联会员" required defaultValue={editing?.membershipId ?? editing?.membership?.id ?? ''} disabled={members.isLoading || members.isError} placeholder="请选择会员" searchPlaceholder="搜索会员名称或类别" options={(members.data ?? []).map((item) => ({ value: item.id, label: item.memberName, searchText: `${item.memberType} ${item.committee?.name ?? ''}` }))} /></Field>}
        <Field label={config.memberBased ? '关联项目（可选）' : '关联项目'}><SearchableSelect name="projectId" ariaLabel="关联项目" required={!config.memberBased} defaultValue={editing?.projectId ?? editing?.project?.id ?? ''} disabled={projects.isLoading || projects.isError} placeholder={config.memberBased ? '可不选择项目' : '请选择关联项目'} searchPlaceholder="搜索项目编码或名称" options={(projects.data ?? []).map((item) => ({ value: item.id, label: `${item.projectCode} · ${item.name}` }))} /></Field>
        {config.requiresExpert && <Field label="关联专家"><SearchableSelect name="expertProfileId" ariaLabel="关联专家" required defaultValue={editing?.expertProfileId ?? editing?.expertProfile?.id ?? ''} disabled={experts.isLoading || experts.isError} placeholder="请选择专家" searchPlaceholder="搜索专家姓名或单位" options={(experts.data ?? []).map((item) => ({ value: item.id, label: item.person.name, searchText: item.person.organizationName }))} /></Field>}
        <Field label="发票日期"><DateInput name="issuedOn" aria-label="发票日期" required defaultValue={editing?.issuedOn.slice(0, 10) ?? ''} /></Field>
        <Field label="发票类型"><Input name="invoiceType" required defaultValue={editing?.invoiceType ?? ''} /></Field>
        <Field label="开票平台"><Input name="invoicePlatform" required defaultValue={editing?.invoicePlatform ?? ''} /></Field><Field label={config.counterpart}><Input name="buyerName" required defaultValue={editing?.buyerName ?? ''} /></Field>
        <Field label="价税合计"><MoneyInput name="totalAmount" min="0" required value={totalAmount} onChange={(event) => setTotalAmount(event.target.value)} /></Field><Field label="税率" hint="按百分数填写，例如 6 表示 6%"><MoneyInput name="taxRate" min="0" max="100" step="0.01" required value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /></Field>
        <Field label="金额" hint="根据价税合计和税率自动倒算"><MoneyInput name="amountExcludingTax" min="0" required readOnly value={calculated.amountExcludingTax} /></Field><Field label="税额" hint="价税合计减去金额"><MoneyInput name="taxAmount" min="0" required readOnly value={calculated.taxAmount} /></Field>
        <Field label="附件列表" span={2} hint="可选；仅支持 PDF，每次添加一份，最多 10 份；单个文件不超过 10MB。"><PdfAttachmentInput files={attachmentFiles} onFilesChange={setAttachmentFiles} existingCount={editing?.attachments?.length ?? 0} />{editing && <LedgerAttachmentList objectType="INVOICE" objectId={editing.id} attachments={editing.attachments ?? []} canDelete onDeleted={(attachmentId) => { setEditing((current) => current ? { ...current, attachments: current.attachments.filter((item) => item.id !== attachmentId) } : current); void queryClient.invalidateQueries({ queryKey: ['invoices'] }); }} />}</Field>
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={() => { setModal(false); setEditing(null); setAttachmentFiles([]); }} submitLabel={editing ? '保存修改' : '保存票据'} /></div>
      </form>
    </Modal>
    <Modal open={importOpen} onClose={() => setImportOpen(false)} title={`模板导入${config.title}`} description="下载当前分类模板后使用 Excel 填写，并保持 CSV 格式上传。" size="wide">
      <div className="import-panel">
        <div className="import-instructions">
          <p>当前模板仅导入“{config.title}”；发票日期填写“年/月/日”，税率按百分数填写，例如 6 表示 6%。</p>
          <p>{config.memberBased ? '系统按交款人姓名自动匹配会员：唯一命中时自动归集，未命中或存在同名会员时进入“待归集”，由管理员手工确认。项目编码可不填。' : `系统按${config.requiresExpert ? '项目编码和专家姓名' : '项目编码'}匹配。`} 系统根据价税合计和税率自动倒算金额与税额。单次最多 1000 行。</p>
        </div>
        <button type="button" className="button secondary" disabled={downloadTemplate.isPending} onClick={() => downloadTemplate.mutate()}><Download size={16} />下载导入模板</button>
        <Field label="选择填写后的 CSV 文件" hint="文件不超过 2MB"><Input type="file" accept=".csv,text/csv" onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); setImportResult(null); importInvoices.reset(); }} /></Field>
        {downloadTemplate.error && <p className="form-error">模板下载失败：{downloadTemplate.error.message}</p>}
        {importInvoices.error && <p className="form-error">导入失败：{importInvoices.error.message}</p>}
        {importResult && <div className={`import-result ${importResult.failureCount ? 'has-errors' : ''}`}><strong>共 {importResult.total} 行，成功 {importResult.successCount} 行，失败 {importResult.failureCount} 行{config.memberBased ? `；自动归集 ${importResult.collectedCount} 行，待归集 ${importResult.pendingCount} 行` : ''}</strong>{importResult.errors.length > 0 && <ul>{importResult.errors.slice(0, 50).map((error) => <li key={`${error.row}-${error.message}`}>第 {error.row} 行：{error.message}</li>)}</ul>}</div>}
        <div className="form-actions"><button type="button" className="button ghost" onClick={() => setImportOpen(false)}>关闭</button><button type="button" className="button primary" disabled={!importFile || importInvoices.isPending} onClick={() => importFile && importInvoices.mutate(importFile)}>{importInvoices.isPending ? '正在导入…' : '开始导入'}</button></div>
      </div>
    </Modal>
    <Modal open={Boolean(collecting)} onClose={() => { setCollecting(null); setCollectionMemberId(''); collectInvoice.reset(); }} title="确认归集会费票据" description={collecting ? `交款人：${collecting.payerName ?? collecting.buyerName}` : ''}>
      <form className="member-collection-form" onSubmit={(event) => { event.preventDefault(); if (collecting && collectionMemberId) collectInvoice.mutate({ id: collecting.id, membershipId: collectionMemberId }); }}>
        <Field label="归集到会员" hint="确认后，该票据将计入所选会员及其所属专委会。"><SearchableSelect key={collecting?.id ?? 'none'} ariaLabel="归集到会员" required defaultValue={collectionMemberId} disabled={members.isLoading || members.isError} placeholder="请选择会员" searchPlaceholder="搜索会员名称、类别或专委会" onValueChange={setCollectionMemberId} options={(members.data ?? []).map((item) => ({ value: item.id, label: item.memberName, searchText: `${item.memberType} ${item.committee?.name ?? ''}` }))} /></Field>
        {collectInvoice.error && <p className="form-error">{collectInvoice.error.message}</p>}
        <div className="form-actions"><button type="button" className="button ghost" onClick={() => { setCollecting(null); setCollectionMemberId(''); }}>取消</button><button type="submit" className="button primary" disabled={!collectionMemberId || collectInvoice.isPending}>{collectInvoice.isPending ? '正在归集…' : '确认归集'}</button></div>
      </form>
    </Modal>
    <ConfirmActionModal open={Boolean(voiding)} onClose={() => setVoiding(null)} title="作废票据" description={voiding ? `确认作废“${voiding.project?.name ?? voiding.membership?.memberName ?? '该记录'}”的${config.title}记录？作废后不再计入相关统计。` : ''} confirmLabel="确认作废" pending={voidInvoice.isPending} error={voidInvoice.error} onConfirm={() => voiding && voidInvoice.mutate(voiding.id)} />
  </div>;
}

function formatRate(value: string) {
  return `${formatRateInput(value)}%`;
}

function formatRateInput(value: string) {
  return Number((Number(value) * 100).toFixed(4)).toString();
}

export function calculateInvoiceAmounts(totalAmount: string, taxRatePercent: string) {
  if (totalAmount.trim() === '' || taxRatePercent.trim() === '') return { amountExcludingTax: '', taxAmount: '' };
  const totalValue = Number(totalAmount);
  const rateValue = Number(taxRatePercent);
  if (!Number.isFinite(totalValue) || !Number.isFinite(rateValue) || rateValue <= -100) return { amountExcludingTax: '', taxAmount: '' };
  const amountExcludingTax = Math.round((totalValue / (1 + rateValue / 100) + Number.EPSILON) * 100) / 100;
  const taxAmount = Math.round((totalValue - amountExcludingTax + Number.EPSILON) * 100) / 100;
  return { amountExcludingTax: amountExcludingTax.toFixed(2), taxAmount: taxAmount.toFixed(2) };
}
