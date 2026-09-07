import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, GripVertical, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { type ChangeEvent, type DragEvent, type FormEvent, useEffect, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { DateInput, Field, FormActions, Input, SearchableSelect, Select, Textarea } from '../components/FormControls';
import { Modal } from '../components/Modal';
import { LedgerExportButton } from '../components/LedgerExportButton';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_PAGE_SIZE, Pagination } from '../components/Pagination';
import { SearchBar } from '../components/SearchBar';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { api, queryString } from '../lib/api';
import { useAuth } from '../lib/auth';
import { hasPermission } from '../lib/permissions';
import { formObject } from '../lib/form';
import { formatDate, formatMoney } from '../lib/format';
import type { ExecutorDocument, ExecutorDocumentType, ListResponse, Organization, ProjectManager, ServiceCapability } from '../lib/types';

const documentTypes: Array<{ type: ExecutorDocumentType; label: string }> = [
  { type: 'EXECUTOR_BUSINESS_LICENSE', label: '营业执照' },
  { type: 'EXECUTOR_COMMITMENT', label: '承诺书' },
  { type: 'EXECUTOR_LEGAL_REP_ID', label: '法人身份证复印件' },
];

const emptyDocumentFiles = (): Record<ExecutorDocumentType, File | null> => ({
  EXECUTOR_BUSINESS_LICENSE: null,
  EXECUTOR_COMMITMENT: null,
  EXECUTOR_LEGAL_REP_ID: null,
});

export function OrganizationsPage({ roleType }: { roleType: 'SUPPORTER' | 'EXECUTOR' }) {
  const { user } = useAuth();
  const canEdit = hasPermission(user, roleType === 'SUPPORTER' ? 'SUPPORTERS' : 'EXECUTORS', 'EDIT');
  const canCreate = hasPermission(user, roleType === 'SUPPORTER' ? 'SUPPORTERS' : 'EXECUTORS', 'ENTRY');
  const isSupporter = roleType === 'SUPPORTER';
  const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [deactivating, setDeactivating] = useState<Organization | null>(null);
  const [selectedCapabilityIds, setSelectedCapabilityIds] = useState<string[]>([]);
  const [otherCapabilityNote, setOtherCapabilityNote] = useState('');
  const [documentFiles, setDocumentFiles] = useState(emptyDocumentFiles);
  const [capabilityManager, setCapabilityManager] = useState(false);
  const [editingCapability, setEditingCapability] = useState<ServiceCapability | null>(null);
  const [deletingCapability, setDeletingCapability] = useState<ServiceCapability | null>(null);
  const [capabilityOrder, setCapabilityOrder] = useState<ServiceCapability[]>([]);
  const [draggingCapabilityId, setDraggingCapabilityId] = useState('');
  const [notice, setNotice] = useState('');
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['organizations', roleType, q, page], queryFn: () => api.get<ListResponse<Organization>>(`/organizations${queryString({ q, roleType, page, pageSize: DEFAULT_PAGE_SIZE })}`) });
  const users = useQuery({ queryKey: ['project-manager-options'], queryFn: () => api.get<ProjectManager[]>('/project-managers/options') });
  const capabilities = useQuery({ queryKey: ['service-capabilities'], queryFn: () => api.get<ServiceCapability[]>('/organizations/service-capabilities'), enabled: !isSupporter });
  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const organization = editing
        ? await api.patch<Organization>(`/organizations/${editing.id}?roleType=${roleType}`, body)
        : await api.post<Organization>('/organizations', { ...body, roleType });
      let failedUploads = 0;
      if (!isSupporter) {
        for (const { type } of documentTypes) {
          const file = documentFiles[type];
          if (file) await api.upload(`/organizations/${organization.id}/documents/${type}`, file).catch(() => { failedUploads += 1; });
        }
      }
      return { failedUploads };
    },
    onSuccess: ({ failedUploads }) => {
      void queryClient.invalidateQueries({ queryKey: ['organizations', roleType] });
      setNotice(failedUploads ? `执行方已保存，但有 ${failedUploads} 份材料上传失败，请编辑后重试。` : '');
      closeEditor();
    },
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/organizations/${id}?roleType=${roleType}`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['organizations', roleType] }); setDeactivating(null); },
  });
  const createCapability = useMutation({
    mutationFn: (name: string) => api.post('/organizations/service-capabilities', { name }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['service-capabilities'] }); },
  });
  const updateCapability = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, string> }) => api.patch(`/organizations/service-capabilities/${id}`, body),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['service-capabilities'] }); setEditingCapability(null); },
  });
  const deleteCapability = useMutation({
    mutationFn: (id: string) => api.delete(`/organizations/service-capabilities/${id}`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['service-capabilities'] }); setDeletingCapability(null); },
  });
  const reorderCapabilities = useMutation({
    mutationFn: (ids: string[]) => api.patch<ServiceCapability[]>('/organizations/service-capabilities/order', { ids }),
    onSuccess: (ordered) => { setCapabilityOrder(ordered); void queryClient.invalidateQueries({ queryKey: ['service-capabilities'] }); },
    onError: () => setCapabilityOrder(capabilities.data ?? []),
  });
  const canManageCapabilities = !isSupporter && canEdit && (user?.role === 'SYSTEM_ADMIN' || user?.role === 'ADMIN');
  const otherCapability = capabilities.data?.find((item) => item.isOther);
  const hasOtherCapability = Boolean(otherCapability && selectedCapabilityIds.includes(otherCapability.id));

  useEffect(() => {
    if (capabilityManager && capabilities.data) setCapabilityOrder(capabilities.data);
  }, [capabilityManager, capabilities.data]);

  function openEditor(value?: Organization) {
    setEditing(value ?? null);
    setSelectedCapabilityIds(value?.serviceCapabilities?.map((item) => item.id) ?? []);
    setOtherCapabilityNote(value?.executorOtherCapabilityNote ?? '');
    setDocumentFiles(emptyDocumentFiles());
    setModal(!value);
    save.reset();
  }

  function closeEditor() {
    setModal(false);
    setEditing(null);
    setSelectedCapabilityIds([]);
    setOtherCapabilityNote('');
    setDocumentFiles(emptyDocumentFiles());
  }

  function toggleCapability(id: string) {
    setSelectedCapabilityIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : current.length < 3 ? [...current, id] : current);
  }

  function dropCapability(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    if (!draggingCapabilityId || draggingCapabilityId === targetId || reorderCapabilities.isPending) return;
    const from = capabilityOrder.findIndex((item) => item.id === draggingCapabilityId);
    const to = capabilityOrder.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const ordered = [...capabilityOrder];
    const [moved] = ordered.splice(from, 1);
    if (!moved) return;
    ordered.splice(to, 0, moved);
    setCapabilityOrder(ordered);
    setDraggingCapabilityId('');
    reorderCapabilities.mutate(ordered.map((item) => item.id));
  }
  const columns: TableColumn<Organization>[] = [
    { key: 'code', label: `${isSupporter ? '支持方' : '执行方'}编号`, render: (row) => <span className="mono key-cell">{row.organizationCode}</span> },
    { key: 'name', label: isSupporter ? '机构名称' : '供应商名称', render: (row) => <span className="primary-cell"><strong>{row.name}</strong></span> },
    ...(isSupporter ? [{ key: 'platform', label: '入库平台', render: (row: Organization) => row.platform }] : []),
    { key: 'joinedOn', label: '入库时间', render: (row) => formatDate(row.joinedOn) },
    { key: 'pm', label: isSupporter ? '负责 PM' : '介绍人', render: (row) => row.owner.displayName },
    { key: 'contact', label: '联系人', render: (row) => <span>{row.contactName ?? '—'}<small className="block-muted">{row.contactPhone}</small></span> },
    ...(!isSupporter ? [{ key: 'capabilities', label: '服务能力', render: (row: Organization) => <CapabilitySummary organization={row} /> }] : []),
    ...(!isSupporter ? [{ key: 'documents', label: '附件', render: (row: Organization) => <span className="document-count">{row.documents?.length ?? 0} / 3</span> }] : []),
    { key: 'amount', label: '累计合作金额', className: 'number', render: (row) => <strong>{formatMoney(row.cumulativeAmount)}</strong> },
    { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
  ];
  if (canEdit) columns.push({ key: 'action', label: '操作', render: (row) => <span className="row-actions"><button className="table-action" onClick={() => openEditor(row)}><Pencil size={14} />编辑</button>{row.status === 'ACTIVE' && <button className="table-action danger" onClick={() => setDeactivating(row)}><Trash2 size={14} />停用</button>}</span> });
  return <div className="page-enter">
    <PageHeader eyebrow={`基础资料 / ${isSupporter ? '支持方' : '执行方'}`} title={`${isSupporter ? '支持方' : '执行方'}库`} description={isSupporter ? '签署支持协议时自动查重并复用已有机构。' : '执行方入库并启用后，可直接用于登记执行协议。'} action={(user?.role === 'SYSTEM_ADMIN' || canCreate || canManageCapabilities) ? <div className="button-group">{user?.role === 'SYSTEM_ADMIN' && <LedgerExportButton dataset={isSupporter ? 'supporters' : 'executors'} fileName={isSupporter ? '支持方库' : '执行方库'} filters={{ q }} />}{canManageCapabilities && <button className="button secondary" onClick={() => setCapabilityManager(true)}><Settings2 size={16} />服务能力管理</button>}{canCreate && <button className="button primary" onClick={() => openEditor()}><Plus size={17} />新增{isSupporter ? '支持方' : '执行方'}</button>}</div> : undefined} />
    {notice && <div className="operation-banner">{notice}</div>}
    <div className="toolbar"><SearchBar value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder={isSupporter ? '搜索机构编号或名称' : '搜索执行方编号或供应商名称'} /><span className="result-count">{list.data?.total ?? 0} 家机构</span></div>
    <section className="panel table-panel">{list.isLoading ? <LoadingState /> : list.error ? <ErrorState error={list.error} /> : <><DataTable className={isSupporter ? undefined : 'compact-default'} columns={columns} rows={list.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={list.data?.total ?? 0} onPageChange={setPage} /></>}</section>
    <Modal open={modal || Boolean(editing)} onClose={closeEditor} title={`${editing ? '编辑' : '新增'}${isSupporter ? '支持方' : '执行方'}`} description={isSupporter ? '入库平台和规范化机构名称同时相同时，系统将提示重复。' : '供应商名称重复时系统将提示；服务能力最多选择 3 项。'} size="large">
      <form key={editing?.id ?? 'new'} className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const body: Record<string, unknown> = formObject(event.currentTarget); if (!isSupporter) { body.serviceCapabilityIds = selectedCapabilityIds; body.otherCapabilityNote = hasOtherCapability ? otherCapabilityNote : ''; } save.mutate(body); }}>
        <Field label={isSupporter ? '机构名称' : '供应商名称'} span={2}><Input name="name" required defaultValue={editing?.name ?? ''} /></Field>
        {isSupporter && <Field label="入库平台"><Input name="platform" required defaultValue={editing?.platform ?? ''} /></Field>}
        <Field label={isSupporter ? '负责 PM' : '介绍人'}><SearchableSelect name="ownerUserId" ariaLabel={isSupporter ? '负责 PM' : '介绍人'} required defaultValue={editing?.ownerUserId ?? editing?.owner.id ?? ''} disabled={users.isLoading || users.isError} placeholder={`请选择${isSupporter ? ' PM' : '介绍人'}`} searchPlaceholder="搜索 PM 姓名" options={(users.data ?? []).map((user) => ({ value: user.id, label: user.displayName, searchText: user.department }))} /></Field>
        <Field label="联系人"><Input name="contactName" defaultValue={editing?.contactName ?? ''} /></Field>
        <Field label="联系电话"><Input name="contactPhone" defaultValue={editing?.contactPhone ?? ''} /></Field>
        <Field label="入库时间" span={isSupporter && !editing ? 2 : 1}><DateInput name="joinedOn" aria-label="入库时间" required defaultValue={editing?.joinedOn?.slice(0, 10) ?? ''} /></Field>
        {!isSupporter && <fieldset className="capability-picker span-2"><legend>服务能力 <small>多选，最多 3 项</small></legend><div className="capability-count">已选 {selectedCapabilityIds.length} / 3</div><div>{(capabilities.data ?? []).filter((item) => item.status === 'ACTIVE' || selectedCapabilityIds.includes(item.id)).map((capability) => <label key={capability.id} className={capability.status !== 'ACTIVE' ? 'inactive' : ''}><input type="checkbox" checked={selectedCapabilityIds.includes(capability.id)} disabled={!selectedCapabilityIds.includes(capability.id) && selectedCapabilityIds.length >= 3} onChange={() => toggleCapability(capability.id)} /><span>{capability.name}{capability.status !== 'ACTIVE' ? '（已停用）' : ''}</span></label>)}</div></fieldset>}
        {!isSupporter && hasOtherCapability && <Field label="其他服务能力备注" span={2}><Textarea required maxLength={200} value={otherCapabilityNote} onChange={(event) => setOtherCapabilityNote(event.target.value)} /></Field>}
        {!isSupporter && <Field label="附件上传" span={2} hint="每类材料最多 1 份；支持 PDF、JPG、PNG，单个文件不超过 10MB。"><ExecutorDocumentFields organizationId={editing?.id} documents={editing?.documents ?? []} files={documentFiles} onFilesChange={setDocumentFiles} canDelete={canEdit} onDocumentDeleted={(id) => setEditing((current) => current ? { ...current, documents: current.documents?.filter((item) => item.id !== id) } : current)} /></Field>}
        {editing && <Field label="资料状态"><Select name="status" defaultValue={editing.status}><option value="ACTIVE">启用</option><option value="INACTIVE">停用</option></Select></Field>}
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={closeEditor} submitLabel="保存" /></div>
      </form>
    </Modal>
    <Modal open={capabilityManager} onClose={() => { setCapabilityManager(false); setEditingCapability(null); }} title="服务能力管理" description="拖动卡片调整显示顺序，松开后自动保存；已被使用的能力删除后转为停用。" size="large">
      <div className="capability-manager">
        <form className="capability-manager-add" onSubmit={(event) => { event.preventDefault(); const name = formObject(event.currentTarget).name; if (name) { createCapability.mutate(name); event.currentTarget.reset(); } }}><Input name="name" maxLength={100} required aria-label="服务能力名称" /><button className="button primary" disabled={createCapability.isPending}><Plus size={15} />新增</button></form>
        <div className="capability-manager-status"><span>{capabilityOrder.length} 项服务能力</span><small>{reorderCapabilities.isPending ? '正在保存顺序…' : '拖动左侧手柄排序'}</small></div>
        <div className="capability-admin-grid">{capabilityOrder.map((capability) => <article
          key={capability.id}
          className={`${capability.status === 'INACTIVE' ? 'inactive' : ''} ${draggingCapabilityId === capability.id ? 'dragging' : ''}`}
          draggable={!editingCapability && !reorderCapabilities.isPending}
          onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', capability.id); setDraggingCapabilityId(capability.id); }}
          onDragEnd={() => setDraggingCapabilityId('')}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
          onDrop={(event) => dropCapability(event, capability.id)}
        >{editingCapability?.id === capability.id ? <form className="capability-card-editor" onSubmit={(event) => { event.preventDefault(); updateCapability.mutate({ id: capability.id, body: { name: formObject(event.currentTarget).name ?? '' } }); }}><Input name="name" required maxLength={100} defaultValue={capability.name} autoFocus /><div><button className="button primary" disabled={updateCapability.isPending}>保存</button><button type="button" className="button ghost" onClick={() => setEditingCapability(null)}>取消</button></div></form> : <><GripVertical className="capability-drag-handle" size={17} aria-hidden="true" /><span className="capability-card-name"><strong>{capability.name}</strong><small>{capability.status === 'ACTIVE' ? '可选' : '已停用'}</small></span><span className="capability-card-actions"><button className="icon-action" aria-label={`编辑${capability.name}`} title="编辑" onClick={() => setEditingCapability(capability)}><Pencil size={14} /></button>{capability.status === 'INACTIVE' ? <button className="text-action" onClick={() => updateCapability.mutate({ id: capability.id, body: { status: 'ACTIVE' } })}>启用</button> : <button className="icon-action danger" aria-label={`删除${capability.name}`} title="删除" onClick={() => { deleteCapability.reset(); setDeletingCapability(capability); }}><Trash2 size={14} /></button>}</span></>}</article>)}</div>
        {(createCapability.error || updateCapability.error || reorderCapabilities.error) && <p className="form-error">{(createCapability.error || updateCapability.error || reorderCapabilities.error)?.message}</p>}
      </div>
    </Modal>
    <ConfirmActionModal open={Boolean(deactivating)} onClose={() => setDeactivating(null)} onConfirm={() => deactivating && deactivate.mutate(deactivating.id)} pending={deactivate.isPending} title={`停用${isSupporter ? '支持方' : '执行方'}`} description={deactivating ? `确认停用“${deactivating.name}”？历史业务记录将保留。` : ''} confirmLabel="确认停用" error={deactivate.error} />
    <ConfirmActionModal open={Boolean(deletingCapability)} onClose={() => setDeletingCapability(null)} onConfirm={() => deletingCapability && deleteCapability.mutate(deletingCapability.id)} pending={deleteCapability.isPending} title="删除服务能力" description={deletingCapability ? `确认删除“${deletingCapability.name}”？未被执行方使用时将永久删除；已被使用时将转为停用并保留历史记录。` : ''} confirmLabel="确认删除" error={deleteCapability.error} />
  </div>;
}

function CapabilitySummary({ organization }: { organization: Organization }) {
  const values = organization.serviceCapabilities?.map((item) => item.isOther && organization.executorOtherCapabilityNote ? `其他：${organization.executorOtherCapabilityNote}` : item.name) ?? [];
  return values.length ? <span className="capability-summary">{values.map((value) => <small key={value}>{value}</small>)}</span> : '—';
}

function ExecutorDocumentFields({ organizationId, documents, files, onFilesChange, canDelete, onDocumentDeleted }: {
  organizationId?: string;
  documents: ExecutorDocument[];
  files: Record<ExecutorDocumentType, File | null>;
  onFilesChange: (files: Record<ExecutorDocumentType, File | null>) => void;
  canDelete: boolean;
  onDocumentDeleted: (id: string) => void;
}) {
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  function choose(type: ExecutorDocumentType, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError('');
    if (file) {
      const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (!['.pdf', '.jpg', '.jpeg', '.png'].includes(extension)) setError('材料仅支持 PDF、JPG 或 PNG 文件。');
      else if (file.size <= 0 || file.size > 10 * 1024 * 1024) setError('单个材料不能超过 10MB。');
      else onFilesChange({ ...files, [type]: file });
    }
    event.target.value = '';
  }

  async function download(document: ExecutorDocument) {
    if (!organizationId) return;
    setBusyId(document.id); setError('');
    try {
      const blob = await api.download(`/organizations/${organizationId}/documents/${document.id}`);
      const url = URL.createObjectURL(blob); const link = window.document.createElement('a');
      link.href = url; link.download = document.fileName; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '材料下载失败'); } finally { setBusyId(''); }
  }

  async function remove(document: ExecutorDocument) {
    if (!organizationId || !window.confirm(`确认删除“${document.fileName}”？`)) return;
    setBusyId(document.id); setError('');
    try { await api.delete(`/organizations/${organizationId}/documents/${document.id}`); onDocumentDeleted(document.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '材料删除失败'); } finally { setBusyId(''); }
  }

  return <div className="executor-document-grid">{documentTypes.map(({ type, label }) => {
    const existing = documents.find((item) => item.documentType === type);
    const pending = files[type];
    return <section key={type}><strong>{label}</strong>{existing ? <span><button type="button" disabled={busyId === existing.id} onClick={() => void download(existing)}><FileText size={14} /><em>{existing.fileName}</em><Download size={13} /></button>{canDelete && <button type="button" className="document-remove" onClick={() => void remove(existing)}><Trash2 size={13} /></button>}</span> : <><input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => choose(type, event)} /><small>{pending?.name ?? '未选择文件'}</small>{pending && <button type="button" className="document-remove pending" onClick={() => onFilesChange({ ...files, [type]: null })}>移除</button>}</>}</section>;
  })}{error && <p className="form-error">{error}</p>}</div>;
}
