import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { DateInput, Field, FormActions, Input, MoneyInput, SearchableSelect, Select } from '../components/FormControls';
import { LedgerAttachmentList, PdfAttachmentInput, uploadLedgerAttachments } from '../components/LedgerAttachments';
import { LedgerExportButton } from '../components/LedgerExportButton';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_PAGE_SIZE, Pagination } from '../components/Pagination';
import { SearchBar } from '../components/SearchBar';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { api, queryString } from '../lib/api';
import { useAuth } from '../lib/auth';
import { hasPermission } from '../lib/permissions';
import { formObject } from '../lib/form';
import { formatDate, formatMoney } from '../lib/format';
import type { Invoice, ListResponse, Project } from '../lib/types';

interface InvoiceImportResult {
  total: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ row: number; message: string }>;
}

export function InvoicesPage() {
  const { user } = useAuth();
  const canEdit = hasPermission(user, 'INVOICES', 'EDIT');
  const [q, setQ] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<InvoiceImportResult | null>(null);
  const [totalAmount, setTotalAmount] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [direction, setDirection] = useState<'ISSUED' | 'RECEIVED'>('ISSUED');
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState('');
  const queryClient = useQueryClient();
  const invoices = useQuery({ queryKey: ['invoices', q, directionFilter, page], queryFn: () => api.get<ListResponse<Invoice>>(`/invoices${queryString({ q, direction: directionFilter, page, pageSize: DEFAULT_PAGE_SIZE })}`) });
  const projects = useQuery({ queryKey: ['project-options'], queryFn: () => api.get<Pick<Project, 'id' | 'projectCode' | 'name'>[]>('/projects/options') });
  const downloadTemplate = useMutation({
    mutationFn: () => api.download('/invoices/import-template'),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '发票台账导入模板.csv';
      link.click();
      URL.revokeObjectURL(url);
    },
  });
  const importInvoices = useMutation({
    mutationFn: (file: File) => api.upload<InvoiceImportResult>('/invoices/import', file),
    onSuccess: (result) => {
      setImportResult(result);
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
  const save = useMutation({
    mutationFn: async ({ body, files }: { body: Record<string, string>; files: File[] }) => {
      const invoice = editing ? await api.patch<Invoice>(`/invoices/${editing.id}`, body) : await api.post<Invoice>('/invoices', body);
      return { failedUploads: await uploadLedgerAttachments('INVOICE', invoice.id, files) };
    },
    onSuccess: ({ failedUploads }) => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] }); void queryClient.invalidateQueries({ queryKey: ['projects'] });
      setNotice(failedUploads ? `发票已保存，但有 ${failedUploads} 个附件上传失败，请编辑发票后重试。` : '');
      setModal(false); setEditing(null); setAttachmentFiles([]); setTotalAmount(''); setTaxRate(''); setDirection('ISSUED');
    },
  });
  const voidInvoice = useMutation({
    mutationFn: (id: string) => api.post(`/invoices/${id}/void`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['invoices'] }); void queryClient.invalidateQueries({ queryKey: ['projects'] }); setVoiding(null); },
  });
  const columns: TableColumn<Invoice>[] = [
    { key: 'project', label: '关联项目', render: (row) => <span className="primary-cell"><strong>{row.project.name}</strong><small className="mono">{row.project.projectCode}</small></span> },
    { key: 'direction', label: '发票方向', render: (row) => <StatusChip value={row.direction} /> },
    { key: 'date', label: '发票日期', render: (row) => formatDate(row.issuedOn) },
    { key: 'type', label: '发票类型 / 平台', render: (row) => <span>{row.invoiceType}<small className="block-muted">{row.invoicePlatform}</small></span> },
    { key: 'buyer', label: '相对方名称', render: (row) => <span>{row.buyerName}<small className="block-muted">{row.direction === 'ISSUED' ? '购买方' : '销售方'}</small></span> },
    { key: 'amount', label: '金额', className: 'number', render: (row) => formatMoney(row.amountExcludingTax) },
    { key: 'tax', label: '税率 / 税额', className: 'number', render: (row) => <span>{formatRate(row.taxRate)}<small className="block-muted">{formatMoney(row.taxAmount)}</small></span> },
    { key: 'total', label: '价税合计', className: 'number', render: (row) => <strong>{formatMoney(row.totalAmount)}</strong> },
    { key: 'attachments', label: '附件列表', render: (row) => <LedgerAttachmentList objectType="INVOICE" objectId={row.id} attachments={row.attachments ?? []} /> },
    { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
  ];
  if (canEdit) columns.push({ key: 'action', label: '', render: (row) => <span className="row-actions"><button className="table-action" disabled={row.status === 'VOID'} onClick={() => { setDirection(row.direction); setTotalAmount(row.totalAmount); setTaxRate(formatRateInput(row.taxRate)); setAttachmentFiles([]); setNotice(''); setEditing(row); }}><Pencil size={14} />编辑</button>{row.status !== 'VOID' && <button className="table-action danger" onClick={() => setVoiding(row)}><Trash2 size={14} />作废</button>}</span> });
  const calculated = calculateInvoiceAmounts(totalAmount, taxRate);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = formObject(event.currentTarget);
    body.taxRate = (Number(body.taxRate) / 100).toString();
    save.mutate({ body, files: attachmentFiles });
  }
  return <div className="page-enter">
    <PageHeader eyebrow="业务台账 / 发票" title="发票台账" description="统一登记已开票和已收票；仅已开票的价税合计计入项目已开票金额。" action={(user?.role === 'SYSTEM_ADMIN' || canEdit) ? <div className="button-group">{user?.role === 'SYSTEM_ADMIN' && <LedgerExportButton dataset="invoices" fileName="发票台账" filters={{ q, direction: directionFilter }} />}{canEdit && <button className="button secondary" onClick={() => { setImportFile(null); setImportResult(null); importInvoices.reset(); setImportOpen(true); }}><Upload size={16} />模板导入</button>}{canEdit && <button className="button primary" onClick={() => { setDirection('ISSUED'); setTotalAmount(''); setTaxRate(''); setAttachmentFiles([]); setNotice(''); setModal(true); }}><Plus size={17} />登记发票</button>}</div> : undefined} />
    {notice && <div className="operation-banner">{notice}</div>}
    <div className="toolbar"><div className="toolbar-filters"><SearchBar value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="搜索项目、发票类型、平台或相对方" /><label className="toolbar-select"><Select aria-label="发票方向筛选" value={directionFilter} onChange={(event) => { setDirectionFilter(event.target.value); setPage(1); }}><option value="">全部发票</option><option value="ISSUED">已开票</option><option value="RECEIVED">已收票</option></Select></label></div><span className="result-count">{invoices.data?.total ?? 0} 张发票</span></div>
    <section className="panel table-panel">{invoices.isLoading ? <LoadingState /> : invoices.error ? <ErrorState error={invoices.error} /> : <><DataTable columns={columns} rows={invoices.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={invoices.data?.total ?? 0} onPageChange={setPage} /></>}</section>
    <Modal open={modal || Boolean(editing)} onClose={() => { setModal(false); setEditing(null); setAttachmentFiles([]); }} title={editing ? '编辑发票' : '登记发票'} description="填写价税合计和税率后，金额与税额自动倒算。" size="large">
      <form className="form-grid" onSubmit={submit} key={editing?.id ?? 'new'}>
        <Field label="发票方向"><Select name="direction" value={direction} onChange={(event) => setDirection(event.target.value as 'ISSUED' | 'RECEIVED')}><option value="ISSUED">已开票</option><option value="RECEIVED">已收票</option></Select></Field>
        <Field label="关联项目"><SearchableSelect name="projectId" ariaLabel="关联项目" required defaultValue={editing?.projectId ?? editing?.project.id ?? ''} disabled={projects.isLoading || projects.isError} placeholder="请选择关联项目" searchPlaceholder="搜索项目编码或名称" options={(projects.data ?? []).map((item) => ({ value: item.id, label: `${item.projectCode} · ${item.name}` }))} /></Field>
        <Field label="发票日期"><DateInput name="issuedOn" aria-label="发票日期" required defaultValue={editing?.issuedOn.slice(0, 10) ?? ''} /></Field>
        <Field label="发票类型"><Input name="invoiceType" required defaultValue={editing?.invoiceType ?? ''} /></Field>
        <Field label="开票平台"><Input name="invoicePlatform" required defaultValue={editing?.invoicePlatform ?? ''} /></Field><Field label={direction === 'ISSUED' ? '购买方名称' : '销售方名称'}><Input name="buyerName" required defaultValue={editing?.buyerName ?? ''} /></Field>
        <Field label="价税合计"><MoneyInput name="totalAmount" min="0" required value={totalAmount} onChange={(event) => setTotalAmount(event.target.value)} /></Field><Field label="税率" hint="按百分数填写，例如 6 表示 6%"><MoneyInput name="taxRate" min="0" max="100" step="0.01" required value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /></Field>
        <Field label="金额" hint="根据价税合计和税率自动倒算"><MoneyInput name="amountExcludingTax" min="0" required readOnly value={calculated.amountExcludingTax} /></Field><Field label="税额" hint="价税合计减去金额"><MoneyInput name="taxAmount" min="0" required readOnly value={calculated.taxAmount} /></Field>
        <Field label="附件列表" span={2} hint="可选；仅支持 PDF，每次添加一份，最多 10 份；单个文件不超过 10MB。"><PdfAttachmentInput files={attachmentFiles} onFilesChange={setAttachmentFiles} existingCount={editing?.attachments?.length ?? 0} />{editing && <LedgerAttachmentList objectType="INVOICE" objectId={editing.id} attachments={editing.attachments ?? []} canDelete onDeleted={(attachmentId) => { setEditing((current) => current ? { ...current, attachments: current.attachments.filter((item) => item.id !== attachmentId) } : current); void queryClient.invalidateQueries({ queryKey: ['invoices'] }); }} />}</Field>
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={() => { setModal(false); setEditing(null); setAttachmentFiles([]); }} submitLabel={editing ? '保存修改' : '保存发票'} /></div>
      </form>
    </Modal>
    <Modal open={importOpen} onClose={() => setImportOpen(false)} title="模板导入发票" description="下载模板后使用 Excel 填写，并保持 CSV 格式上传。" size="wide">
      <div className="import-panel">
        <div className="import-instructions">
          <p>发票方向只能填写“已开票”或“已收票”；发票日期填写“年/月/日”，税率按百分数填写，例如 6 表示 6%。</p>
          <p>系统按项目编码匹配进行中的项目，并根据价税合计和税率自动倒算金额与税额。单次最多 1000 行。</p>
        </div>
        <button type="button" className="button secondary" disabled={downloadTemplate.isPending} onClick={() => downloadTemplate.mutate()}><Download size={16} />下载导入模板</button>
        <Field label="选择填写后的 CSV 文件" hint="文件不超过 2MB"><Input type="file" accept=".csv,text/csv" onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); setImportResult(null); importInvoices.reset(); }} /></Field>
        {downloadTemplate.error && <p className="form-error">模板下载失败：{downloadTemplate.error.message}</p>}
        {importInvoices.error && <p className="form-error">导入失败：{importInvoices.error.message}</p>}
        {importResult && <div className={`import-result ${importResult.failureCount ? 'has-errors' : ''}`}><strong>共 {importResult.total} 行，成功 {importResult.successCount} 行，失败 {importResult.failureCount} 行</strong>{importResult.errors.length > 0 && <ul>{importResult.errors.slice(0, 50).map((error) => <li key={`${error.row}-${error.message}`}>第 {error.row} 行：{error.message}</li>)}</ul>}</div>}
        <div className="form-actions"><button type="button" className="button ghost" onClick={() => setImportOpen(false)}>关闭</button><button type="button" className="button primary" disabled={!importFile || importInvoices.isPending} onClick={() => importFile && importInvoices.mutate(importFile)}>{importInvoices.isPending ? '正在导入…' : '开始导入'}</button></div>
      </div>
    </Modal>
    <ConfirmActionModal open={Boolean(voiding)} onClose={() => setVoiding(null)} title="作废发票" description={voiding ? `确认作废“${voiding.project.name}”的这张${voiding.direction === 'ISSUED' ? '已开' : '已收'}发票？${voiding.direction === 'ISSUED' ? '作废后将不再计入项目已开票金额。' : ''}` : ''} confirmLabel="确认作废" pending={voidInvoice.isPending} error={voidInvoice.error} onConfirm={() => voiding && voidInvoice.mutate(voiding.id)} />
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
