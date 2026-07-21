import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Plus } from 'lucide-react';
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
import { formatDate, formatMoney } from '../lib/format';
import type { Committee, ListResponse, Membership, User } from '../lib/types';

export function MembersPage() {
  const [q, setQ] = useState(''); const [memberModal, setMemberModal] = useState(false); const [committeeModal, setCommitteeModal] = useState(false); const [dueMember, setDueMember] = useState<Membership | null>(null);
  const queryClient = useQueryClient();
  const members = useQuery({ queryKey: ['memberships', q], queryFn: () => api.get<ListResponse<Membership>>(`/memberships${queryString({ q, pageSize: 100 })}`) });
  const committees = useQuery({ queryKey: ['committees'], queryFn: () => api.get<Committee[]>('/memberships/committees') });
  const users = useQuery({ queryKey: ['project-manager-options'], queryFn: () => api.get<User[]>('/project-managers/options') });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['memberships'] }); void queryClient.invalidateQueries({ queryKey: ['committees'] }); };
  const createMember = useMutation({ mutationFn: (body: Record<string, string>) => api.post('/memberships', body), onSuccess: () => { refresh(); setMemberModal(false); } });
  const createCommittee = useMutation({ mutationFn: (body: Record<string, string>) => api.post('/memberships/committees', body), onSuccess: () => { refresh(); setCommitteeModal(false); } });
  const createDue = useMutation({ mutationFn: (body: Record<string, string>) => api.post('/memberships/dues', { ...body, membershipId: dueMember?.id }), onSuccess: () => { refresh(); setDueMember(null); } });
  const columns: TableColumn<Membership>[] = [
    { key: 'name', label: '会员名称', render: (row) => <span className="primary-cell"><strong>{row.memberName}</strong><small>{row.memberType}</small></span> },
    { key: 'committee', label: '所属专委会', render: (row) => <span>{row.committee.name}<small className="block-muted mono">{row.committee.committeeCode}</small></span> },
    { key: 'pm', label: 'PM', render: (row) => row.pm.displayName },
    { key: 'joined', label: '入会日期', render: (row) => formatDate(row.joinedOn) },
    { key: 'due', label: '最近会费', render: (row) => row.dues[0] ? <span>{row.dues[0].periodLabel ?? row.dues[0].dueCode}<small className="block-muted">应收 {formatMoney(row.dues[0].amountDue)} · 实收 {formatMoney(row.dues[0].amountPaid)}</small></span> : <span className="muted">尚未生成</span> },
    { key: 'status', label: '缴费状态', render: (row) => row.dues[0] ? <StatusChip value={row.dues[0].status} /> : '—' },
    { key: 'action', label: '', render: (row) => <button className="table-action" onClick={() => setDueMember(row)}><Plus size={15} />新增会费</button> },
  ];
  return <div className="page-enter">
    <PageHeader eyebrow="基础资料 / 会员" title="会员库" description="会员按专委会归档，会费通过银行流水确认后自动更新实收状态。" action={<div className="button-group"><button className="button secondary" onClick={() => setCommitteeModal(true)}><Landmark size={16} />成立专委会</button><button className="button primary" onClick={() => setMemberModal(true)}><Plus size={17} />新增会员</button></div>} />
    <div className="committee-strip">{committees.data?.map((item) => <span key={item.id}><small>{item.committeeCode}</small><strong>{item.name}</strong><b>{item._count?.memberships ?? 0} 位会员</b></span>)}</div>
    <div className="toolbar"><SearchBar value={q} onChange={setQ} placeholder="搜索会员或专委会" /><span className="result-count">{members.data?.total ?? 0} 位会员</span></div>
    <section className="panel table-panel">{members.isLoading ? <LoadingState /> : members.error ? <ErrorState error={members.error} /> : <DataTable columns={columns} rows={members.data?.items ?? []} rowKey={(row) => row.id} />}</section>

    <Modal open={memberModal} onClose={() => setMemberModal(false)} title="新增会员">
      <form className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); createMember.mutate(formObject(event.currentTarget)); }}>
        <Field label="会员名称" span={2}><Input name="memberName" required /></Field>
        <Field label="所属专委会" span={2}><Select name="committeeId" required><option value="">请选择</option>{committees.data?.map((item) => <option key={item.id} value={item.id}>{item.committeeCode} · {item.name}</option>)}</Select></Field>
        <Field label="会员类别"><Input name="memberType" required placeholder="单位会员" /></Field><Field label="负责 PM"><Select name="pmUserId" required><option value="">请选择</option>{users.data?.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select></Field>
        <Field label="入会日期"><Input name="joinedOn" type="date" /></Field>
        {createMember.error && <p className="form-error span-2">{createMember.error.message}</p>}<div className="span-2"><FormActions pending={createMember.isPending} onCancel={() => setMemberModal(false)} /></div>
      </form>
    </Modal>
    <Modal open={committeeModal} onClose={() => setCommitteeModal(false)} title="成立专委会">
      <form className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); createCommittee.mutate(formObject(event.currentTarget)); }}>
        <Field label="专委会编码"><Input name="committeeCode" required placeholder="COM-RESP-02" /></Field><Field label="成立日期"><Input name="establishedOn" type="date" required /></Field>
        <Field label="专委会名称" span={2}><Input name="name" required /></Field><Field label="负责 PM" span={2}><Select name="ownerUserId" required><option value="">请选择</option>{users.data?.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select></Field>
        {createCommittee.error && <p className="form-error span-2">{createCommittee.error.message}</p>}<div className="span-2"><FormActions pending={createCommittee.isPending} onCancel={() => setCommitteeModal(false)} submitLabel="保存专委会" /></div>
      </form>
    </Modal>
    <Modal open={Boolean(dueMember)} onClose={() => setDueMember(null)} title="新增会费应收" description={dueMember ? `${dueMember.committee.name} · ${dueMember.memberName}` : undefined}>
      <form className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); createDue.mutate(formObject(event.currentTarget)); }}>
        <Field label="应收编号"><Input name="dueCode" required placeholder="DUE-2026-002" /></Field><Field label="缴费期次"><Input name="periodLabel" placeholder="2026 年度" /></Field>
        <Field label="应收金额"><Input name="amountDue" type="number" min="0.01" step="0.01" required /></Field><Field label="应缴日期"><Input name="dueOn" type="date" /></Field>
        {createDue.error && <p className="form-error span-2">{createDue.error.message}</p>}<div className="span-2"><FormActions pending={createDue.isPending} onCancel={() => setDueMember(null)} submitLabel="保存会费" /></div>
      </form>
    </Modal>
  </div>;
}
