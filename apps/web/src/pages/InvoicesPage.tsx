import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { DateInput, Field, FormActions, Input, MoneyInput, SearchableSelect } from '../components/FormControls';
import { LedgerAttachmentList, PdfAttachmentInput, uploadLedgerAttachments } from '../components/LedgerAttachments';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_PAGE_SIZE, Pagination } from '../components/Pagination';
import { SearchBar } from '../components/SearchBar';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { api, queryString } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formObject } from '../lib/form';
import { formatDate, formatMoney } from '../lib/format';
import type { Invoice, ListResponse, Project } from '../lib/types';

export function InvoicesPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'SYSTEM_ADMIN' || user?.role === 'ADMIN';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState('');
  const queryClient = useQueryClient();
  const invoices = useQuery({ queryKey: ['invoices', q, page], queryFn: () => api.get<ListResponse<Invoice>>(`/invoices${queryString({ q, page, pageSize: DEFAULT_PAGE_SIZE })}`) });
  const projects = useQuery({ queryKey: ['project-options'], queryFn: () => api.get<Pick<Project, 'id' | 'projectCode' | 'name'>[]>('/projects/options') });
  const save = useMutation({
    mutationFn: async ({ body, files }: { body: Record<string, string>; files: File[] }) => {
      const invoice = editing ? await api.patch<Invoice>(`/invoices/${editing.id}`, body) : await api.post<Invoice>('/invoices', body);
      return { failedUploads: await uploadLedgerAttachments('INVOICE', invoice.id, files) };
    },
    onSuccess: ({ failedUploads }) => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] }); void queryClient.invalidateQueries({ queryKey: ['projects'] });
      setNotice(failedUploads ? `发票已保存，但有 ${failedUploads} 个附件上传失败，请编辑发票后重试。` : '');
      setModal(false); setEditing(null); setAttachmentFiles([]); setAmount(''); setTaxRate('');
    },
  });
  const voidInvoice = useMutation({
    mutationFn: (id: string) => api.post(`/invoices/${id}/void`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['invoices'] }); void queryClient.invalidateQueries({ queryKey: ['projects'] }); setVoiding(null); },
  });
  const columns: TableColumn<Invoice>[] = [
    { key: 'project', label: '关联项目', render: (row) => <span className="primary-cell"><strong>{row.project.name}</strong><small className="mono">{row.project.projectCode}</small></span> },
    { key: 'date', label: '开票日期', render: (row) => formatDate(row.issuedOn) },
    { key: 'type', label: '开票类型 / 平台', render: (row) => <span>{row.invoiceType}<small className="block-muted">{row.invoicePlatform}</small></span> },
    { key: 'buyer', label: '购买方名称', render: (row) => row.buyerName },
    { key: 'amount', label: '金额', className: 'number', render: (row) => formatMoney(row.amountExcludingTax) },
    { key: 'tax', label: '税率 / 税额', className: 'number', render: (row) => <span>{formatRate(row.taxRate)}<small className="block-muted">{formatMoney(row.taxAmount)}</small></span> },
    { key: 'total', label: '价税合计', className: 'number', render: (row) => <strong>{formatMoney(row.totalAmount)}</strong> },
    { key: 'attachments', label: '附件列表', render: (row) => <LedgerAttachmentList objectType="INVOICE" objectId={row.id} attachments={row.attachments ?? []} /> },
    { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
  ];
  if (canEdit) columns.push({ key: 'action', label: '', render: (row) => <span className="row-actions"><button className="table-action" disabled={row.status === 'VOID'} onClick={() => { setAmount(row.amountExcludingTax); setTaxRate(formatRateInput(row.taxRate)); setAttachmentFiles([]); setNotice(''); setEditing(row); }}><Pencil size={14} />编辑</button>{row.status !== 'VOID' && <button className="table-action danger" onClick={() => setVoiding(row)}><Trash2 size={14} />作废</button>}</span> });
  const calculated = calculateInvoiceAmounts(amount, taxRate);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = formObject(event.currentTarget);
    body.taxRate = (Number(body.taxRate) / 100).toString();
    save.mutate({ body, files: attachmentFiles });
  }
  return <div className="page-enter">
    <PageHeader eyebrow="业务台账 / 发票" title="发票台账" description="按项目登记开票信息，价税合计同步计入项目已开票金额。" action={canEdit ? <button className="button primary" onClick={() => { setAmount(''); setTaxRate(''); setAttachmentFiles([]); setNotice(''); setModal(true); }}><Plus size={17} />登记发票</button> : undefined} />
    {notice && <div className="operation-banner">{notice}</div>}
    <div className="toolbar"><SearchBar value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="搜索项目、开票类型、平台或购买方" /><span className="result-count">{invoices.data?.total ?? 0} 张发票</span></div>
    <section className="panel table-panel">{invoices.isLoading ? <LoadingState /> : invoices.error ? <ErrorState error={invoices.error} /> : <><DataTable columns={columns} rows={invoices.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={invoices.data?.total ?? 0} onPageChange={setPage} /></>}</section>
    <Modal open={modal || Boolean(editing)} onClose={() => { setModal(false); setEditing(null); setAttachmentFiles([]); }} title={editing ? '编辑发票' : '登记发票'} description="填写金额和税率后，税额与价税合计自动计算。" size="large">
      <form className="form-grid" onSubmit={submit} key={editing?.id ?? 'new'}>
        <Field label="关联项目" span={2}><SearchableSelect name="projectId" ariaLabel="关联项目" required defaultValue={editing?.projectId ?? editing?.project.id ?? ''} disabled={projects.isLoading || projects.isError} placeholder="请选择关联项目" searchPlaceholder="搜索项目编码或名称" options={(projects.data ?? []).map((item) => ({ value: item.id, label: `${item.projectCode} · ${item.name}` }))} /></Field>
        <Field label="开票日期"><DateInput name="issuedOn" aria-label="开票日期" required defaultValue={editing?.issuedOn.slice(0, 10) ?? ''} /></Field>
        <Field label="开票类型"><Input name="invoiceType" required defaultValue={editing?.invoiceType ?? ''} /></Field>
        <Field label="开票平台"><Input name="invoicePlatform" required defaultValue={editing?.invoicePlatform ?? ''} /></Field><Field label="购买方名称"><Input name="buyerName" required defaultValue={editing?.buyerName ?? ''} /></Field>
        <Field label="金额"><MoneyInput name="amountExcludingTax" min="0" required value={amount} onChange={(event) => setAmount(event.target.value)} /></Field><Field label="税率" hint="按百分数填写，例如 6 表示 6%"><MoneyInput name="taxRate" min="0" max="100" step="0.01" required value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /></Field>
        <Field label="税额" hint="根据金额和税率自动计算"><MoneyInput name="taxAmount" min="0" required readOnly value={calculated.taxAmount} /></Field><Field label="价税合计" hint="金额与税额之和"><MoneyInput name="totalAmount" min="0" required readOnly value={calculated.totalAmount} /></Field>
        <Field label="附件列表" span={2} hint="可选；仅支持 PDF，每次添加一份，最多 10 份；单个文件不超过 10MB。"><PdfAttachmentInput files={attachmentFiles} onFilesChange={setAttachmentFiles} existingCount={editing?.attachments?.length ?? 0} />{editing && <LedgerAttachmentList objectType="INVOICE" objectId={editing.id} attachments={editing.attachments ?? []} canDelete onDeleted={(attachmentId) => { setEditing((current) => current ? { ...current, attachments: current.attachments.filter((item) => item.id !== attachmentId) } : current); void queryClient.invalidateQueries({ queryKey: ['invoices'] }); }} />}</Field>
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={() => { setModal(false); setEditing(null); setAttachmentFiles([]); }} submitLabel={editing ? '保存修改' : '保存发票'} /></div>
      </form>
    </Modal>
    <ConfirmActionModal open={Boolean(voiding)} onClose={() => setVoiding(null)} title="作废发票" description={voiding ? `“${voiding.project.name}”开给“${voiding.buyerName}”的发票作废后将不再计入项目已开票金额。` : ''} confirmLabel="确认作废" pending={voidInvoice.isPending} error={voidInvoice.error} onConfirm={() => voiding && voidInvoice.mutate(voiding.id)} />
  </div>;
}

function formatRate(value: string) {
  return `${formatRateInput(value)}%`;
}

function formatRateInput(value: string) {
  return Number((Number(value) * 100).toFixed(4)).toString();
}

export function calculateInvoiceAmounts(amount: string, taxRatePercent: string) {
  if (amount.trim() === '' || taxRatePercent.trim() === '') return { taxAmount: '', totalAmount: '' };
  const amountValue = Number(amount);
  const rateValue = Number(taxRatePercent);
  if (!Number.isFinite(amountValue) || !Number.isFinite(rateValue)) return { taxAmount: '', totalAmount: '' };
  const taxAmount = Math.round((amountValue * rateValue / 100 + Number.EPSILON) * 100) / 100;
  const totalAmount = Math.round((amountValue + taxAmount + Number.EPSILON) * 100) / 100;
  return { taxAmount: taxAmount.toFixed(2), totalAmount: totalAmount.toFixed(2) };
}
