import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { formatMoney, formatProjectPeriod } from '../lib/format';
import type { ListResponse, Project, User } from '../lib/types';

export function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [cancelling, setCancelling] = useState<Project | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ['projects', q], queryFn: () => api.get<ListResponse<Project>>(`/projects${queryString({ q, pageSize: 100 })}`) });
  const projectManagers = useQuery({ queryKey: ['project-manager-options'], queryFn: () => api.get<User[]>('/project-managers/options') });
  const save = useMutation({
    mutationFn: (body: Record<string, string>) => editing ? api.patch<Project>(`/projects/${editing.id}`, body) : api.post<Project>('/projects', body),
    onSuccess: (project) => { void queryClient.invalidateQueries({ queryKey: ['projects'] }); setModal(false); setEditing(null); if (!editing) navigate(`/projects/${project.id}`); },
  });
  const cancelProject = useMutation({
    mutationFn: (id: string) => api.patch<Project>(`/projects/${id}`, { status: 'CANCELLED' }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['projects'] }); setCancelling(null); },
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
    { key: 'action', label: '', render: (row) => <span className="row-actions"><button className="table-action" onClick={(event) => { event.stopPropagation(); setEditing(row); }}><Pencil size={14} />编辑</button>{row.status !== 'CANCELLED' && <button className="table-action danger" onClick={(event) => { event.stopPropagation(); setCancelling(row); }}><Trash2 size={14} />删除</button>}</span> },
  ];

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); save.mutate(formObject(event.currentTarget)); }
  const periodUnit = editing && editing.periodMonths % 12 === 0 ? 'YEAR' : 'MONTH';
  const periodValue = editing ? (periodUnit === 'YEAR' ? editing.periodMonths / 12 : editing.periodMonths) : undefined;

  return <div className="page-enter">
    <PageHeader eyebrow="项目管理 / 项目台账" title="项目台账" description="项目编码是合同、流水和发票的共同索引。" action={<button className="button primary" onClick={() => setModal(true)}><Plus size={17} />新建项目</button>} />
    <div className="toolbar"><SearchBar value={q} onChange={(value) => setParams(value ? { q: value } : {})} placeholder="搜索项目编码、名称或平台" /><span className="result-count">{projects.data?.total ?? 0} 个项目</span></div>
    <section className="panel table-panel">{projects.isLoading ? <LoadingState /> : projects.error ? <ErrorState error={projects.error} /> : <DataTable columns={columns} rows={projects.data?.items ?? []} rowKey={(row) => row.id} onRowClick={(row) => navigate(`/projects/${row.id}`)} />}</section>
    <Modal open={modal || Boolean(editing)} onClose={() => { setModal(false); setEditing(null); }} title={editing ? '编辑项目' : '新建项目'} description={editing ? `修改 ${editing.projectCode} 的基础信息。` : '保存后系统会自动生成不可重复的项目编码。'} size="large">
      <form onSubmit={submit} className="form-grid" key={editing?.id ?? 'new'}>
        <Field label="项目名称" span={2}><Input name="name" required defaultValue={editing?.name} /></Field>
        <Field label="平台"><Input name="platform" required defaultValue={editing?.platform} /></Field>
        <Field label="项目性质"><Input name="nature" required defaultValue={editing?.nature} /></Field>
        <Field label="发布日期"><Input name="publishedOn" type="date" required defaultValue={editing?.publishedOn.slice(0, 10) ?? new Date().toISOString().slice(0, 10)} /></Field>
        <Field label="项目经理"><Select name="pmUserId" required disabled={projectManagers.isLoading || projectManagers.isError} defaultValue={editing?.pmUserId ?? editing?.pm?.id ?? ''}><option value="">请选择 PM</option>{projectManagers.data?.map((pm) => <option key={pm.id} value={pm.id}>{pm.displayName}{pm.department ? ` · ${pm.department}` : ''}</option>)}</Select></Field>
        <Field label="项目周期" span={2}><div className="duration-control"><Input name="periodValue" type="number" min="1" max="1200" step="1" required aria-label="项目周期数值" defaultValue={periodValue} /><Select name="periodUnit" defaultValue={periodUnit} aria-label="项目周期单位"><option value="MONTH">月</option><option value="YEAR">年</option></Select></div></Field>
        <Field label="立项金额"><MoneyInput name="approvedAmount" min="0" required defaultValue={editing?.approvedAmount} /></Field>
        <Field label="执行成本"><MoneyInput name="executionCost" min="0" required defaultValue={editing?.executionCost} /></Field>
        <Field label="备注" span={2}><Textarea name="remark" defaultValue={editing?.remark} /></Field>
        {projectManagers.error && <p className="form-error span-2">PM 列表加载失败：{projectManagers.error.message}</p>}
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={() => { setModal(false); setEditing(null); }} submitLabel={editing ? '保存修改' : '保存项目'} /></div>
      </form>
    </Modal>
    <ConfirmActionModal open={Boolean(cancelling)} onClose={() => setCancelling(null)} title="删除项目" description={`项目“${cancelling?.name ?? ''}”将标记为已取消，历史合同、流水和发票仍会保留。`} confirmLabel="确认删除" pending={cancelProject.isPending} error={cancelProject.error} onConfirm={() => cancelling && cancelProject.mutate(cancelling.id)} />
  </div>;
}
