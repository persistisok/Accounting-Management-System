import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { DateInput, Field, FormActions, Input, SearchableSelect, Select } from '../components/FormControls';
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
import type { ListResponse, Organization, ProjectManager } from '../lib/types';

export function OrganizationsPage({ roleType }: { roleType: 'SUPPORTER' | 'EXECUTOR' }) {
  const { user } = useAuth();
  const canEdit = hasPermission(user, roleType === 'SUPPORTER' ? 'SUPPORTERS' : 'EXECUTORS', 'EDIT');
  const isSupporter = roleType === 'SUPPORTER';
  const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [deactivating, setDeactivating] = useState<Organization | null>(null);
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['organizations', roleType, q, page], queryFn: () => api.get<ListResponse<Organization>>(`/organizations${queryString({ q, roleType, page, pageSize: DEFAULT_PAGE_SIZE })}`) });
  const users = useQuery({ queryKey: ['project-manager-options'], queryFn: () => api.get<ProjectManager[]>('/project-managers/options') });
  const save = useMutation({
    mutationFn: (body: Record<string, string>) => editing ? api.patch(`/organizations/${editing.id}?roleType=${roleType}`, body) : api.post('/organizations', { ...body, roleType }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['organizations', roleType] }); setModal(false); setEditing(null); },
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/organizations/${id}?roleType=${roleType}`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['organizations', roleType] }); setDeactivating(null); },
  });
  const columns: TableColumn<Organization>[] = [
    { key: 'code', label: `${isSupporter ? '支持方' : '执行方'}编号`, render: (row) => <span className="mono key-cell">{row.organizationCode}</span> },
    { key: 'name', label: '机构名称', render: (row) => <span className="primary-cell"><strong>{row.name}</strong></span> },
    { key: 'platform', label: '入库平台', render: (row) => row.platform },
    { key: 'joinedOn', label: '入库时间', render: (row) => formatDate(row.joinedOn) },
    { key: 'pm', label: '负责 PM', render: (row) => row.owner.displayName },
    { key: 'contact', label: '联系人', render: (row) => <span>{row.contactName ?? '—'}<small className="block-muted">{row.contactPhone}</small></span> },
    { key: 'amount', label: '累计合作金额', className: 'number', render: (row) => <strong>{formatMoney(row.cumulativeAmount)}</strong> },
    { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
  ];
  if (canEdit) columns.push({ key: 'action', label: '', render: (row) => <span className="row-actions"><button className="table-action" onClick={() => setEditing(row)}><Pencil size={14} />编辑</button>{row.status === 'ACTIVE' && <button className="table-action danger" onClick={() => setDeactivating(row)}><Trash2 size={14} />停用</button>}</span> });
  return <div className="page-enter">
    <PageHeader eyebrow={`基础资料 / ${isSupporter ? '支持方' : '执行方'}`} title={`${isSupporter ? '支持方' : '执行方'}库`} description={isSupporter ? '签署支持协议时自动查重并复用已有机构。' : '执行方入库并启用后，可直接用于登记执行协议。'} action={(user?.role === 'SYSTEM_ADMIN' || canEdit) ? <div className="button-group">{user?.role === 'SYSTEM_ADMIN' && <LedgerExportButton dataset={isSupporter ? 'supporters' : 'executors'} fileName={isSupporter ? '支持方库' : '执行方库'} filters={{ q }} />}{canEdit && <button className="button primary" onClick={() => setModal(true)}><Plus size={17} />新增{isSupporter ? '支持方' : '执行方'}</button>}</div> : undefined} />
    <div className="toolbar"><SearchBar value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="搜索机构编号或名称" /><span className="result-count">{list.data?.total ?? 0} 家机构</span></div>
    <section className="panel table-panel">{list.isLoading ? <LoadingState /> : list.error ? <ErrorState error={list.error} /> : <><DataTable columns={columns} rows={list.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={list.data?.total ?? 0} onPageChange={setPage} /></>}</section>
    <Modal open={modal || Boolean(editing)} onClose={() => { setModal(false); setEditing(null); }} title={`${editing ? '编辑' : '新增'}${isSupporter ? '支持方' : '执行方'}`} description="入库平台和规范化机构名称同时相同时，系统将提示重复。" size="large">
      <form key={editing?.id ?? 'new'} className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); save.mutate(formObject(event.currentTarget)); }}>
        <Field label="机构名称" span={2}><Input name="name" required defaultValue={editing?.name ?? ''} /></Field>
        <Field label="入库平台"><Input name="platform" required defaultValue={editing?.platform ?? ''} /></Field>
        <Field label="负责 PM"><SearchableSelect name="ownerUserId" ariaLabel="负责 PM" required defaultValue={editing?.ownerUserId ?? editing?.owner.id ?? ''} disabled={users.isLoading || users.isError} placeholder="请选择 PM" searchPlaceholder="搜索 PM 姓名" options={(users.data ?? []).map((user) => ({ value: user.id, label: user.displayName, searchText: user.department }))} /></Field>
        <Field label="联系人"><Input name="contactName" defaultValue={editing?.contactName ?? ''} /></Field><Field label="联系电话"><Input name="contactPhone" defaultValue={editing?.contactPhone ?? ''} /></Field>
        <Field label="入库时间" span={editing ? 1 : 2}><DateInput name="joinedOn" aria-label="入库时间" required defaultValue={editing?.joinedOn?.slice(0, 10) ?? ''} /></Field>
        {editing && <Field label="资料状态"><Select name="status" defaultValue={editing.status}><option value="ACTIVE">启用</option><option value="INACTIVE">停用</option></Select></Field>}
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={() => { setModal(false); setEditing(null); }} submitLabel="保存" /></div>
      </form>
    </Modal>
    <ConfirmActionModal open={Boolean(deactivating)} onClose={() => setDeactivating(null)} onConfirm={() => deactivating && deactivate.mutate(deactivating.id)} pending={deactivate.isPending} title={`停用${isSupporter ? '支持方' : '执行方'}`} description={deactivating ? `确认停用“${deactivating.name}”？历史业务记录将保留。` : ''} confirmLabel="确认停用" error={deactivate.error} />
  </div>;
}
