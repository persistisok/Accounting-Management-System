import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, Eye, FileText, Pencil, Plus, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { DataTable, type TableColumn } from '../components/DataTable';
import { DateInput, Field, FormActions, Input, SearchableSelect } from '../components/FormControls';
import { PdfAttachmentInput } from '../components/LedgerAttachments';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_PAGE_SIZE, Pagination } from '../components/Pagination';
import { SearchBar } from '../components/SearchBar';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { api, queryString } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formObject } from '../lib/form';
import { formatDate } from '../lib/format';
import type { Expert, ExpertCredential, ExpertSensitiveDetails, ListResponse, ProjectManager } from '../lib/types';

type ReviewTarget = { expert: Expert; status: 'APPROVED' | 'REJECTED' };
type CredentialTarget = { expert: Expert; credential: ExpertCredential };
type ExpertBusinessState = 'PENDING' | 'APPROVED' | 'INACTIVE';

function expertBusinessState(expert: Expert): ExpertBusinessState {
  if (expert.status === 'INACTIVE') return 'INACTIVE';
  return expert.reviewStatus === 'APPROVED' ? 'APPROVED' : 'PENDING';
}

export function ExpertsPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Expert | null>(null);
  const [deactivating, setDeactivating] = useState<Expert | null>(null);
  const [reviewing, setReviewing] = useState<ReviewTarget | null>(null);
  const [deletingCredential, setDeletingCredential] = useState<CredentialTarget | null>(null);
  const [sensitiveTarget, setSensitiveTarget] = useState<Expert | null>(null);
  const [credentialFiles, setCredentialFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState('');
  const [downloadingId, setDownloadingId] = useState('');
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const experts = useQuery({ queryKey: ['experts', q, page], queryFn: () => api.get<ListResponse<Expert>>(`/experts${queryString({ q, page, pageSize: DEFAULT_PAGE_SIZE })}`) });
  const projectManagers = useQuery({ queryKey: ['project-manager-options'], queryFn: () => api.get<ProjectManager[]>('/project-managers/options') });
  const canManage = user?.role === 'SYSTEM_ADMIN' || user?.role === 'ADMIN';
  const canDeactivate = canManage;
  const canReview = canManage;
  const canDownloadCredential = canManage || canReview;
  const canViewSensitive = canManage || canReview;

  const save = useMutation({
    mutationFn: async ({ body, files }: { body: Record<string, string>; files: File[] }) => {
      const expert = editing
        ? await api.patch<Expert>(`/experts/${editing.id}`, body)
        : await api.post<Expert>('/experts', body);
      let failedUploads = 0;
      for (const file of files) {
        try {
          await api.upload(`/experts/${expert.id}/credentials`, file);
        } catch {
          failedUploads += 1;
        }
      }
      return { expert, failedUploads };
    },
    onSuccess: ({ failedUploads }) => {
      void queryClient.invalidateQueries({ queryKey: ['experts'] });
      closeEditor();
      setNotice(failedUploads ? `专家资料已保存，但有 ${failedUploads} 个资质附件上传失败，请编辑该专家后重试。` : '');
    },
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/experts/${id}`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['experts'] }); setDeactivating(null); },
  });
  const review = useMutation({
    mutationFn: (target: ReviewTarget) => api.post(`/experts/${target.expert.id}/review`, { reviewStatus: target.status }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['experts'] }); setReviewing(null); },
  });
  const removeCredential = useMutation({
    mutationFn: (target: CredentialTarget) => api.delete(`/experts/${target.expert.id}/credentials/${target.credential.id}`),
    onSuccess: (_, target) => {
      void queryClient.invalidateQueries({ queryKey: ['experts'] });
      setEditing((current) => current?.id === target.expert.id ? { ...current, credentials: current.credentials.filter((item) => item.id !== target.credential.id) } : current);
      setDeletingCredential(null);
    },
  });
  const sensitiveDetails = useMutation({
    mutationFn: (id: string) => api.get<ExpertSensitiveDetails>(`/experts/${id}/sensitive`),
  });

  async function downloadCredential(expert: Expert, credential: ExpertCredential) {
    setDownloadingId(credential.id);
    setNotice('');
    try {
      const blob = await api.download(`/experts/${expert.id}/credentials/${credential.id}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = credential.fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '资质附件下载失败');
    } finally {
      setDownloadingId('');
    }
  }

  function openEditor(expert?: Expert) {
    setEditing(expert ?? null);
    setCredentialFiles([]);
    setNotice('');
    if (!expert) setModal(true);
  }

  function closeEditor() {
    setModal(false);
    setEditing(null);
    setCredentialFiles([]);
  }

  function openSensitiveDetails(expert: Expert) {
    sensitiveDetails.reset();
    setSensitiveTarget(expert);
    sensitiveDetails.mutate(expert.id);
  }

  function closeSensitiveDetails() {
    setSensitiveTarget(null);
    sensitiveDetails.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = formObject(event.currentTarget);
    ['phone', 'idNumber', 'email', 'bankAccount', 'joinedOn'].forEach((key) => { if (!body[key]) delete body[key]; });
    save.mutate({ body, files: credentialFiles });
  }

  const columns: TableColumn<Expert>[] = [
    { key: 'name', label: '姓名', render: (row) => <strong className="key-cell">{row.person.name}</strong> },
    { key: 'organization', label: '单位', render: (row) => row.person.organizationName ?? '—' },
    { key: 'title', label: '职称', render: (row) => row.professionalTitle ?? '—' },
    { key: 'phone', label: '手机', render: (row) => <span className="mono">{row.person.phoneMasked ?? '—'}</span> },
    { key: 'id', label: '身份证号码', render: (row) => <span className="mono sensitive-value">{row.person.idNumberMasked ?? '—'}</span> },
    { key: 'bankName', label: '开户行', render: (row) => row.bankName ?? '—' },
    { key: 'bankAccount', label: '银行账号', render: (row) => <span className="mono sensitive-value">{row.bankAccountMasked ?? '—'}</span> },
    { key: 'credentials', label: '职称证明 / 工作证 / 医师执业证', render: (row) => row.credentials.length ? <span className="credential-cell">{row.credentials.map((credential) => canDownloadCredential && expertBusinessState(row) !== 'INACTIVE' ? <button key={credential.id} type="button" disabled={downloadingId === credential.id} onClick={() => void downloadCredential(row, credential)}><FileText size={13} />{credential.fileName}<Download size={12} /></button> : <small key={credential.id}><FileText size={13} />{credential.fileName}</small>)}</span> : <span className="muted">未上传</span> },
    { key: 'joined', label: '入库时间', render: (row) => formatDate(row.joinedOn) },
    { key: 'email', label: '邮箱', render: (row) => row.person.email ?? '—' },
    { key: 'department', label: '专业 / 科室', render: (row) => row.person.department ?? '—' },
    { key: 'position', label: '职务', render: (row) => row.person.position ?? '—' },
    { key: 'owner', label: '填表人-PM', render: (row) => row.formOwner.displayName },
    { key: 'reviewer', label: '复核人', render: (row) => row.reviewer?.displayName ?? '待复核' },
    { key: 'status', label: '状态', render: (row) => <StatusChip value={expertBusinessState(row)} /> },
  ];
  if (canManage) columns.push({ key: 'action', label: '操作', className: 'sticky-actions', render: (row) => {
      const state = expertBusinessState(row);
      if (state === 'INACTIVE') return <span className="muted">不可操作</span>;
      return <span className="row-actions">
        {canManage && <button className="table-action" onClick={() => openEditor(row)}><Pencil size={14} />编辑</button>}
        {canViewSensitive && <button className="table-action" onClick={() => openSensitiveDetails(row)}><Eye size={14} />敏感信息</button>}
        {state === 'PENDING' && canReview && <button className="table-action" onClick={() => setReviewing({ expert: row, status: 'APPROVED' })}><CheckCircle2 size={14} />通过</button>}
        {state === 'PENDING' && canReview && <button className="table-action danger" onClick={() => setReviewing({ expert: row, status: 'REJECTED' })}><XCircle size={14} />驳回</button>}
        {state === 'APPROVED' && canDeactivate && <button className="table-action danger" onClick={() => setDeactivating(row)}><Trash2 size={14} />停用</button>}
      </span>;
    } });

  return <div className="page-enter">
    <PageHeader eyebrow="基础资料 / 专家" title="专家库" description="专家身份、职业资质、收款资料和复核责任统一归档。" action={canManage ? <button className="button primary" onClick={() => openEditor()}><Plus size={17} />新增专家</button> : undefined} />
    <div className="privacy-banner"><ShieldCheck size={18} /><span><strong>敏感信息保护已启用</strong> 列表仅显示脱敏值。</span></div>
    {notice && <div className="operation-banner">{notice}</div>}
    <div className="toolbar"><SearchBar value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="搜索专家姓名、单位或科室" /><span className="result-count">{experts.data?.total ?? 0} 位专家</span></div>
    <section className="panel table-panel">{experts.isLoading ? <LoadingState /> : experts.error ? <ErrorState error={experts.error} /> : <><DataTable columns={columns} rows={experts.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={experts.data?.total ?? 0} onPageChange={setPage} /></>}</section>

    <Modal open={modal || Boolean(editing)} onClose={closeEditor} title={editing ? '编辑专家' : '新增专家'} description={editing ? '手机、证件号和银行账号留空时保留原值。' : '保存后进入待复核状态，资质附件最多可上传 10 份。'} size="large">
      <form key={editing?.id ?? 'new'} className="form-grid" onSubmit={submit}>
        <Field label="姓名"><Input name="name" required defaultValue={editing?.person.name ?? ''} /></Field>
        <Field label="单位"><Input name="organizationName" defaultValue={editing?.person.organizationName ?? ''} /></Field>
        <Field label="职称"><Input name="professionalTitle" defaultValue={editing?.professionalTitle ?? ''} /></Field>
        <Field label="手机"><Input name="phone" /></Field>
        <Field label="身份证号码"><Input name="idNumber" /></Field>
        <Field label="开户行"><Input name="bankName" defaultValue={editing?.bankName ?? ''} /></Field>
        <Field label="银行账号"><Input name="bankAccount" /></Field>
        <Field label="入库时间"><DateInput name="joinedOn" aria-label="入库时间" defaultValue={editing?.joinedOn?.slice(0, 10) ?? ''} /></Field>
        <Field label="职称证明 / 工作证 / 医师执业证" span={2} hint="仅支持 PDF，每次添加一份，最多 10 份；单个文件不超过 10MB。"><PdfAttachmentInput files={credentialFiles} onFilesChange={setCredentialFiles} existingCount={editing?.credentials.length ?? 0} /></Field>
        {editing?.credentials.length ? <div className="credential-editor span-2">{editing.credentials.map((credential) => <span key={credential.id}><button type="button" onClick={() => void downloadCredential(editing, credential)}><FileText size={14} />{credential.fileName}</button>{canManage && <button type="button" className="remove-file" onClick={() => setDeletingCredential({ expert: editing, credential })}><Trash2 size={13} />删除</button>}</span>)}</div> : null}
        <Field label="邮箱"><Input name="email" type="email" defaultValue={editing?.person.email ?? ''} /></Field>
        <Field label="专业 / 科室"><Input name="department" defaultValue={editing?.person.department ?? ''} /></Field>
        <Field label="职务"><Input name="position" defaultValue={editing?.person.position ?? ''} /></Field>
        <Field label="填表人-PM"><SearchableSelect name="formOwnerId" ariaLabel="填表人-PM" required defaultValue={editing?.formOwnerId ?? editing?.formOwner.id ?? user?.projectManagerId ?? ''} disabled={projectManagers.isLoading || projectManagers.isError} placeholder="请选择 PM" searchPlaceholder="搜索 PM 姓名或部门" options={(projectManagers.data ?? []).map((pm) => ({ value: pm.id, label: `${pm.displayName}${pm.department ? ` · ${pm.department}` : ''}` }))} /></Field>
        {editing && <Field label="复核人"><Input value={editing.reviewer?.displayName ?? '待复核'} disabled /></Field>}
        {projectManagers.error && <p className="form-error span-2">PM 列表加载失败：{projectManagers.error.message}</p>}
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={closeEditor} submitLabel="保存" /></div>
      </form>
    </Modal>

    <Modal open={Boolean(sensitiveTarget)} onClose={closeSensitiveDetails} title="查看敏感信息" description={sensitiveTarget ? `${sensitiveTarget.person.name} · 本次查看已记录审计日志` : undefined}>
      <div className="sensitive-details" aria-live="polite">
        {sensitiveDetails.isPending && <p className="sensitive-loading">正在安全解密…</p>}
        {sensitiveDetails.error && <p className="form-error">{sensitiveDetails.error.message}</p>}
        {sensitiveDetails.data && <>
          {sensitiveDetails.data.unavailableFields.length > 0 && <p className="sensitive-legacy">部分历史敏感数据无法解密，请通过“编辑”重新录入对应字段。</p>}
          <span><small>手机</small><strong className="mono">{sensitiveDetails.data.unavailableFields.includes('phone') ? '历史数据需重新录入' : sensitiveDetails.data.phone ?? '未登记'}</strong></span>
          <span><small>身份证号码</small><strong className="mono">{sensitiveDetails.data.unavailableFields.includes('idNumber') ? '历史数据需重新录入' : sensitiveDetails.data.idNumber ?? '未登记'}</strong></span>
          <span><small>银行账号</small><strong className="mono">{sensitiveDetails.data.unavailableFields.includes('bankAccount') ? '历史数据需重新录入' : sensitiveDetails.data.bankAccount ?? '未登记'}</strong></span>
        </>}
        <div className="form-actions"><button type="button" className="button ghost" onClick={closeSensitiveDetails}>关闭</button></div>
      </div>
    </Modal>

    <ConfirmActionModal open={Boolean(reviewing)} onClose={() => setReviewing(null)} onConfirm={() => reviewing && review.mutate(reviewing)} pending={review.isPending} title={reviewing?.status === 'APPROVED' ? '通过专家复核' : '驳回并停用专家'} description={reviewing ? `确认将“${reviewing.expert.person.name}”设为${reviewing.status === 'APPROVED' ? '已通过' : '已停用'}？当前账号将记录为复核人。` : ''} confirmLabel={reviewing?.status === 'APPROVED' ? '确认通过' : '确认驳回并停用'} tone={reviewing?.status === 'APPROVED' ? 'primary' : 'danger'} error={review.error} />
    <ConfirmActionModal open={Boolean(deactivating)} onClose={() => setDeactivating(null)} onConfirm={() => deactivating && deactivate.mutate(deactivating.id)} pending={deactivate.isPending} title="停用专家" description={deactivating ? `确认停用“${deactivating.person.name}”？历史费用记录将保留。` : ''} confirmLabel="确认停用" error={deactivate.error} />
    <ConfirmActionModal open={Boolean(deletingCredential)} onClose={() => setDeletingCredential(null)} onConfirm={() => deletingCredential && removeCredential.mutate(deletingCredential)} pending={removeCredential.isPending} title="删除资质附件" description={deletingCredential ? `确认删除“${deletingCredential.credential.fileName}”？` : ''} confirmLabel="确认删除" error={removeCredential.error} />
  </div>;
}
