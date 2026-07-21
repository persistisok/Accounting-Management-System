import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
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
  const queryClient = useQueryClient();
  const invoices = useQuery({ queryKey: ['invoices', q], queryFn: () => api.get<ListResponse<Invoice>>(`/invoices${queryString({ q, pageSize: 100 })}`) });
  const projects = useQuery({ queryKey: ['projects-options-list'], queryFn: () => api.get<ListResponse<Project>>('/projects?pageSize=100') });
  const create = useMutation({
    mutationFn: (body: Record<string, string>) => api.post('/invoices', body),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['invoices'] }); void queryClient.invalidateQueries({ queryKey: ['projects'] }); setModal(false); setProjectId(''); setKind('BLUE'); },
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
  ];
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); create.mutate(formObject(event.currentTarget)); }
  return <div className="page-enter">
    <PageHeader eyebrow="业务台账 / 发票" title="发票台账" description="有效蓝票增加已开票金额，红字发票冲减项目已开票金额。" action={<button className="button primary" onClick={() => setModal(true)}><Plus size={17} />登记发票</button>} />
    <div className="toolbar"><SearchBar value={q} onChange={setQ} placeholder="搜索发票号码、项目或购买方" /><span className="result-count">{invoices.data?.total ?? 0} 张发票</span></div>
    <section className="panel table-panel">{invoices.isLoading ? <LoadingState /> : invoices.error ? <ErrorState error={invoices.error} /> : <DataTable columns={columns} rows={invoices.data?.items ?? []} rowKey={(row) => row.id} />}</section>
    <Modal open={modal} onClose={() => setModal(false)} title="登记发票" description="价税合计会在保存时进行二次校验。" size="large">
      <form className="form-grid" onSubmit={submit}>
        <Field label="关联项目" span={2}><Select name="projectId" required value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">请选择项目</option>{projects.data?.items.map((item) => <option key={item.id} value={item.id}>{item.projectCode} · {item.name}</option>)}</Select></Field>
        <Field label="发票代码"><Input name="invoiceCode" /></Field><Field label="发票号码"><Input name="invoiceNumber" required /></Field>
        <Field label="开票日期"><Input name="issuedOn" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
        <Field label="发票性质"><Select name="kind" value={kind} onChange={(event) => setKind(event.target.value as 'BLUE' | 'RED')}><option value="BLUE">蓝票</option><option value="RED">红票</option></Select></Field>
        {kind === 'RED' && <Field label="关联原蓝票" span={2}><Select name="originalInvoiceId" required disabled={!projectId}><option value="">{projectId ? '请选择该项目的有效蓝票' : '请先选择项目'}</option>{invoices.data?.items.filter((item) => item.kind === 'BLUE' && item.status === 'NORMAL' && item.project.id === projectId).map((item) => <option key={item.id} value={item.id}>{item.invoiceNumber} · {formatMoney(item.totalAmount)}</option>)}</Select></Field>}
        <Field label="发票类型"><Input name="invoiceType" required placeholder="增值税普通发票" /></Field><Field label="开票平台"><Input name="invoicePlatform" required placeholder="电子税务平台" /></Field>
        <Field label="购买方名称" span={2}><Input name="buyerName" required /></Field>
        <Field label="不含税金额"><MoneyInput name="amountExcludingTax" min="0" required /></Field><Field label="税率"><Input name="taxRate" type="number" min="0" max="1" step="0.000001" required placeholder="0.06" /></Field>
        <Field label="税额"><MoneyInput name="taxAmount" min="0" required /></Field><Field label="价税合计"><MoneyInput name="totalAmount" min="0" required /></Field>
        {create.error && <p className="form-error span-2">{create.error.message}</p>}
        <div className="span-2"><FormActions pending={create.isPending} onCancel={() => setModal(false)} submitLabel="保存发票" /></div>
      </form>
    </Modal>
  </div>;
}
