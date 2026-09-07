import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { DataTable, type TableColumn } from '../components/DataTable';
import { DateInput, Field, FormActions, Input, MoneyInput, Select } from '../components/FormControls';
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
import type { DonationReceipt, DonationReceiptListResponse } from '../lib/types';

const formatRate = (value: string) => `${Number(value) * 100}%`;
const formatRateInput = (value: string) => String(Number(value) * 100);

export function DonationReceiptsPage() {
  const { user } = useAuth();
  const canCreate = hasPermission(user, 'DONATION_RECEIPTS', 'ENTRY');
  const canEdit = hasPermission(user, 'DONATION_RECEIPTS', 'EDIT');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ q: '', status: '', issuedFrom: '', issuedTo: '' });
  const [draft, setDraft] = useState(filters);
  const [editing, setEditing] = useState<DonationReceipt | null>(null);
  const [creating, setCreating] = useState(false);
  const [voiding, setVoiding] = useState<DonationReceipt | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [totalAmount, setTotalAmount] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [notice, setNotice] = useState('');
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['donation-receipts', filters, page],
    queryFn: () => api.get<DonationReceiptListResponse>(`/donation-receipts${queryString({ ...filters, page, pageSize: DEFAULT_PAGE_SIZE })}`),
  });
  const save = useMutation({
    mutationFn: async ({ body, attachments }: { body: Record<string, string>; attachments: File[] }) => {
      const receipt = editing ? await api.patch<DonationReceipt>(`/donation-receipts/${editing.id}`, body) : await api.post<DonationReceipt>('/donation-receipts', body);
      return { failedUploads: await uploadLedgerAttachments('DONATION_RECEIPT', receipt.id, attachments) };
    },
    onSuccess: ({ failedUploads }) => {
      void queryClient.invalidateQueries({ queryKey: ['donation-receipts'] });
      setNotice(failedUploads ? `捐赠票据已保存，但有 ${failedUploads} 个附件上传失败，请编辑后重试。` : '');
      closeEditor();
    },
  });
  const voidReceipt = useMutation({ mutationFn: (id: string) => api.post(`/donation-receipts/${id}/void`), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['donation-receipts'] }); setVoiding(null); } });
  const calculated = calculateDonationAmounts(totalAmount, taxRate);

  const columns: TableColumn<DonationReceipt>[] = [
    { key: 'donor', label: '捐赠人', render: (row) => <span className="primary-cell"><strong>{row.donorName}</strong><small>{row.phoneMasked || '—'}</small></span> },
    { key: 'date', label: '发票日期', render: (row) => formatDate(row.issuedOn) },
    { key: 'type', label: '发票类型 / 平台', render: (row) => <span>{row.invoiceType}<small className="block-muted">{row.invoicePlatform}</small></span> },
    { key: 'seller', label: '销售方名称', render: (row) => row.sellerName },
    { key: 'amount', label: '金额', className: 'number', render: (row) => formatMoney(row.amountExcludingTax) },
    { key: 'tax', label: '税率 / 税额', className: 'number', render: (row) => <span>{formatRate(row.taxRate)}<small className="block-muted">{formatMoney(row.taxAmount)}</small></span> },
    { key: 'total', label: '价税合计', className: 'number', render: (row) => <strong>{formatMoney(row.totalAmount)}</strong> },
    { key: 'attachments', label: '附件列表', render: (row) => <LedgerAttachmentList objectType="DONATION_RECEIPT" objectId={row.id} attachments={row.attachments ?? []} /> },
    { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
  ];
  if (canEdit) columns.push({ key: 'action', label: '操作', render: (row) => <span className="row-actions"><button type="button" className="table-action" disabled={row.status === 'VOID'} onClick={() => openEditor(row)}><Pencil size={14} />编辑</button>{row.status !== 'VOID' && <button type="button" className="table-action danger" onClick={() => setVoiding(row)}><Trash2 size={14} />作废</button>}</span> });

  function openEditor(receipt?: DonationReceipt) {
    setEditing(receipt ?? null);
    setCreating(!receipt);
    setFiles([]);
    setTotalAmount(receipt?.totalAmount ?? '');
    setTaxRate(receipt ? formatRateInput(receipt.taxRate) : '');
    setNotice('');
    save.reset();
  }
  function closeEditor() { setEditing(null); setCreating(false); setFiles([]); setTotalAmount(''); setTaxRate(''); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = formObject(event.currentTarget);
    body.taxRate = (Number(body.taxRate) / 100).toString();
    if (editing && !body.phone) delete body.phone;
    save.mutate({ body, attachments: files });
  }
  function applyFilters(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setFilters(draft); setPage(1); setFiltersOpen(false); }
  const filterSummary = [filters.q && `关键词：${filters.q}`, filters.status && (filters.status === 'NORMAL' ? '正常' : '已作废'), (filters.issuedFrom || filters.issuedTo) && `${filters.issuedFrom || '不限'} 至 ${filters.issuedTo || '不限'}`].filter(Boolean).join(' · ');

  return <div className="page-enter">
    <PageHeader eyebrow="业务台账 / 发票台账" title="捐赠票据" description="捐赠票据信息独立录入，不关联项目、PM 或会员。" action={(user?.role === 'SYSTEM_ADMIN' || canCreate) ? <div className="button-group">{user?.role === 'SYSTEM_ADMIN' && <LedgerExportButton dataset="donation-receipts" fileName="捐赠票据台账" filters={{ q: filters.q, donationStatus: filters.status, donationIssuedFrom: filters.issuedFrom, donationIssuedTo: filters.issuedTo }} />}{canCreate && <button type="button" className="button primary" onClick={() => openEditor()}><Plus size={17} />登记捐赠票据</button>}</div> : undefined} />
    {notice && <div className="operation-banner">{notice}</div>}
    <section className="invoice-summary-strip donation-summary-strip"><span><small>有效票据数</small><strong>{query.data?.summary.count ?? 0} 张</strong></span><i /><span><small>有效票据价税合计</small><strong>{formatMoney(query.data?.summary.amount)}</strong></span></section>
    <div className="toolbar"><div className={`expert-filter-popover${filtersOpen ? ' open' : ''}`}><button type="button" className="expert-filter-trigger" onClick={() => { setDraft(filters); setFiltersOpen((value) => !value); }}><Search size={16} /><span><strong>{filterSummary || '搜索与筛选捐赠票据'}</strong><small>捐赠人、发票信息、日期和状态</small></span><SlidersHorizontal size={16} /></button>{filtersOpen && <form className="expert-filter-panel" onSubmit={applyFilters}><div className="expert-filter-panel-heading"><span><strong>筛选捐赠票据</strong><small>未选择的条件默认不限</small></span><button type="button" onClick={() => setDraft({ q: '', status: '', issuedFrom: '', issuedTo: '' })}><RotateCcw size={13} />清空条件</button></div><label><span>关键词</span><Input value={draft.q} onChange={(event) => setDraft((value) => ({ ...value, q: event.target.value }))} /></label><label><span>发票日期</span><span className="expert-filter-date-range"><DateInput aria-label="发票日期起始" defaultValue={draft.issuedFrom} onValueChange={(value) => setDraft((current) => ({ ...current, issuedFrom: value }))} /><em>至</em><DateInput aria-label="发票日期结束" defaultValue={draft.issuedTo} onValueChange={(value) => setDraft((current) => ({ ...current, issuedTo: value }))} /></span></label><label><span>状态</span><Select value={draft.status} onChange={(event) => setDraft((value) => ({ ...value, status: event.target.value }))}><option value="">全部状态</option><option value="NORMAL">正常</option><option value="VOID">已作废</option></Select></label><div className="expert-filter-actions"><button type="button" className="button ghost" onClick={() => setFiltersOpen(false)}>取消</button><button type="submit" className="button primary">应用筛选</button></div></form>}</div><span className="result-count">{query.data?.total ?? 0} 张票据</span></div>
    <section className="panel table-panel">{query.isLoading ? <LoadingState /> : query.error ? <ErrorState error={query.error} /> : <><DataTable tableId="donation-receipts" columns={columns} rows={query.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={query.data?.total ?? 0} onPageChange={setPage} /></>}</section>
    <Modal open={creating || Boolean(editing)} onClose={closeEditor} title={editing ? '编辑捐赠票据' : '登记捐赠票据'} description="填写价税合计和税率后，金额与税额自动倒算。" size="large"><form key={editing?.id ?? 'new'} className="form-grid" onSubmit={submit}><Field label="捐赠人"><Input name="donorName" required defaultValue={editing?.donorName ?? ''} /></Field><Field label="手机号" hint={editing ? `留空保持原手机号（当前：${editing.phoneMasked || '未填写'}）` : undefined}><Input name="phone" required={!editing} /></Field><Field label="发票日期"><DateInput name="issuedOn" required aria-label="发票日期" defaultValue={editing?.issuedOn.slice(0, 10) ?? ''} /></Field><Field label="发票类型"><Input name="invoiceType" required defaultValue={editing?.invoiceType ?? ''} /></Field><Field label="开票平台"><Input name="invoicePlatform" required defaultValue={editing?.invoicePlatform ?? ''} /></Field><Field label="销售方名称"><Input name="sellerName" required defaultValue={editing?.sellerName ?? ''} /></Field><Field label="价税合计"><MoneyInput name="totalAmount" min="0" required value={totalAmount} onChange={(event) => setTotalAmount(event.target.value)} /></Field><Field label="税率" hint="按百分数填写，例如 6 表示 6%"><MoneyInput name="taxRate" min="0" max="100" step="0.01" required value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /></Field><Field label="金额" hint="根据价税合计和税率自动倒算"><MoneyInput name="amountExcludingTax" min="0" required readOnly value={calculated.amountExcludingTax} /></Field><Field label="税额" hint="价税合计减去金额"><MoneyInput name="taxAmount" min="0" required readOnly value={calculated.taxAmount} /></Field><Field label="附件列表" span={2} hint="可选；仅支持 PDF，每次添加一份，最多 10 份；单个文件不超过 10MB。"><PdfAttachmentInput files={files} onFilesChange={setFiles} existingCount={editing?.attachments?.length ?? 0} />{editing && <LedgerAttachmentList objectType="DONATION_RECEIPT" objectId={editing.id} attachments={editing.attachments} canDelete onDeleted={(attachmentId) => setEditing((current) => current ? { ...current, attachments: current.attachments.filter((item) => item.id !== attachmentId) } : current)} />}</Field>{save.error && <p className="form-error span-2">{save.error.message}</p>}<div className="span-2"><FormActions pending={save.isPending} onCancel={closeEditor} submitLabel={editing ? '保存修改' : '保存票据'} /></div></form></Modal>
    <ConfirmActionModal open={Boolean(voiding)} onClose={() => setVoiding(null)} onConfirm={() => voiding && voidReceipt.mutate(voiding.id)} pending={voidReceipt.isPending} error={voidReceipt.error} title="作废捐赠票据" description={voiding ? `确认作废“${voiding.donorName}”的捐赠票据？作废后保留历史记录，但不再计入统计。` : ''} confirmLabel="确认作废" />
  </div>;
}

export function calculateDonationAmounts(totalAmount: string, taxRatePercent: string) {
  if (totalAmount.trim() === '' || taxRatePercent.trim() === '') return { amountExcludingTax: '', taxAmount: '' };
  const total = Number(totalAmount);
  const rate = Number(taxRatePercent) / 100;
  if (!Number.isFinite(total) || !Number.isFinite(rate) || rate <= -1) return { amountExcludingTax: '', taxAmount: '' };
  const amount = Math.round((total / (1 + rate) + Number.EPSILON) * 100) / 100;
  const tax = Math.round((total - amount + Number.EPSILON) * 100) / 100;
  return { amountExcludingTax: amount.toFixed(2), taxAmount: tax.toFixed(2) };
}
