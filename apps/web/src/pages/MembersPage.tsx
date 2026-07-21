import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { Field, FormActions, Input, MoneyInput, Select } from '../components/FormControls';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { SearchBar } from '../components/SearchBar';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { api, queryString } from '../lib/api';
import { formObject } from '../lib/form';
import { formatDate, formatMoney } from '../lib/format';
import type { Committee, ListResponse, MemberDue, Membership, User } from '../lib/types';

export function MembersPage() {
  const [q, setQ] = useState(''); const [memberModal, setMemberModal] = useState(false); const [committeeModal, setCommitteeModal] = useState(false); const [dueMember, setDueMember] = useState<Membership | null>(null);
  const [editingMember, setEditingMember] = useState<Membership | null>(null);
  const [deactivatingMember, setDeactivatingMember] = useState<Membership | null>(null);
  const [editingCommittee, setEditingCommittee] = useState<Committee | null>(null);
  const [deactivatingCommittee, setDeactivatingCommittee] = useState<Committee | null>(null);
  const [editingDue, setEditingDue] = useState<MemberDue | null>(null);
  const [waivingDue, setWaivingDue] = useState<MemberDue | null>(null);
  const queryClient = useQueryClient();
  const members = useQuery({ queryKey: ['memberships', q], queryFn: () => api.get<ListResponse<Membership>>(`/memberships${queryString({ q, pageSize: 100 })}`) });
  const committees = useQuery({ queryKey: ['committees'], queryFn: () => api.get<Committee[]>('/memberships/committees') });
  const users = useQuery({ queryKey: ['project-manager-options'], queryFn: () => api.get<User[]>('/project-managers/options') });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['memberships'] }); void queryClient.invalidateQueries({ queryKey: ['committees'] }); };
  const saveMember = useMutation({ mutationFn: (body: Record<string, string>) => editingMember ? api.patch(`/memberships/${editingMember.id}`, body) : api.post('/memberships', body), onSuccess: () => { refresh(); setMemberModal(false); setEditingMember(null); } });
  const deactivateMember = useMutation({ mutationFn: (id: string) => api.delete(`/memberships/${id}`), onSuccess: () => { refresh(); setDeactivatingMember(null); } });
  const saveCommittee = useMutation({ mutationFn: (body: Record<string, string>) => editingCommittee ? api.patch(`/memberships/committees/${editingCommittee.id}`, body) : api.post('/memberships/committees', body), onSuccess: () => { refresh(); setCommitteeModal(false); setEditingCommittee(null); } });
  const deactivateCommittee = useMutation({ mutationFn: (id: string) => api.delete(`/memberships/committees/${id}`), onSuccess: () => { refresh(); setDeactivatingCommittee(null); } });
  const saveDue = useMutation({ mutationFn: (body: Record<string, string>) => editingDue ? api.patch(`/memberships/dues/${editingDue.id}`, body) : api.post('/memberships/dues', { ...body, membershipId: dueMember?.id }), onSuccess: () => { refresh(); setDueMember(null); setEditingDue(null); } });
  const waiveDue = useMutation({ mutationFn: (id: string) => api.delete(`/memberships/dues/${id}`), onSuccess: () => { refresh(); setWaivingDue(null); } });
  const columns: TableColumn<Membership>[] = [
    { key: 'name', label: '会员名称', render: (row) => <span className="primary-cell"><strong>{row.memberName}</strong><small>{row.memberType}</small></span> },
    { key: 'committee', label: '所属专委会', render: (row) => <span>{row.committee.name}<small className="block-muted mono">{row.committee.committeeCode}</small></span> },
    { key: 'pm', label: 'PM', render: (row) => row.pm.displayName },
    { key: 'joined', label: '入会日期', render: (row) => formatDate(row.joinedOn) },
    { key: 'due', label: '最近会费', render: (row) => row.dues[0] ? <span>{row.dues[0].periodLabel ?? row.dues[0].dueCode}<small className="block-muted">应收 {formatMoney(row.dues[0].amountDue)} · 实收 {formatMoney(row.dues[0].amountPaid)}</small></span> : <span className="muted">尚未生成</span> },
    { key: 'status', label: '状态', render: (row) => <span className="row-actions"><StatusChip value={row.status} />{row.dues[0] && <StatusChip value={row.dues[0].status} />}</span> },
    { key: 'action', label: '', render: (row) => {
      const latestDue = row.dues[0];
      return <span className="row-actions">
        <button className="table-action" onClick={() => { setDueMember(row); setEditingDue(null); }}><Plus size={15} />会费</button>
        {latestDue && <button className="table-action" onClick={() => { setDueMember(row); setEditingDue(latestDue); }}><Pencil size={14} />会费</button>}
        {latestDue && latestDue.status !== 'WAIVED' && <button className="table-action danger" onClick={() => setWaivingDue(latestDue)}><Trash2 size={14} />免除</button>}
        <button className="table-action" onClick={() => setEditingMember(row)}><Pencil size={14} />会员</button>
        {row.status === 'ACTIVE' && <button className="table-action danger" onClick={() => setDeactivatingMember(row)}><Trash2 size={14} />停用</button>}
      </span>;
    } },
  ];
  return <div className="page-enter">
    <PageHeader eyebrow="基础资料 / 会员" title="会员库" description="会员按专委会归档，会费通过银行流水确认后自动更新实收状态。" action={<div className="button-group"><button className="button secondary" onClick={() => { setCommitteeModal(true); setEditingCommittee(null); }}><Landmark size={16} />成立专委会</button><button className="button primary" onClick={() => { setMemberModal(true); setEditingMember(null); }}><Plus size={17} />新增会员</button></div>} />
    <div className="committee-strip">{committees.data?.map((item) => <span key={item.id}><small>{item.committeeCode}</small><strong>{item.name}</strong><b>{item._count?.memberships ?? 0} 位会员</b><i className="committee-actions"><button type="button" onClick={() => setEditingCommittee(item)}>编辑</button><button type="button" onClick={() => setDeactivatingCommittee(item)}>停用</button></i></span>)}</div>
    <div className="toolbar"><SearchBar value={q} onChange={setQ} placeholder="搜索会员或专委会" /><span className="result-count">{members.data?.total ?? 0} 位会员</span></div>
    <section className="panel table-panel">{members.isLoading ? <LoadingState /> : members.error ? <ErrorState error={members.error} /> : <DataTable columns={columns} rows={members.data?.items ?? []} rowKey={(row) => row.id} />}</section>

    <Modal open={memberModal || Boolean(editingMember)} onClose={() => { setMemberModal(false); setEditingMember(null); }} title={editingMember ? '编辑会员' : '新增会员'}>
      <form key={editingMember?.id ?? 'new'} className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const body = formObject(event.currentTarget); if (!body.joinedOn) delete body.joinedOn; saveMember.mutate(body); }}>
        <Field label="会员名称" span={2}><Input name="memberName" required defaultValue={editingMember?.memberName ?? ''} /></Field>
        <Field label="所属专委会" span={2}><Select name="committeeId" required defaultValue={editingMember?.committeeId ?? editingMember?.committee.id ?? ''}><option value="">请选择</option>{committees.data?.map((item) => <option key={item.id} value={item.id}>{item.committeeCode} · {item.name}</option>)}</Select></Field>
        <Field label="会员类别"><Input name="memberType" required defaultValue={editingMember?.memberType ?? ''} /></Field><Field label="负责 PM"><Select name="pmUserId" required defaultValue={editingMember?.pmUserId ?? editingMember?.pm.id ?? ''}><option value="">请选择</option>{users.data?.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select></Field>
        <Field label="入会日期"><Input name="joinedOn" type="date" defaultValue={editingMember?.joinedOn?.slice(0, 10) ?? ''} /></Field>
        {editingMember && <Field label="会员状态"><Select name="status" defaultValue={editingMember.status}><option value="ACTIVE">启用</option><option value="INACTIVE">停用</option></Select></Field>}
        {saveMember.error && <p className="form-error span-2">{saveMember.error.message}</p>}<div className="span-2"><FormActions pending={saveMember.isPending} onCancel={() => { setMemberModal(false); setEditingMember(null); }} submitLabel="保存" /></div>
      </form>
    </Modal>
    <Modal open={committeeModal || Boolean(editingCommittee)} onClose={() => { setCommitteeModal(false); setEditingCommittee(null); }} title={editingCommittee ? '编辑专委会' : '成立专委会'}>
      <form key={editingCommittee?.id ?? 'new'} className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); saveCommittee.mutate(formObject(event.currentTarget)); }}>
        <Field label="专委会编码"><Input name="committeeCode" required defaultValue={editingCommittee?.committeeCode ?? ''} /></Field><Field label="成立日期"><Input name="establishedOn" type="date" required defaultValue={editingCommittee?.establishedOn?.slice(0, 10) ?? ''} /></Field>
        <Field label="专委会名称" span={2}><Input name="name" required defaultValue={editingCommittee?.name ?? ''} /></Field><Field label="负责 PM" span={2}><Select name="ownerUserId" required defaultValue={editingCommittee?.ownerUserId ?? editingCommittee?.owner.id ?? ''}><option value="">请选择</option>{users.data?.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select></Field>
        {saveCommittee.error && <p className="form-error span-2">{saveCommittee.error.message}</p>}<div className="span-2"><FormActions pending={saveCommittee.isPending} onCancel={() => { setCommitteeModal(false); setEditingCommittee(null); }} submitLabel="保存专委会" /></div>
      </form>
    </Modal>
    <Modal open={Boolean(dueMember)} onClose={() => { setDueMember(null); setEditingDue(null); }} title={editingDue ? '编辑会费应收' : '新增会费应收'} description={dueMember ? `${dueMember.committee.name} · ${dueMember.memberName}` : undefined}>
      <form key={editingDue?.id ?? 'new'} className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const body = formObject(event.currentTarget); if (!body.dueOn) delete body.dueOn; saveDue.mutate(body); }}>
        <Field label="应收编号"><Input name="dueCode" required defaultValue={editingDue?.dueCode ?? ''} /></Field><Field label="缴费期次"><Input name="periodLabel" defaultValue={editingDue?.periodLabel ?? ''} /></Field>
        <Field label="应收金额"><MoneyInput name="amountDue" min="0.01" required defaultValue={editingDue?.amountDue ?? ''} /></Field><Field label="应缴日期"><Input name="dueOn" type="date" defaultValue={editingDue?.dueOn?.slice(0, 10) ?? ''} /></Field>
        {saveDue.error && <p className="form-error span-2">{saveDue.error.message}</p>}<div className="span-2"><FormActions pending={saveDue.isPending} onCancel={() => { setDueMember(null); setEditingDue(null); }} submitLabel="保存会费" /></div>
      </form>
    </Modal>
    <ConfirmActionModal open={Boolean(deactivatingMember)} onClose={() => setDeactivatingMember(null)} onConfirm={() => deactivatingMember && deactivateMember.mutate(deactivatingMember.id)} pending={deactivateMember.isPending} title="停用会员" description={deactivatingMember ? `确认停用“${deactivatingMember.memberName}”？历史会费记录将保留。` : ''} confirmLabel="确认停用" error={deactivateMember.error} />
    <ConfirmActionModal open={Boolean(deactivatingCommittee)} onClose={() => setDeactivatingCommittee(null)} onConfirm={() => deactivatingCommittee && deactivateCommittee.mutate(deactivatingCommittee.id)} pending={deactivateCommittee.isPending} title="停用专委会" description={deactivatingCommittee ? `确认停用“${deactivatingCommittee.name}”？已有会员记录不会删除。` : ''} confirmLabel="确认停用" error={deactivateCommittee.error} />
    <ConfirmActionModal open={Boolean(waivingDue)} onClose={() => setWaivingDue(null)} onConfirm={() => waivingDue && waiveDue.mutate(waivingDue.id)} pending={waiveDue.isPending} title="免除会费" description={waivingDue ? `确认免除会费应收“${waivingDue.dueCode}”？` : ''} confirmLabel="确认免除" error={waiveDue.error} />
  </div>;
}
