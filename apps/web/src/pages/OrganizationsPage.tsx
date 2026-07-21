import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { Field, FormActions, Input, Select } from '../components/FormControls';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { SearchBar } from '../components/SearchBar';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { api, queryString } from '../lib/api';
import { formObject } from '../lib/form';
import { formatMoney } from '../lib/format';
import type { ListResponse, Organization, User } from '../lib/types';

export function OrganizationsPage({ roleType }: { roleType: 'SUPPORTER' | 'EXECUTOR' }) {
  const isSupporter = roleType === 'SUPPORTER';
  const [q, setQ] = useState(''); const [modal, setModal] = useState(false);
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['organizations', roleType, q], queryFn: () => api.get<ListResponse<Organization>>(`/organizations${queryString({ q, roleType, pageSize: 100 })}`) });
  const users = useQuery({ queryKey: ['project-manager-options'], queryFn: () => api.get<User[]>('/project-managers/options') });
  const create = useMutation({
    mutationFn: (body: Record<string, string>) => api.post('/organizations', { ...body, roleType }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['organizations', roleType] }); setModal(false); },
  });
  const columns: TableColumn<Organization>[] = [
    { key: 'code', label: `${isSupporter ? '支持方' : '执行方'}编号`, render: (row) => <span className="mono key-cell">{row.organizationCode}</span> },
    { key: 'name', label: '机构名称', render: (row) => <span className="primary-cell"><strong>{row.name}</strong><small>{row.creditCode ?? '未填写统一信用代码'}</small></span> },
    { key: 'platform', label: '入库平台', render: (row) => row.platform },
    { key: 'pm', label: '负责 PM', render: (row) => row.owner.displayName },
    { key: 'contact', label: '联系人', render: (row) => <span>{row.contactName ?? '—'}<small className="block-muted">{row.contactPhone}</small></span> },
    { key: 'amount', label: '累计合作金额', className: 'number', render: (row) => <strong>{formatMoney(row.cumulativeAmount)}</strong> },
    { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
  ];
  return <div className="page-enter">
    <PageHeader eyebrow={`基础资料 / ${isSupporter ? '支持方' : '执行方'}`} title={`${isSupporter ? '支持方' : '执行方'}库`} description={isSupporter ? '签署支持协议时自动查重并复用已有机构。' : '记录参与遴选的执行机构，中选后可登记执行协议。'} action={<button className="button primary" onClick={() => setModal(true)}><Plus size={17} />新增{isSupporter ? '支持方' : '执行方'}</button>} />
    <div className="toolbar"><SearchBar value={q} onChange={setQ} placeholder="搜索机构编号、名称或信用代码" /><span className="result-count">{list.data?.total ?? 0} 家机构</span></div>
    <section className="panel table-panel">{list.isLoading ? <LoadingState /> : list.error ? <ErrorState error={list.error} /> : <DataTable columns={columns} rows={list.data?.items ?? []} rowKey={(row) => row.id} />}</section>
    <Modal open={modal} onClose={() => setModal(false)} title={`新增${isSupporter ? '支持方' : '执行方'}`} description="系统会按机构名称和统一社会信用代码检查重复。" size="large">
      <form className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); create.mutate(formObject(event.currentTarget)); }}>
        <Field label="机构名称" span={2}><Input name="name" required /></Field>
        <Field label="统一社会信用代码"><Input name="creditCode" /></Field><Field label="入库平台"><Input name="platform" required /></Field>
        <Field label="负责 PM"><Select name="ownerUserId" required><option value="">请选择</option>{users.data?.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select></Field>
        <Field label="联系人"><Input name="contactName" /></Field><Field label="联系电话"><Input name="contactPhone" /></Field>
        {create.error && <p className="form-error span-2">{create.error.message}</p>}
        <div className="span-2"><FormActions pending={create.isPending} onCancel={() => setModal(false)} /></div>
      </form>
    </Modal>
  </div>;
}
