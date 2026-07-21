import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { Field, FormActions, Input, MoneyInput, Select } from '../components/FormControls';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { SearchBar } from '../components/SearchBar';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { api, queryString } from '../lib/api';
import { formObject } from '../lib/form';
import { formatDate, formatMoney } from '../lib/format';
import type { Invoice, ListResponse, Project } from '../lib/types';

export function InvoicesPage() {
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [kind, setKind] = useState<'BLUE' | 'RED'>('BLUE');
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const queryClient = useQueryClient();
  const invoices = useQuery({ queryKey: ['invoices', q], queryFn: () => api.get<ListResponse<Invoice>>(`/invoices${queryString({ q, pageSize: 100 })}`) });
  const projects = useQuery({ queryKey: ['projects-options-list'], queryFn: () => api.get<ListResponse<Project>>('/projects?pageSize=100') });
  const save = useMutation({
    mutationFn: (body: Record<string, string>) => editing ? api.patch(`/invoices/${editing.id}`, body) : api.post('/invoices', body),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['invoices'] }); void queryClient.invalidateQueries({ queryKey: ['projects'] }); setModal(false); setEditing(null); setProjectId(''); setKind('BLUE'); },
  });
  const voidInvoice = useMutation({
    mutationFn: (id: string) => api.post(`/invoices/${id}/void`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['invoices'] }); void queryClient.invalidateQueries({ queryKey: ['projects'] }); setVoiding(null); },
  });
  const columns: TableColumn<Invoice>[] = [
    { key: 'no', label: '发票号码', render: (row) => <span className="mono key-cell">{row.invoiceNumber}</span> },
    { key: 'project', label: '关联项目', render: (row) => <span className="primary-cell"><strong>{row.project.name}</strong><small className="mono">{row.project.projectCode}</small></span> },
    { key: 'date', label: '开票日期', render: (row) => formatDate(row.issuedOn) },
    { key: 'type', label: '发票类型', render: (row) => <span>{row.invoiceType}<small className="block-muted">{row.invoicePlatform}</small></span> },
    { key: 'buyer', label: '购买方', render: (row) => row.buyerName },
    { key: 'tax', label: '税额', className: 'number', render: (row) => formatMoney(row.taxAmount) },
    { key: 'total', label: '价税合计', className: 'number', render: (row) => <strong>{formatMoney(row.totalAmount)}</strong> },
    { key: 'status', label: '状态', render: (row) => <><StatusChip value={row.kind} /> <StatusChip value={row.status} /></> },
    { key: 'action', label: '', render: (row) => <span className="row-actions"><button className="table-action" disabled={row.status === 'VOID'} onClick={() => { setProjectId(row.projectId ?? row.project.id); setKind(row.kind as typeof kind); setEditing(row); }}><Pencil size={14} />编辑</button>{row.status !== 'VOID' && <button className="table-action danger" onClick={() => setVoiding(row)}><Trash2 size={14} />作废</button>}</span> },
  ];
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = formObject(event.currentTarget);
    if (editing) { delete body.kind; delete body.originalInvoiceId; }
    save.mutate(body);
  }
  return <div className="page-enter">
    <PageHeader eyebrow="业务台账 / 发票" title="发票台账" description="有效蓝票增加已开票金额，红字发票冲减项目已开票金额。" action={<button className="button primary" onClick={() => { setProjectId(''); setKind('BLUE'); setModal(true); }}><Plus size={17} />登记发票</button>} />
    <div className="toolbar"><SearchBar value={q} onChange={setQ} placeholder="搜索发票号码、项目或购买方" /><span className="result-count">{invoices.data?.total ?? 0} 张发票</span></div>
    <section className="panel table-panel">{invoices.isLoading ? <LoadingState /> : invoices.error ? <ErrorState error={invoices.error} /> : <DataTable columns={columns} rows={invoices.data?.items ?? []} rowKey={(row) => row.id} />}</section>
    <Modal open={modal || Boolean(editing)} onClose={() => { setModal(false); setEditing(null); }} title={editing ? '编辑发票' : '登记发票'} description={editing ? '已作废发票不能编辑；修改后重新计算项目开票汇总。' : '价税合计会在保存时进行二次校验。'} size="large">
      <form className="form-grid" onSubmit={submit} key={editing?.id ?? 'new'}>
        <Field label="关联项目" span={2}><Select name="projectId" required value={projectId} disabled={editing?.kind === 'RED'} onChange={(event) => setProjectId(event.target.value)}><option value="">请选择项目</option>{projects.data?.items.map((item) => <option key={item.id} value={item.id}>{item.projectCode} · {item.name}</option>)}</Select></Field>
        <Field label="发票代码"><Input name="invoiceCode" defaultValue={editing?.invoiceCode} /></Field><Field label="发票号码"><Input name="invoiceNumber" required defaultValue={editing?.invoiceNumber} /></Field>
        <Field label="开票日期"><Input name="issuedOn" type="date" required defaultValue={editing?.issuedOn.slice(0, 10) ?? new Date().toISOString().slice(0, 10)} /></Field>
        <Field label="发票性质"><Select name="kind" value={kind} disabled={Boolean(editing)} onChange={(event) => setKind(event.target.value as 'BLUE' | 'RED')}><option value="BLUE">蓝票</option><option value="RED">红票</option></Select></Field>
        {!editing && kind === 'RED' && <Field label="关联原蓝票" span={2}><Select name="originalInvoiceId" required disabled={!projectId}><option value="">{projectId ? '请选择该项目的有效蓝票' : '请先选择项目'}</option>{invoices.data?.items.filter((item) => item.kind === 'BLUE' && item.status === 'NORMAL' && item.project.id === projectId).map((item) => <option key={item.id} value={item.id}>{item.invoiceNumber} · {formatMoney(item.totalAmount)}</option>)}</Select></Field>}
        <Field label="发票类型"><Input name="invoiceType" required defaultValue={editing?.invoiceType} /></Field><Field label="开票平台"><Input name="invoicePlatform" required defaultValue={editing?.invoicePlatform} /></Field>
        <Field label="购买方名称" span={2}><Input name="buyerName" required defaultValue={editing?.buyerName} /></Field>
        <Field label="不含税金额"><MoneyInput name="amountExcludingTax" min="0" required defaultValue={editing?.amountExcludingTax} /></Field><Field label="税率"><Input name="taxRate" type="number" min="0" max="1" step="0.000001" required defaultValue={editing?.taxRate} /></Field>
        <Field label="税额"><MoneyInput name="taxAmount" min="0" required defaultValue={editing?.taxAmount} /></Field><Field label="价税合计"><MoneyInput name="totalAmount" min="0" required defaultValue={editing?.totalAmount} /></Field>
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={() => { setModal(false); setEditing(null); }} submitLabel={editing ? '保存修改' : '保存发票'} /></div>
      </form>
    </Modal>
    <ConfirmActionModal open={Boolean(voiding)} onClose={() => setVoiding(null)} title="作废发票" description={`发票“${voiding?.invoiceNumber ?? ''}”作废后将不再计入项目已开票金额。`} confirmLabel="确认作废" pending={voidInvoice.isPending} error={voidInvoice.error} onConfirm={() => voiding && voidInvoice.mutate(voiding.id)} />
  </div>;
}
