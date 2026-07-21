import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
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
  const queryClient = useQueryClient();
  const contracts = useQuery({ queryKey: ['contracts', q], queryFn: () => api.get<ListResponse<Contract>>(`/contracts${queryString({ q, pageSize: 100 })}`) });
  const projects = useQuery({ queryKey: ['projects-options-list'], queryFn: () => api.get<ListResponse<Project>>('/projects?pageSize=100') });
  const organizations = useQuery({ queryKey: ['organization-options', type], queryFn: () => api.get<Organization[]>(`/organizations/options?roleType=${type === 'SUPPORT' ? 'SUPPORTER' : 'EXECUTOR'}`) });
  const create = useMutation({
    mutationFn: (body: Record<string, string>) => api.post('/contracts', { ...body, contractDirection: type === 'SUPPORT' ? 'RECEIVABLE' : 'PAYABLE', contractType: type, status: 'SIGNED' }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['contracts'] }); void queryClient.invalidateQueries({ queryKey: ['projects'] }); setModal(false); },
  });
  const columns: TableColumn<Contract>[] = [
    { key: 'no', label: '合同编号', render: (row) => <span className="mono key-cell">{row.contractNo}</span> },
    { key: 'project', label: '关联项目', render: (row) => <span className="primary-cell"><strong>{row.project.name}</strong><small className="mono">{row.project.projectCode}</small></span> },
    { key: 'type', label: '合同类型', render: (row) => <StatusChip value={row.contractType} /> },
    { key: 'party', label: '合同相对方', render: (row) => row.counterparty.name },
    { key: 'date', label: '签约日期', render: (row) => formatDate(row.signedOn) },
    { key: 'amount', label: '合同金额', className: 'number', render: (row) => formatMoney(row.amount) },
    { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
  ];
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); create.mutate(formObject(event.currentTarget)); }
  return <div className="page-enter">
    <PageHeader eyebrow="业务台账 / 合同" title="合同台账" description="支持协议形成应收，执行协议形成应付；只有已签署合同参与项目汇总。" action={<button className="button primary" onClick={() => setModal(true)}><Plus size={17} />登记合同</button>} />
    <div className="toolbar"><SearchBar value={q} onChange={setQ} placeholder="搜索合同编号、项目或相对方" /><span className="result-count">{contracts.data?.total ?? 0} 份合同</span></div>
    <section className="panel table-panel">{contracts.isLoading ? <LoadingState /> : contracts.error ? <ErrorState error={contracts.error} /> : <DataTable columns={columns} rows={contracts.data?.items ?? []} rowKey={(row) => row.id} />}</section>
    <Modal open={modal} onClose={() => setModal(false)} title="登记合同" description="合同保存为已签署状态后立即进入项目汇总。" size="large">
      <form className="form-grid" onSubmit={submit}>
        <Field label="合同类型"><Select name="contractType" value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="SUPPORT">支持协议</option><option value="EXECUTION">执行协议</option></Select></Field>
        <Field label="合同方向"><Input value={type === 'SUPPORT' ? '应收' : '应付'} disabled /></Field>
        <Field label="合同编号"><Input name="contractNo" required placeholder={type === 'SUPPORT' ? 'SUP-2026-002' : 'EXE-2026-002'} /></Field>
        <Field label="关联项目"><Select name="projectId" required><option value="">请选择项目</option>{projects.data?.items.map((item) => <option key={item.id} value={item.id}>{item.projectCode} · {item.name}</option>)}</Select></Field>
        <Field label={type === 'SUPPORT' ? '支持方' : '执行方'}><Select name="counterpartyId" required><option value="">请选择</option>{organizations.data?.map((item) => <option key={item.id} value={item.id}>{item.organizationCode} · {item.name}</option>)}</Select></Field>
        <Field label="本方合同主体"><Input name="contractEntity" required placeholder="业务主体名称" /></Field>
        <Field label="合同金额"><MoneyInput name="amount" min="0.01" required /></Field>
        <Field label="签约日期"><Input name="signedOn" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
        <Field label="备注" span={2}><Textarea name="remark" /></Field>
        <input type="hidden" name="contractType" value={type} /><input type="hidden" name="contractDirection" value={type === 'SUPPORT' ? 'RECEIVABLE' : 'PAYABLE'} />
        {create.error && <p className="form-error span-2">{create.error.message}</p>}
        <div className="span-2"><FormActions pending={create.isPending} onCancel={() => setModal(false)} submitLabel={`保存${statusLabels[type]}`} /></div>
      </form>
    </Modal>
  </div>;
}
