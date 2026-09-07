import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCircle2, ClipboardCheck, MousePointerClick, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataTable, type TableColumn } from '../components/DataTable';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { DateInput, Field, FormActions, Input, MoneyInput, SearchableSelect, Select, Textarea } from '../components/FormControls';
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
import { formatMoney, formatProjectPeriod } from '../lib/format';
import type { ListResponse, Project, ProjectManager } from '../lib/types';

export function ProjectsPage() {
  const { user } = useAuth();
  const canEdit = hasPermission(user, 'PROJECTS', 'EDIT');
  const canCreate = hasPermission(user, 'PROJECTS', 'ENTRY') && user?.role !== 'EXTERNAL';
  const canReview = hasPermission(user, 'PROJECTS', 'REVIEW');
  const isPm = user?.role === 'PM';
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [statusRequesting, setStatusRequesting] = useState<Project | null>(null);
  const [archiveRequesting, setArchiveRequesting] = useState<Project | null>(null);
  const [reviewing, setReviewing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
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
  const requestStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.post<Project>(`/projects/${id}/status-request`, { status }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['projects'] }); setStatusRequesting(null); },
  });
  const requestArchive = useMutation({
    mutationFn: (id: string) => api.post<Project>(`/projects/${id}/archive-request`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['projects'] }); setArchiveRequesting(null); },
  });
  const reviewChange = useMutation({
    mutationFn: ({ projectId, kind, decision }: { projectId: string; kind: 'status' | 'archive'; decision: 'APPROVED' | 'REJECTED' }) => api.post<Project>(`/projects/${projectId}/${kind}-review`, { decision }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      setReviewing((current) => {
        if (!current) return null;
        const next = variables.kind === 'status'
          ? { ...current, statusReviewState: variables.decision }
          : { ...current, archiveReviewState: variables.decision };
        return next.statusReviewState === 'PENDING' || next.archiveReviewState === 'PENDING' ? next : null;
      });
    },
  });
  const removeProject = useMutation({
    mutationFn: (id: string) => api.delete<Project>(`/projects/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDeleting(null);
    },
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
    { key: 'status', label: '项目状态', render: (row) => <ProjectStateCell value={row.status} reviewState={row.statusReviewState} requestedValue={row.requestedStatus} reviewer={row.statusReviewer?.displayName} /> },
    { key: 'archive', label: '归档状态', render: (row) => <ProjectStateCell value={row.archiveStatus} reviewState={row.archiveReviewState} requestedValue={row.requestedArchiveStatus} reviewer={row.archiveReviewer?.displayName} /> },
    { key: 'action', label: '操作', className: 'sticky-actions', render: (row) => <span className="row-actions">{canEdit && row.archiveStatus !== 'ARCHIVED' && <button className="table-action" onClick={(event) => { event.stopPropagation(); setAttachmentFiles([]); setNotice(''); setEditing(row); }}><Pencil size={14} />编辑</button>}{isPm && row.status === 'ACTIVE' && row.statusReviewState !== 'PENDING' && <button className="table-action" onClick={(event) => { event.stopPropagation(); requestStatus.reset(); setStatusRequesting(row); }}><ClipboardCheck size={14} />状态申请</button>}{isPm && row.status !== 'ACTIVE' && row.archiveStatus === 'UNARCHIVED' && row.archiveReviewState !== 'PENDING' && <button className="table-action" onClick={(event) => { event.stopPropagation(); requestArchive.reset(); setArchiveRequesting(row); }}><Archive size={14} />申请归档</button>}{canReview && (row.statusReviewState === 'PENDING' || row.archiveReviewState === 'PENDING') && <button className="table-action" onClick={(event) => { event.stopPropagation(); reviewChange.reset(); setReviewing(row); }}><ClipboardCheck size={14} />复核</button>}<button className="table-action danger" disabled={user?.role !== 'SYSTEM_ADMIN'} title={user?.role === 'SYSTEM_ADMIN' ? '删除项目' : '仅系统管理员可删除项目'} onClick={(event) => { event.stopPropagation(); setDeleting(row); }}><Trash2 size={14} />删除</button></span> },
  ];

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); save.mutate({ body: formObject(event.currentTarget), files: attachmentFiles }); }
  const periodUnit = editing && editing.periodMonths % 12 === 0 ? 'YEAR' : 'MONTH';
  const periodValue = editing ? (periodUnit === 'YEAR' ? editing.periodMonths / 12 : editing.periodMonths) : undefined;

  return <div className="page-enter">
    <PageHeader eyebrow="项目管理 / 项目台账" title="项目台账" description="点击项目可查看完整业务详情。" action={(user?.role === 'SYSTEM_ADMIN' || canCreate) ? <div className="button-group">{user?.role === 'SYSTEM_ADMIN' && <LedgerExportButton dataset="projects" fileName="项目台账" filters={{ q }} />}{canCreate && <button className="button primary" onClick={() => { setAttachmentFiles([]); setNotice(''); setModal(true); }}><Plus size={17} />新建项目</button>}</div> : undefined} />
    <div className="project-detail-hint" role="note"><MousePointerClick size={18} /><div><strong>点击项目行可进入详情</strong><span>查看项目概览、资金轨道、合同、流水和发票。</span></div><span>点击项目行</span></div>
    {notice && <div className="operation-banner">{notice}</div>}
    <div className="toolbar"><SearchBar value={q} onChange={(value) => setParams(value ? { q: value } : {})} placeholder="搜索项目编码、名称或平台" /><span className="result-count">{projects.data?.total ?? 0} 个项目</span></div>
    <section className="panel table-panel">{projects.isLoading ? <LoadingState /> : projects.error ? <ErrorState error={projects.error} /> : <><DataTable className="compact-default" columns={columns} rows={projects.data?.items ?? []} rowKey={(row) => row.id} onRowClick={(row) => navigate(`/projects/${row.id}`)} /><Pagination page={page} total={projects.data?.total ?? 0} onPageChange={(nextPage) => { const next = new URLSearchParams(params); if (nextPage === 1) next.delete('page'); else next.set('page', String(nextPage)); setParams(next); }} /></>}</section>
    <Modal open={modal || Boolean(editing)} onClose={() => { setModal(false); setEditing(null); setAttachmentFiles([]); }} title={editing ? '编辑项目' : '新建项目'} description={editing ? `修改 ${editing.projectCode} 的基础信息。` : '填写平台缩写后，系统将结合发布日期、当月序号和随机尾码生成项目编码。'} size="large">
      <form onSubmit={submit} className="form-grid" key={editing?.id ?? 'new'}>
        <Field label="项目名称" span={2}><Input name="name" required defaultValue={editing?.name} /></Field>
        <Field label="平台" span={editing ? 2 : 1}><Input name="platform" required defaultValue={editing?.platform} /></Field>
        {!editing && <Field label="平台缩写" hint="填写 1 至 10 位英文字母，保存后不可修改。"><Input name="platformAbbreviation" required maxLength={10} pattern="[A-Za-z]{1,10}" title="请输入 1 至 10 位英文字母" /></Field>}
        <Field label="项目性质"><Input name="nature" required defaultValue={editing?.nature} /></Field>
        <Field label="项目类型"><Input name="projectType" required defaultValue={editing?.projectType} /></Field>
        <Field label="发布日期"><DateInput name="publishedOn" aria-label="发布日期" required defaultValue={editing?.publishedOn.slice(0, 10) ?? ''} /></Field>
        <Field label="项目经理"><SearchableSelect name="pmUserId" ariaLabel="项目经理" required disabled={projectManagers.isLoading || projectManagers.isError} defaultValue={editing?.pmUserId ?? editing?.pm?.id ?? ''} placeholder="请选择 PM" searchPlaceholder="搜索 PM 姓名或部门" options={(projectManagers.data ?? []).map((pm) => ({ value: pm.id, label: `${pm.displayName}${pm.department ? ` · ${pm.department}` : ''}` }))} /></Field>
        <Field label="项目周期" span={2}><div className="duration-control"><Input name="periodValue" type="number" min="1" max="1200" step="1" required aria-label="项目周期数值" defaultValue={periodValue} /><Select name="periodUnit" defaultValue={periodUnit} aria-label="项目周期单位"><option value="MONTH">月</option><option value="YEAR">年</option></Select></div></Field>
        <Field label="立项金额"><MoneyInput name="approvedAmount" min="0" required defaultValue={editing?.approvedAmount} /></Field>
        <Field label="执行成本"><MoneyInput name="executionCost" min="0" required defaultValue={editing?.executionCost} /></Field>
        <Field label="备注" span={2}><Textarea name="remark" defaultValue={editing?.remark} /></Field>
        <Field label="附件列表" span={2} hint="可选；支持 PDF、ZIP、RAR、7Z，每次添加一份，最多 10 份；单个文件不超过 5GB。"><PdfAttachmentInput projectFiles files={attachmentFiles} onFilesChange={setAttachmentFiles} existingCount={editing?.attachments?.length ?? 0} />{editing && <LedgerAttachmentList objectType="PROJECT" objectId={editing.id} attachments={editing.attachments ?? []} canDelete onDeleted={(attachmentId) => { setEditing((current) => current ? { ...current, attachments: current.attachments.filter((item) => item.id !== attachmentId) } : current); void queryClient.invalidateQueries({ queryKey: ['projects'] }); }} />}</Field>
        {projectManagers.error && <p className="form-error span-2">PM 列表加载失败：{projectManagers.error.message}</p>}
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={() => { setModal(false); setEditing(null); setAttachmentFiles([]); }} submitLabel={editing ? '保存修改' : '保存项目'} /></div>
      </form>
    </Modal>
    <Modal open={Boolean(statusRequesting)} onClose={() => setStatusRequesting(null)} title="申请变更项目状态" description={statusRequesting ? `项目“${statusRequesting.name}”当前为进行中，申请需管理员复核后生效。` : undefined}>
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (statusRequesting) requestStatus.mutate({ id: statusRequesting.id, status: formObject(event.currentTarget).status ?? '' }); }}>
        <Field label="申请状态" span={2}><Select name="status" required defaultValue="CLOSED"><option value="CLOSED">已结项</option><option value="ABORTED">已中止</option></Select></Field>
        {requestStatus.error && <p className="form-error span-2">{requestStatus.error.message}</p>}
        <div className="span-2"><FormActions pending={requestStatus.isPending} onCancel={() => setStatusRequesting(null)} submitLabel="提交复核" /></div>
      </form>
    </Modal>
    <ConfirmActionModal open={Boolean(archiveRequesting)} onClose={() => setArchiveRequesting(null)} title="申请项目归档" description={archiveRequesting ? `确认申请将“${archiveRequesting.name}”设为已归档？管理员复核通过后生效。` : ''} confirmLabel="提交归档申请" pending={requestArchive.isPending} error={requestArchive.error} onConfirm={() => archiveRequesting && requestArchive.mutate(archiveRequesting.id)} />
    <ConfirmActionModal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="删除项目" description={deleting ? `确认永久删除“${deleting.name}”（${deleting.projectCode}）？已作废的合同、发票及流水分配记录将同时永久删除；存在未作废业务数据或项目附件时无法删除。此操作不可恢复。` : ''} confirmLabel="确认永久删除" tone="danger" pending={removeProject.isPending} error={removeProject.error} onConfirm={() => deleting && removeProject.mutate(deleting.id)} />
    <Modal open={Boolean(reviewing)} onClose={() => setReviewing(null)} title="复核项目变更" description={reviewing ? `${reviewing.name} · 复核结果和当前账号将被记录` : undefined}>
      <div className="project-review-list">
        {reviewing?.statusReviewState === 'PENDING' && <ReviewRequestRow label="项目状态" target={reviewing.requestedStatus ?? ''} requester={reviewing.statusRequester?.displayName} pending={reviewChange.isPending} onDecision={(decision) => reviewChange.mutate({ projectId: reviewing.id, kind: 'status', decision })} />}
        {reviewing?.archiveReviewState === 'PENDING' && <ReviewRequestRow label="归档状态" target={reviewing.requestedArchiveStatus ?? ''} requester={reviewing.archiveRequester?.displayName} pending={reviewChange.isPending} onDecision={(decision) => reviewChange.mutate({ projectId: reviewing.id, kind: 'archive', decision })} />}
        {reviewChange.error && <p className="form-error">{reviewChange.error.message}</p>}
        <div className="form-actions"><button type="button" className="button ghost" onClick={() => setReviewing(null)}>关闭</button></div>
      </div>
    </Modal>
  </div>;
}

function ProjectStateCell({ value, reviewState, requestedValue, reviewer }: { value: string; reviewState?: string | null; requestedValue?: string | null; reviewer?: string }) {
  return <span className="project-state-cell"><StatusChip value={value} />{reviewState === 'PENDING' ? <small className="pending">待复核 → {requestedValue ? statusLabel(requestedValue) : ''}</small> : reviewState ? <small>{reviewState === 'APPROVED' ? '已通过' : '已驳回'}{reviewer ? ` · ${reviewer}` : ''}</small> : null}</span>;
}

function ReviewRequestRow({ label, target, requester, pending, onDecision }: { label: string; target: string; requester?: string; pending: boolean; onDecision: (decision: 'APPROVED' | 'REJECTED') => void }) {
  return <section><span><small>{label}</small><strong>{statusLabel(target)}</strong><em>申请人：{requester ?? '—'}</em></span><div><button type="button" className="button ghost" disabled={pending} onClick={() => onDecision('REJECTED')}><XCircle size={15} />驳回</button><button type="button" className="button primary" disabled={pending} onClick={() => onDecision('APPROVED')}><CheckCircle2 size={15} />通过</button></div></section>;
}

function statusLabel(value: string) {
  return value === 'CLOSED' ? '已结项' : value === 'ABORTED' ? '已中止' : value === 'ARCHIVED' ? '已归档' : value;
}
