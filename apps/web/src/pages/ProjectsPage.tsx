import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataTable, type TableColumn } from '../components/DataTable';
import { Field, FormActions, Input, MoneyInput, Select, Textarea } from '../components/FormControls';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { SearchBar } from '../components/SearchBar';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { api, queryString } from '../lib/api';
import { formObject } from '../lib/form';
import { formatMoney, formatProjectPeriod } from '../lib/format';
import type { ListResponse, Project, User } from '../lib/types';

export function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [modal, setModal] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ['projects', q], queryFn: () => api.get<ListResponse<Project>>(`/projects${queryString({ q, pageSize: 100 })}`) });
  const projectManagers = useQuery({ queryKey: ['project-manager-options'], queryFn: () => api.get<User[]>('/project-managers/options') });
  const create = useMutation({
    mutationFn: (body: Record<string, string>) => api.post<Project>('/projects', body),
    onSuccess: (project) => { void queryClient.invalidateQueries({ queryKey: ['projects'] }); setModal(false); navigate(`/projects/${project.id}`); },
  });

  const columns: TableColumn<Project>[] = [
    { key: 'code', label: '项目编码', render: (row) => <span className="mono key-cell">{row.projectCode}</span> },
    { key: 'name', label: '项目名称', render: (row) => <span className="primary-cell"><strong>{row.name}</strong><small>{row.platform}</small></span> },
    { key: 'pm', label: 'PM', render: (row) => row.pm?.displayName ?? row.pmName },
    { key: 'period', label: '项目周期', render: (row) => <span className="small-text">{formatProjectPeriod(row.periodMonths)}</span> },
    { key: 'receivable', label: '应收 / 已收', className: 'number', render: (row) => <span className="money-pair"><strong>{formatMoney(row.financialSummary.receivedAmount)}</strong><small>/ {formatMoney(row.financialSummary.receivableAmount)}</small></span> },
    { key: 'invoice', label: '已开票', className: 'number', render: (row) => formatMoney(row.financialSummary.invoicedAmount) },
    { key: 'payable', label: '应付 / 已付', className: 'number', render: (row) => <span className="money-pair"><strong>{formatMoney(row.financialSummary.paidExecutionAmount)}</strong><small>/ {formatMoney(row.financialSummary.payableExecutionAmount)}</small></span> },
    { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
  ];

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); create.mutate(formObject(event.currentTarget)); }

  return <div className="page-enter">
    <PageHeader eyebrow="项目管理 / 项目台账" title="项目台账" description="项目编码是合同、流水和发票的共同索引。" action={<button className="button primary" onClick={() => setModal(true)}><Plus size={17} />新建项目</button>} />
    <div className="toolbar"><SearchBar value={q} onChange={(value) => setParams(value ? { q: value } : {})} placeholder="搜索项目编码、名称或平台" /><span className="result-count">{projects.data?.total ?? 0} 个项目</span></div>
    <section className="panel table-panel">{projects.isLoading ? <LoadingState /> : projects.error ? <ErrorState error={projects.error} /> : <DataTable columns={columns} rows={projects.data?.items ?? []} rowKey={(row) => row.id} onRowClick={(row) => navigate(`/projects/${row.id}`)} />}</section>
    <Modal open={modal} onClose={() => setModal(false)} title="新建项目" description="保存后系统会自动生成不可重复的项目编码。" size="large">
      <form onSubmit={submit} className="form-grid">
        <Field label="项目名称" span={2}><Input name="name" required /></Field>
        <Field label="平台"><Input name="platform" required /></Field>
        <Field label="项目性质"><Input name="nature" required /></Field>
        <Field label="发布日期"><Input name="publishedOn" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
        <Field label="项目经理"><Select name="pmUserId" required disabled={projectManagers.isLoading || projectManagers.isError}><option value="">请选择 PM</option>{projectManagers.data?.map((pm) => <option key={pm.id} value={pm.id}>{pm.displayName}{pm.department ? ` · ${pm.department}` : ''}</option>)}</Select></Field>
        <Field label="项目周期" span={2}><div className="duration-control"><Input name="periodValue" type="number" min="1" max="1200" step="1" required aria-label="项目周期数值" /><Select name="periodUnit" defaultValue="MONTH" aria-label="项目周期单位"><option value="MONTH">月</option><option value="YEAR">年</option></Select></div></Field>
        <Field label="立项金额"><MoneyInput name="approvedAmount" min="0" required /></Field>
        <Field label="执行成本"><MoneyInput name="executionCost" min="0" required /></Field>
        <Field label="备注" span={2}><Textarea name="remark" /></Field>
        {projectManagers.error && <p className="form-error span-2">PM 列表加载失败：{projectManagers.error.message}</p>}
        {create.error && <p className="form-error span-2">{create.error.message}</p>}
        <div className="span-2"><FormActions pending={create.isPending} onCancel={() => setModal(false)} submitLabel="保存项目" /></div>
      </form>
    </Modal>
  </div>;
}
