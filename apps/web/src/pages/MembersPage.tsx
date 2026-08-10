import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { DateInput, Field, FormActions, Input, MoneyInput, SearchableSelect, Select } from '../components/FormControls';
import { LedgerAttachmentList, PdfAttachmentInput, uploadLedgerAttachments } from '../components/LedgerAttachments';
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
import type { Committee, ListResponse, MemberDue, Membership, ProjectManager } from '../lib/types';

export function MembersPage() {
  const { user } = useAuth();
  const canEdit = hasPermission(user, 'MEMBERS', 'EDIT');
  const [q, setQ] = useState(''); const [memberModal, setMemberModal] = useState(false); const [committeeModal, setCommitteeModal] = useState(false); const [dueMember, setDueMember] = useState<Membership | null>(null);
  const [page, setPage] = useState(1);
  const [committeeQ, setCommitteeQ] = useState('');
  const [committeePage, setCommitteePage] = useState(1);
  const [editingMember, setEditingMember] = useState<Membership | null>(null);
  const [memberAttachmentFiles, setMemberAttachmentFiles] = useState<File[]>([]);
  const [memberNotice, setMemberNotice] = useState('');
  const [deactivatingMember, setDeactivatingMember] = useState<Membership | null>(null);
  const [editingCommittee, setEditingCommittee] = useState<Committee | null>(null);
  const [deactivatingCommittee, setDeactivatingCommittee] = useState<Committee | null>(null);
  const [editingDue, setEditingDue] = useState<MemberDue | null>(null);
  const [waivingDue, setWaivingDue] = useState<MemberDue | null>(null);
  const [viewingDues, setViewingDues] = useState<Membership | null>(null);
  const [dueHistoryPage, setDueHistoryPage] = useState(1);
  const queryClient = useQueryClient();
  const members = useQuery({ queryKey: ['memberships', q, page], queryFn: () => api.get<ListResponse<Membership>>(`/memberships${queryString({ q, page, pageSize: DEFAULT_PAGE_SIZE })}`) });
  const committees = useQuery({ queryKey: ['committees', committeeQ, committeePage], queryFn: () => api.get<ListResponse<Committee>>(`/memberships/committees${queryString({ q: committeeQ, page: committeePage, pageSize: 4 })}`) });
  const committeeOptions = useQuery({ queryKey: ['committee-options'], queryFn: () => api.get<Pick<Committee, 'id' | 'committeeCode' | 'name'>[]>('/memberships/committees/options') });
  const users = useQuery({ queryKey: ['project-manager-options'], queryFn: () => api.get<ProjectManager[]>('/project-managers/options') });
  const dueHistory = useQuery({
    queryKey: ['member-dues', viewingDues?.id, dueHistoryPage],
    queryFn: () => api.get<ListResponse<MemberDue>>(`/memberships/${viewingDues!.id}/dues${queryString({ page: dueHistoryPage, pageSize: 10 })}`),
    enabled: Boolean(viewingDues),
  });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['memberships'] }); void queryClient.invalidateQueries({ queryKey: ['committees'] }); void queryClient.invalidateQueries({ queryKey: ['committee-options'] }); void queryClient.invalidateQueries({ queryKey: ['member-dues'] }); };
  const saveMember = useMutation({
    mutationFn: async ({ body, files }: { body: Record<string, string>; files: File[] }) => {
      const membership = editingMember
        ? await api.patch<Membership>(`/memberships/${editingMember.id}`, body)
        : await api.post<Membership>('/memberships', body);
      return { failedUploads: await uploadLedgerAttachments('MEMBERSHIP', membership.id, files) };
    },
    onSuccess: ({ failedUploads }) => {
      refresh();
      setMemberNotice(failedUploads ? `会员已保存，但有 ${failedUploads} 个附件上传失败，请编辑会员后重试。` : '');
      setMemberModal(false); setEditingMember(null); setMemberAttachmentFiles([]);
    },
  });
  const deactivateMember = useMutation({ mutationFn: (id: string) => api.delete(`/memberships/${id}`), onSuccess: () => { refresh(); setDeactivatingMember(null); } });
  const saveCommittee = useMutation({ mutationFn: (body: Record<string, string>) => editingCommittee ? api.patch(`/memberships/committees/${editingCommittee.id}`, body) : api.post('/memberships/committees', body), onSuccess: () => { refresh(); setCommitteeModal(false); setEditingCommittee(null); } });
  const deactivateCommittee = useMutation({ mutationFn: (id: string) => api.delete(`/memberships/committees/${id}`), onSuccess: () => { refresh(); setDeactivatingCommittee(null); } });
  const saveDue = useMutation({ mutationFn: (body: Record<string, string>) => editingDue ? api.patch(`/memberships/dues/${editingDue.id}`, body) : api.post('/memberships/dues', { ...body, membershipId: dueMember?.id }), onSuccess: () => { refresh(); setDueMember(null); setEditingDue(null); } });
  const waiveDue = useMutation({ mutationFn: (id: string) => api.delete(`/memberships/dues/${id}`), onSuccess: () => { refresh(); setWaivingDue(null); } });
  const columns: TableColumn<Membership>[] = [
    { key: 'name', label: '会员名称', render: (row) => <span className="primary-cell"><strong>{row.memberName}</strong><small>{row.memberType}</small></span> },
    { key: 'position', label: '会员职务', render: (row) => row.memberPosition ?? '—' },
    { key: 'committee', label: '所属专委会', render: (row) => <span>{row.committee.name}<small className="block-muted mono">{row.committee.committeeCode}</small></span> },
    { key: 'pm', label: 'PM', render: (row) => row.pm.displayName },
    { key: 'joined', label: '入会日期', render: (row) => formatDate(row.joinedOn) },
    { key: 'certificate', label: '会员证书', render: (row) => row.certificateIssued ? '已发放' : '未发放' },
    { key: 'due', label: '最近会费', render: (row) => row.dues[0] ? <span>{row.dues[0].periodLabel ?? row.dues[0].dueCode}<small className="block-muted">应收 {formatMoney(row.dues[0].amountDue)} · 实收 {formatMoney(row.dues[0].amountPaid)}</small><button type="button" className="due-history-link" onClick={() => { setDueHistoryPage(1); setViewingDues(row); }}>查看全部 {row._count?.dues ?? row.dues.length} 笔</button></span> : <span className="muted">尚未生成</span> },
    { key: 'status', label: '状态', render: (row) => <span className="row-actions"><StatusChip value={row.status} />{row.dues[0] && <StatusChip value={row.dues[0].status} />}</span> },
    { key: 'attachments', label: '附件列表', render: (row) => <LedgerAttachmentList objectType="MEMBERSHIP" objectId={row.id} attachments={row.attachments ?? []} /> },
    { key: 'action', label: '', render: (row) => {
      return <span className="row-actions">
        {canEdit && <button className="table-action" onClick={() => { setDueMember(row); setEditingDue(null); }}><Plus size={15} />会费</button>}
        {(row._count?.dues ?? row.dues.length) > 0 && <button className="table-action" onClick={() => { setDueHistoryPage(1); setViewingDues(row); }}><ReceiptText size={14} />记录</button>}
        {canEdit && <button className="table-action" onClick={() => { setMemberAttachmentFiles([]); setMemberNotice(''); setEditingMember(row); }}><Pencil size={14} />会员</button>}
        {canEdit && row.status === 'ACTIVE' && <button className="table-action danger" onClick={() => setDeactivatingMember(row)}><Trash2 size={14} />停用</button>}
      </span>;
    } },
  ];
  return <div className="page-enter">
    <PageHeader eyebrow="基础资料 / 会员" title="会员库" description="会员按专委会归档，会费通过银行流水确认后自动更新实收状态。" action={(user?.role === 'SYSTEM_ADMIN' || canEdit) ? <div className="button-group">{user?.role === 'SYSTEM_ADMIN' && <LedgerExportButton dataset="members" fileName="会员库" filters={{ q }} />}{canEdit && <button className="button secondary" onClick={() => { setCommitteeModal(true); setEditingCommittee(null); }}><Landmark size={16} />成立专委会</button>}{canEdit && <button className="button primary" onClick={() => { setMemberAttachmentFiles([]); setMemberNotice(''); setMemberModal(true); setEditingMember(null); }}><Plus size={17} />新增会员</button>}</div> : undefined} />
    {memberNotice && <div className="operation-banner">{memberNotice}</div>}
    <section className="committee-directory">
      <div className="committee-directory-head"><span><small>专委会目录</small><strong>{committees.data?.total ?? 0} 个启用专委会</strong></span><SearchBar value={committeeQ} onChange={(value) => { setCommitteeQ(value); setCommitteePage(1); }} placeholder="搜索专委会名称或编码" /></div>
      {committees.isLoading ? <LoadingState /> : committees.error ? <ErrorState error={committees.error} /> : <><div className="committee-strip">{committees.data?.items.map((item) => <span key={item.id}><small>{item.committeeCode}</small><strong>{item.name}</strong><b>{item._count?.memberships ?? 0} 位会员</b>{canEdit && <i className="committee-actions"><button type="button" onClick={() => setEditingCommittee(item)}>编辑</button><button type="button" onClick={() => setDeactivatingCommittee(item)}>停用</button></i>}</span>)}</div>{committees.data?.items.length === 0 && <p className="committee-empty">没有找到符合条件的专委会</p>}<Pagination compact page={committeePage} pageSize={4} total={committees.data?.total ?? 0} onPageChange={setCommitteePage} /></>}
    </section>
    <div className="toolbar"><SearchBar value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="搜索会员或所属专委会" /><span className="result-count">{members.data?.total ?? 0} 位会员</span></div>
    <section className="panel table-panel">{members.isLoading ? <LoadingState /> : members.error ? <ErrorState error={members.error} /> : <><DataTable columns={columns} rows={members.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={members.data?.total ?? 0} onPageChange={setPage} /></>}</section>

    <Modal open={memberModal || Boolean(editingMember)} onClose={() => { setMemberModal(false); setEditingMember(null); setMemberAttachmentFiles([]); }} title={editingMember ? '编辑会员' : '新增会员'} size="large">
      <form key={editingMember?.id ?? 'new'} className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const body = formObject(event.currentTarget); if (!body.joinedOn) delete body.joinedOn; saveMember.mutate({ body, files: memberAttachmentFiles }); }}>
        <Field label="会员名称" span={2}><Input name="memberName" required defaultValue={editingMember?.memberName ?? ''} /></Field>
        <Field label="所属专委会" span={2}><SearchableSelect name="committeeId" ariaLabel="所属专委会" required defaultValue={editingMember?.committeeId ?? editingMember?.committee.id ?? ''} disabled={committeeOptions.isLoading || committeeOptions.isError} placeholder="请选择专委会" searchPlaceholder="搜索专委会名称或编码" options={(committeeOptions.data ?? []).map((item) => ({ value: item.id, label: `${item.committeeCode} · ${item.name}` }))} /></Field>
        <Field label="会员类别"><Input name="memberType" required defaultValue={editingMember?.memberType ?? ''} /></Field><Field label="会员职务"><Input name="memberPosition" required defaultValue={editingMember?.memberPosition ?? ''} /></Field>
        <Field label="负责 PM"><SearchableSelect name="pmUserId" ariaLabel="负责 PM" required defaultValue={editingMember?.pmUserId ?? editingMember?.pm.id ?? ''} disabled={users.isLoading || users.isError} placeholder="请选择 PM" searchPlaceholder="搜索 PM 姓名" options={(users.data ?? []).map((user) => ({ value: user.id, label: user.displayName, searchText: user.department }))} /></Field><Field label="入会日期"><DateInput name="joinedOn" aria-label="入会日期" defaultValue={editingMember?.joinedOn?.slice(0, 10) ?? ''} /></Field>
        <Field label="是否发放会员证书" span={editingMember ? 1 : 2}><Select name="certificateIssued" defaultValue={editingMember?.certificateIssued ? 'true' : 'false'}><option value="false">否</option><option value="true">是</option></Select></Field>
        {editingMember && <Field label="会员状态"><Select name="status" defaultValue={editingMember.status}><option value="ACTIVE">启用</option><option value="INACTIVE">停用</option></Select></Field>}
        <Field label="附件列表" span={2} hint="可选；仅支持 PDF，每次添加一份，最多 10 份；单个文件不超过 10MB。"><PdfAttachmentInput files={memberAttachmentFiles} onFilesChange={setMemberAttachmentFiles} existingCount={editingMember?.attachments?.length ?? 0} />{editingMember && <LedgerAttachmentList objectType="MEMBERSHIP" objectId={editingMember.id} attachments={editingMember.attachments ?? []} canDelete onDeleted={(attachmentId) => { setEditingMember((current) => current ? { ...current, attachments: current.attachments?.filter((item) => item.id !== attachmentId) } : current); void queryClient.invalidateQueries({ queryKey: ['memberships'] }); }} />}</Field>
        {saveMember.error && <p className="form-error span-2">{saveMember.error.message}</p>}<div className="span-2"><FormActions pending={saveMember.isPending} onCancel={() => { setMemberModal(false); setEditingMember(null); setMemberAttachmentFiles([]); }} submitLabel="保存" /></div>
      </form>
    </Modal>
    <Modal open={committeeModal || Boolean(editingCommittee)} onClose={() => { setCommitteeModal(false); setEditingCommittee(null); }} title={editingCommittee ? '编辑专委会' : '成立专委会'}>
      <form key={editingCommittee?.id ?? 'new'} className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); saveCommittee.mutate(formObject(event.currentTarget)); }}>
        <Field label="专委会编码"><Input name="committeeCode" required defaultValue={editingCommittee?.committeeCode ?? ''} /></Field><Field label="成立日期"><DateInput name="establishedOn" aria-label="成立日期" required defaultValue={editingCommittee?.establishedOn?.slice(0, 10) ?? ''} /></Field>
        <Field label="专委会名称" span={2}><Input name="name" required defaultValue={editingCommittee?.name ?? ''} /></Field><Field label="负责 PM" span={2}><SearchableSelect name="ownerUserId" ariaLabel="负责 PM" required defaultValue={editingCommittee?.ownerUserId ?? editingCommittee?.owner.id ?? ''} disabled={users.isLoading || users.isError} placeholder="请选择 PM" searchPlaceholder="搜索 PM 姓名" options={(users.data ?? []).map((user) => ({ value: user.id, label: user.displayName, searchText: user.department }))} /></Field>
        {saveCommittee.error && <p className="form-error span-2">{saveCommittee.error.message}</p>}<div className="span-2"><FormActions pending={saveCommittee.isPending} onCancel={() => { setCommitteeModal(false); setEditingCommittee(null); }} submitLabel="保存专委会" /></div>
      </form>
    </Modal>
    <Modal open={Boolean(dueMember)} onClose={() => { setDueMember(null); setEditingDue(null); }} title={editingDue ? '编辑会费应收' : '新增会费应收'} description={dueMember ? `${dueMember.committee.name} · ${dueMember.memberName}` : undefined}>
      <form key={editingDue?.id ?? 'new'} className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const body = formObject(event.currentTarget); if (!body.dueOn) delete body.dueOn; saveDue.mutate(body); }}>
        <Field label="应收编号"><Input name="dueCode" required defaultValue={editingDue?.dueCode ?? ''} /></Field><Field label="缴费期次"><Input name="periodLabel" defaultValue={editingDue?.periodLabel ?? ''} /></Field>
        <Field label="应收金额"><MoneyInput name="amountDue" min="0.01" required defaultValue={editingDue?.amountDue ?? ''} /></Field><Field label="应缴日期"><DateInput name="dueOn" aria-label="应缴日期" defaultValue={editingDue?.dueOn?.slice(0, 10) ?? ''} /></Field>
        {saveDue.error && <p className="form-error span-2">{saveDue.error.message}</p>}<div className="span-2"><FormActions pending={saveDue.isPending} onCancel={() => { setDueMember(null); setEditingDue(null); }} submitLabel="保存会费" /></div>
      </form>
    </Modal>
    <Modal open={Boolean(viewingDues)} onClose={() => setViewingDues(null)} title="会费记录" description={viewingDues ? `${viewingDues.committee.name} · ${viewingDues.memberName} · 共 ${dueHistory.data?.total ?? viewingDues._count?.dues ?? 0} 笔` : undefined} size="wide">
      <div className="due-history">
        <div className="due-history-toolbar"><span>按应缴日期倒序排列</span>{canEdit && <button type="button" className="button primary" onClick={() => { if (!viewingDues) return; setDueMember(viewingDues); setEditingDue(null); setViewingDues(null); }}><Plus size={15} />新增会费</button>}</div>
        {dueHistory.isLoading ? <LoadingState /> : dueHistory.error ? <ErrorState error={dueHistory.error} /> : <>
          <DataTable columns={[
            { key: 'period', label: '缴费期次', render: (due: MemberDue) => <span className="primary-cell"><strong>{due.periodLabel ?? '未填写'}</strong><small className="mono">{due.dueCode}</small></span> },
            { key: 'date', label: '应缴日期', render: (due: MemberDue) => formatDate(due.dueOn) },
            { key: 'amount', label: '应收 / 实收', className: 'number', render: (due: MemberDue) => <span>{formatMoney(due.amountDue)}<small className="block-muted">实收 {formatMoney(due.amountPaid)}</small></span> },
            { key: 'status', label: '状态', render: (due: MemberDue) => <StatusChip value={due.status} /> },
            { key: 'action', label: '', render: (due: MemberDue) => canEdit ? <span className="row-actions"><button type="button" className="table-action" onClick={() => { if (!viewingDues) return; setDueMember(viewingDues); setEditingDue(due); setViewingDues(null); }}><Pencil size={14} />编辑</button>{due.status !== 'WAIVED' && <button type="button" className="table-action danger" onClick={() => { setWaivingDue(due); setViewingDues(null); }}><Trash2 size={14} />免除</button>}</span> : null },
          ]} rows={dueHistory.data?.items ?? []} rowKey={(due) => due.id} />
          <Pagination page={dueHistoryPage} pageSize={10} total={dueHistory.data?.total ?? 0} onPageChange={setDueHistoryPage} />
        </>}
      </div>
    </Modal>
    <ConfirmActionModal open={Boolean(deactivatingMember)} onClose={() => setDeactivatingMember(null)} onConfirm={() => deactivatingMember && deactivateMember.mutate(deactivatingMember.id)} pending={deactivateMember.isPending} title="停用会员" description={deactivatingMember ? `确认停用“${deactivatingMember.memberName}”？历史会费记录将保留。` : ''} confirmLabel="确认停用" error={deactivateMember.error} />
    <ConfirmActionModal open={Boolean(deactivatingCommittee)} onClose={() => setDeactivatingCommittee(null)} onConfirm={() => deactivatingCommittee && deactivateCommittee.mutate(deactivatingCommittee.id)} pending={deactivateCommittee.isPending} title="停用专委会" description={deactivatingCommittee ? `确认停用“${deactivatingCommittee.name}”？已有会员记录不会删除。` : ''} confirmLabel="确认停用" error={deactivateCommittee.error} />
    <ConfirmActionModal open={Boolean(waivingDue)} onClose={() => setWaivingDue(null)} onConfirm={() => waivingDue && waiveDue.mutate(waivingDue.id)} pending={waiveDue.isPending} title="免除会费" description={waivingDue ? `确认免除会费应收“${waivingDue.dueCode}”？` : ''} confirmLabel="确认免除" error={waiveDue.error} />
  </div>;
}
