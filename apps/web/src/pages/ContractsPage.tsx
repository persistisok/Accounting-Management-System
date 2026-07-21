import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { Field, FormActions, Input, MoneyInput, Select, Textarea } from '../components/FormControls';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { SearchBar } from '../components/SearchBar';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { api, queryString } from '../lib/api';
import { formObject } from '../lib/form';
import { formatDate, formatMoney, statusLabels } from '../lib/format';
import type { Contract, ListResponse, Organization, Project } from '../lib/types';

export function ContractsPage() {
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(false);
  const [type, setType] = useState<'SUPPORT' | 'EXECUTION'>('SUPPORT');
  const [editing, setEditing] = useState<Contract | null>(null);
  const [voiding, setVoiding] = useState<Contract | null>(null);
  const queryClient = useQueryClient();
  const contracts = useQuery({ queryKey: ['contracts', q], queryFn: () => api.get<ListResponse<Contract>>(`/contracts${queryString({ q, pageSize: 100 })}`) });
  const projects = useQuery({ queryKey: ['projects-options-list'], queryFn: () => api.get<ListResponse<Project>>('/projects?pageSize=100') });
  const organizations = useQuery({ queryKey: ['organization-options', type], queryFn: () => api.get<Organization[]>(`/organizations/options?roleType=${type === 'SUPPORT' ? 'SUPPORTER' : 'EXECUTOR'}`) });
  const save = useMutation({
    mutationFn: (body: Record<string, string>) => editing
      ? api.patch(`/contracts/${editing.id}`, { ...body, contractDirection: type === 'SUPPORT' ? 'RECEIVABLE' : 'PAYABLE', contractType: type })
      : api.post('/contracts', { ...body, contractDirection: type === 'SUPPORT' ? 'RECEIVABLE' : 'PAYABLE', contractType: type, status: 'SIGNED' }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['contracts'] }); void queryClient.invalidateQueries({ queryKey: ['projects'] }); setModal(false); setEditing(null); },
  });
  const voidContract = useMutation({
    mutationFn: (id: string) => api.post(`/contracts/${id}/void`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['contracts'] }); void queryClient.invalidateQueries({ queryKey: ['projects'] }); setVoiding(null); },
  });
  const columns: TableColumn<Contract>[] = [
    { key: 'no', label: '合同编号', render: (row) => <span className="mono key-cell">{row.contractNo}</span> },
    { key: 'project', label: '关联项目', render: (row) => <span className="primary-cell"><strong>{row.project.name}</strong><small className="mono">{row.project.projectCode}</small></span> },
    { key: 'type', label: '合同类型', render: (row) => <StatusChip value={row.contractType} /> },
    { key: 'party', label: '合同相对方', render: (row) => row.counterparty.name },
    { key: 'date', label: '签约日期', render: (row) => formatDate(row.signedOn) },
    { key: 'amount', label: '合同金额', className: 'number', render: (row) => formatMoney(row.amount) },
    { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
    { key: 'action', label: '', render: (row) => <span className="row-actions"><button className="table-action" disabled={row.status === 'VOID' || row.status === 'TERMINATED'} onClick={() => { setType(row.contractType as typeof type); setEditing(row); }}><Pencil size={14} />编辑</button>{row.status !== 'VOID' && <button className="table-action danger" onClick={() => setVoiding(row)}><Trash2 size={14} />作废</button>}</span> },
  ];
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); save.mutate(formObject(event.currentTarget)); }
  return <div className="page-enter">
    <PageHeader eyebrow="业务台账 / 合同" title="合同台账" description="支持协议形成应收，执行协议形成应付；只有已签署合同参与项目汇总。" action={<button className="button primary" onClick={() => { setType('SUPPORT'); setModal(true); }}><Plus size={17} />登记合同</button>} />
    <div className="toolbar"><SearchBar value={q} onChange={setQ} placeholder="搜索合同编号、项目或相对方" /><span className="result-count">{contracts.data?.total ?? 0} 份合同</span></div>
    <section className="panel table-panel">{contracts.isLoading ? <LoadingState /> : contracts.error ? <ErrorState error={contracts.error} /> : <DataTable columns={columns} rows={contracts.data?.items ?? []} rowKey={(row) => row.id} />}</section>
    <Modal open={modal || Boolean(editing)} onClose={() => { setModal(false); setEditing(null); }} title={editing ? '编辑合同' : '登记合同'} description={editing ? '修改会保留审计记录并重新计算项目汇总。' : '合同保存为已签署状态后立即进入项目汇总。'} size="large">
      <form className="form-grid" onSubmit={submit} key={editing?.id ?? 'new'}>
        <Field label="合同类型"><Select name="contractType" value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="SUPPORT">支持协议</option><option value="EXECUTION">执行协议</option></Select></Field>
        <Field label="合同方向"><Input value={type === 'SUPPORT' ? '应收' : '应付'} disabled /></Field>
        <Field label="合同编号"><Input name="contractNo" required defaultValue={editing?.contractNo} /></Field>
        <Field label="关联项目"><Select name="projectId" required defaultValue={editing?.projectId ?? editing?.project.id ?? ''}><option value="">请选择项目</option>{projects.data?.items.map((item) => <option key={item.id} value={item.id}>{item.projectCode} · {item.name}</option>)}</Select></Field>
        <Field label={type === 'SUPPORT' ? '支持方' : '执行方'}><Select name="counterpartyId" required defaultValue={editing?.counterpartyId ?? editing?.counterparty.id ?? ''}><option value="">请选择</option>{organizations.data?.map((item) => <option key={item.id} value={item.id}>{item.organizationCode} · {item.name}</option>)}</Select></Field>
        <Field label="本方合同主体"><Input name="contractEntity" required defaultValue={editing?.contractEntity} /></Field>
        <Field label="合同金额"><MoneyInput name="amount" min="0.01" required defaultValue={editing?.amount} /></Field>
        <Field label="签约日期"><Input name="signedOn" type="date" required defaultValue={editing?.signedOn.slice(0, 10) ?? new Date().toISOString().slice(0, 10)} /></Field>
        <Field label="备注" span={2}><Textarea name="remark" defaultValue={editing?.remark} /></Field>
        <input type="hidden" name="contractDirection" value={type === 'SUPPORT' ? 'RECEIVABLE' : 'PAYABLE'} />
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={() => { setModal(false); setEditing(null); }} submitLabel={editing ? '保存修改' : `保存${statusLabels[type]}`} /></div>
      </form>
    </Modal>
    <ConfirmActionModal open={Boolean(voiding)} onClose={() => setVoiding(null)} title="作废合同" description={`合同“${voiding?.contractNo ?? ''}”作废后将不再参与项目应收或应付汇总。`} confirmLabel="确认作废" pending={voidContract.isPending} error={voidContract.error} onConfirm={() => voiding && voidContract.mutate(voiding.id)} />
  </div>;
}
