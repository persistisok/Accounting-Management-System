import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, MousePointerClick, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataTable, type TableColumn } from '../components/DataTable';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { DateInput, Field, FormActions, Input, MoneyInput, SearchableSelect, Select, Textarea } from '../components/FormControls';
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
import { formatMoney, formatProjectPeriod } from '../lib/format';
import type { ListResponse, Project, ProjectManager } from '../lib/types';

export function ProjectsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'SYSTEM_ADMIN' || user?.role === 'ADMIN';
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [cancelling, setCancelling] = useState<Project | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ['projects', q, page], queryFn: () => api.get<ListResponse<Project>>(`/projects${queryString({ q, page, pageSize: DEFAULT_PAGE_SIZE })}`) });
  const projectManagers = useQuery({ queryKey: ['project-manager-options'], queryFn: () => api.get<ProjectManager[]>('/project-managers/options') });
  const save = useMutation({
    mutationFn: async ({ body, files }: { body: Record<string, string>; files: File[] }) => {
      const project = editing ? await api.patch<Project>(`/projects/${editing.id}`, body) : await api.post<Project>('/projects', body);
      const failedUploads = await uploadLedgerAttachments('PROJECT', project.id, files);
      return { project, failedUploads };
    },
    onSuccess: ({ project, failedUploads }) => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      setNotice(failedUploads ? `项目已保存，但有 ${failedUploads} 个附件上传失败，请编辑项目后重试。` : '');
      setModal(false); setAttachmentFiles([]); setEditing(null);
      if (!editing && failedUploads === 0) navigate(`/projects/${project.id}`);
    },
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
    { key: 'attachments', label: '附件列表', render: (row) => <LedgerAttachmentList objectType="PROJECT" objectId={row.id} attachments={row.attachments ?? []} /> },
    { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
    { key: 'action', label: '', className: 'sticky-actions', render: (row) => <span className="row-actions"><button className="table-action detail-action" onClick={(event) => { event.stopPropagation(); navigate(`/projects/${row.id}`); }}><ArrowUpRight size={14} />查看详情</button>{canEdit && <button className="table-action" onClick={(event) => { event.stopPropagation(); setAttachmentFiles([]); setNotice(''); setEditing(row); }}><Pencil size={14} />编辑</button>}{canEdit && row.status !== 'CANCELLED' && <button className="table-action danger" onClick={(event) => { event.stopPropagation(); setCancelling(row); }}><Trash2 size={14} />删除</button>}</span> },
  ];

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); save.mutate({ body: formObject(event.currentTarget), files: attachmentFiles }); }
  const periodUnit = editing && editing.periodMonths % 12 === 0 ? 'YEAR' : 'MONTH';
  const periodValue = editing ? (periodUnit === 'YEAR' ? editing.periodMonths / 12 : editing.periodMonths) : undefined;

  return <div className="page-enter">
    <PageHeader eyebrow="项目管理 / 项目台账" title="项目台账" description="点击项目可查看完整业务详情。" action={canEdit ? <button className="button primary" onClick={() => { setAttachmentFiles([]); setNotice(''); setModal(true); }}><Plus size={17} />新建项目</button> : undefined} />
    <div className="project-detail-hint" role="note"><MousePointerClick size={18} /><div><strong>点击项目行可进入详情</strong><span>查看项目概览、资金轨道、合同、流水和发票。</span></div><span>点击项目行或“查看详情”</span></div>
    {notice && <div className="operation-banner">{notice}</div>}
    <div className="toolbar"><SearchBar value={q} onChange={(value) => setParams(value ? { q: value } : {})} placeholder="搜索项目编码、名称或平台" /><span className="result-count">{projects.data?.total ?? 0} 个项目</span></div>
    <section className="panel table-panel">{projects.isLoading ? <LoadingState /> : projects.error ? <ErrorState error={projects.error} /> : <><DataTable columns={columns} rows={projects.data?.items ?? []} rowKey={(row) => row.id} onRowClick={(row) => navigate(`/projects/${row.id}`)} /><Pagination page={page} total={projects.data?.total ?? 0} onPageChange={(nextPage) => { const next = new URLSearchParams(params); if (nextPage === 1) next.delete('page'); else next.set('page', String(nextPage)); setParams(next); }} /></>}</section>
    <Modal open={modal || Boolean(editing)} onClose={() => { setModal(false); setEditing(null); setAttachmentFiles([]); }} title={editing ? '编辑项目' : '新建项目'} description={editing ? `修改 ${editing.projectCode} 的基础信息。` : '保存后系统会自动生成不可重复的项目编码。'} size="large">
      <form onSubmit={submit} className="form-grid" key={editing?.id ?? 'new'}>
        <Field label="项目名称" span={2}><Input name="name" required defaultValue={editing?.name} /></Field>
        <Field label="平台"><Input name="platform" required defaultValue={editing?.platform} /></Field>
        <Field label="项目性质"><Input name="nature" required defaultValue={editing?.nature} /></Field>
        <Field label="发布日期"><DateInput name="publishedOn" aria-label="发布日期" required defaultValue={editing?.publishedOn.slice(0, 10) ?? ''} /></Field>
        <Field label="项目经理"><SearchableSelect name="pmUserId" ariaLabel="项目经理" required disabled={projectManagers.isLoading || projectManagers.isError} defaultValue={editing?.pmUserId ?? editing?.pm?.id ?? ''} placeholder="请选择 PM" searchPlaceholder="搜索 PM 姓名或部门" options={(projectManagers.data ?? []).map((pm) => ({ value: pm.id, label: `${pm.displayName}${pm.department ? ` · ${pm.department}` : ''}` }))} /></Field>
        <Field label="项目周期" span={2}><div className="duration-control"><Input name="periodValue" type="number" min="1" max="1200" step="1" required aria-label="项目周期数值" defaultValue={periodValue} /><Select name="periodUnit" defaultValue={periodUnit} aria-label="项目周期单位"><option value="MONTH">月</option><option value="YEAR">年</option></Select></div></Field>
        <Field label="立项金额"><MoneyInput name="approvedAmount" min="0" required defaultValue={editing?.approvedAmount} /></Field>
        <Field label="执行成本"><MoneyInput name="executionCost" min="0" required defaultValue={editing?.executionCost} /></Field>
        <Field label="备注" span={2}><Textarea name="remark" defaultValue={editing?.remark} /></Field>
        <Field label="附件列表" span={2} hint="可选；仅支持 PDF，每次添加一份，最多 10 份；单个文件不超过 10MB。"><PdfAttachmentInput files={attachmentFiles} onFilesChange={setAttachmentFiles} existingCount={editing?.attachments?.length ?? 0} />{editing && <LedgerAttachmentList objectType="PROJECT" objectId={editing.id} attachments={editing.attachments ?? []} canDelete onDeleted={(attachmentId) => { setEditing((current) => current ? { ...current, attachments: current.attachments.filter((item) => item.id !== attachmentId) } : current); void queryClient.invalidateQueries({ queryKey: ['projects'] }); }} />}</Field>
        {projectManagers.error && <p className="form-error span-2">PM 列表加载失败：{projectManagers.error.message}</p>}
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={() => { setModal(false); setEditing(null); setAttachmentFiles([]); }} submitLabel={editing ? '保存修改' : '保存项目'} /></div>
      </form>
    </Modal>
    <ConfirmActionModal open={Boolean(cancelling)} onClose={() => setCancelling(null)} title="删除项目" description={`项目“${cancelling?.name ?? ''}”将标记为已取消，历史合同、流水和发票仍会保留。`} confirmLabel="确认删除" pending={cancelProject.isPending} error={cancelProject.error} onConfirm={() => cancelling && cancelProject.mutate(cancelling.id)} />
  </div>;
}
