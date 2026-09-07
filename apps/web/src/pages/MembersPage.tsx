import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileCheck2, Landmark, Pencil, Plus, ReceiptText, Trash2, Upload } from 'lucide-react';
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

type MembershipImportResult = { total: number; successCount: number; failureCount: number; errors: Array<{ row: number; message: string }> };
type CommitteeMembershipStatus = 'NOT_JOINED' | 'LEFT_OFFICE' | 'IN_OFFICE';

export function MembersPage({ view }: { view: 'committees' | 'members' }) {
  const { user } = useAuth();
  const canEdit = hasPermission(user, 'MEMBERS', 'EDIT');
  const canCreate = hasPermission(user, 'MEMBERS', 'ENTRY');
  const [q, setQ] = useState(''); const [memberModal, setMemberModal] = useState(false); const [committeeModal, setCommitteeModal] = useState(false); const [dueMember, setDueMember] = useState<Membership | null>(null);
  const [page, setPage] = useState(1);
  const [committeeQ, setCommitteeQ] = useState('');
  const [committeePage, setCommitteePage] = useState(1);
  const [editingMember, setEditingMember] = useState<Membership | null>(null);
  const [memberAttachmentFiles, setMemberAttachmentFiles] = useState<File[]>([]);
  const [memberNotice, setMemberNotice] = useState('');
  const [joinsCommittee, setJoinsCommittee] = useState(false);
  const [materialsMember, setMaterialsMember] = useState<Membership | null>(null);
  const [certificateIssued, setCertificateIssued] = useState(false);
  const [appointmentLetterIssued, setAppointmentLetterIssued] = useState(false);
  const [committeeMember, setCommitteeMember] = useState<Membership | null>(null);
  const [committeeMembershipStatus, setCommitteeMembershipStatus] = useState<CommitteeMembershipStatus>('NOT_JOINED');
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [deactivatingMember, setDeactivatingMember] = useState<Membership | null>(null);
  const [editingCommittee, setEditingCommittee] = useState<Committee | null>(null);
  const [deactivatingCommittee, setDeactivatingCommittee] = useState<Committee | null>(null);
  const [editingDue, setEditingDue] = useState<MemberDue | null>(null);
  const [waivingDue, setWaivingDue] = useState<MemberDue | null>(null);
  const [viewingDues, setViewingDues] = useState<Membership | null>(null);
  const [dueHistoryPage, setDueHistoryPage] = useState(1);
  const queryClient = useQueryClient();
  const members = useQuery({ queryKey: ['memberships', q, page], queryFn: () => api.get<ListResponse<Membership>>(`/memberships${queryString({ q, page, pageSize: DEFAULT_PAGE_SIZE })}`), enabled: view === 'members' });
  const committees = useQuery({ queryKey: ['committees', committeeQ, committeePage], queryFn: () => api.get<ListResponse<Committee>>(`/memberships/committees${queryString({ q: committeeQ, page: committeePage, pageSize: DEFAULT_PAGE_SIZE })}`), enabled: view === 'committees' });
  const committeeOptions = useQuery({ queryKey: ['committee-options'], queryFn: () => api.get<Pick<Committee, 'id' | 'committeeCode' | 'name'>[]>('/memberships/committees/options'), enabled: view === 'members' });
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
  const saveMaterials = useMutation({
    mutationFn: () => api.patch(`/memberships/${materialsMember!.id}`, { certificateIssued: String(certificateIssued), appointmentLetterIssued: String(appointmentLetterIssued) }),
    onSuccess: () => { refresh(); setMaterialsMember(null); },
  });
  const saveCommitteeMembership = useMutation({
    mutationFn: (body: Record<string, string>) => api.patch(`/memberships/${committeeMember!.id}`, body),
    onSuccess: () => { refresh(); setCommitteeMember(null); },
  });
  const importMembers = useMutation({
    mutationFn: (file: File) => api.upload<MembershipImportResult>('/memberships/import', file),
    onSuccess: () => { setPage(1); refresh(); },
  });

  function openNewMember() {
    setMemberAttachmentFiles([]); setMemberNotice(''); setJoinsCommittee(false); setMemberModal(true); setEditingMember(null);
  }

  function openMemberEditor(member: Membership) {
    setMemberAttachmentFiles([]); setMemberNotice(''); setJoinsCommittee(Boolean(member.committeeId)); setEditingMember(member);
  }

  function closeMemberEditor() {
    setMemberModal(false); setEditingMember(null); setMemberAttachmentFiles([]); setJoinsCommittee(false);
  }

  function openMaterials(member: Membership) {
    setCertificateIssued(member.certificateIssued); setAppointmentLetterIssued(member.appointmentLetterIssued); setMaterialsMember(member);
  }

  function openCommitteeMembership(member: Membership) {
    setCommitteeMember(member);
    setCommitteeMembershipStatus(member.committee ? member.committeeMemberStatus ?? 'IN_OFFICE' : 'NOT_JOINED');
  }

  async function downloadImportTemplate() {
    try {
      const blob = await api.download('/memberships/import-template');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = '会员库导入模板.csv'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) { setMemberNotice(error instanceof Error ? error.message : '模板下载失败'); }
  }

  function closeImport() { setImportOpen(false); setImportFile(null); importMembers.reset(); }
  const columns: TableColumn<Membership>[] = [
    { key: 'name', label: '会员名称', render: (row) => <span className="primary-cell"><strong>{row.memberName}</strong><small>{row.memberType}</small><small>{[row.organizationName, row.department].filter(Boolean).join(' · ') || '未填写单位/科室'}</small></span> },
    { key: 'contact', label: '联系方式', render: (row) => <span className="primary-cell"><strong>{row.phoneMasked ?? '未填写手机号'}</strong><small>{row.email ?? '未填写邮箱'}</small><small>{row.idNumberMasked ? `身份证 ${row.idNumberMasked}` : '未填写身份证号'}</small></span> },
    { key: 'position', label: '会员职务', render: (row) => row.memberPosition ?? '—' },
    { key: 'committee', label: '所属专委会', render: (row) => row.committee ? <span>{row.committee.name}<small className="block-muted mono">{row.committee.committeeCode}</small></span> : <span className="muted">未加入</span> },
    { key: 'pm', label: 'PM', render: (row) => row.pm.displayName },
    { key: 'joined', label: '入会日期', render: (row) => formatDate(row.joinedOn) },
    { key: 'certificate', label: '会员证书', render: (row) => row.certificateIssued ? '已发放' : '未发放' },
    { key: 'due', label: '会费', render: (row) => <span className="member-fee-summary"><small>应收 <strong>{formatMoney(row.feeSummary?.receivableAmount)}</strong></small><small>实收 <strong>{formatMoney(row.feeSummary?.receivedAmount)}</strong></small><small>已开票 <strong>{formatMoney(row.feeSummary?.invoicedAmount)}</strong></small>{(row._count?.dues ?? row.dues.length) > 0 && <button type="button" className="due-history-link" onClick={() => { setDueHistoryPage(1); setViewingDues(row); }}>查看全部 {row._count?.dues ?? row.dues.length} 笔</button>}</span> },
    { key: 'status', label: '状态', render: (row) => <span className="row-actions"><StatusChip value={row.status} />{row.dues[0] && <StatusChip value={row.dues[0].status} />}</span> },
    { key: 'attachments', label: '附件列表', render: (row) => <LedgerAttachmentList objectType="MEMBERSHIP" objectId={row.id} attachments={row.attachments ?? []} /> },
    { key: 'committeeMembership', label: '专委会', render: (row) => <button type="button" className="committee-membership-link" disabled={!canEdit} onClick={() => canEdit && openCommitteeMembership(row)}><strong>{row.committee ? row.memberPosition || '未填写职务' : '未加入专委会'}</strong><small>{row.committee ? `${row.committeeMemberStatus === 'LEFT_OFFICE' ? '离任' : '在任'}${row.committeeTerm ? ` · 第${row.committeeTerm}届` : ''}` : '未加入专委会'}</small></button> },
    { key: 'action', label: '操作', render: (row) => {
      return <span className="row-actions">
        {canCreate && <button className="table-action" onClick={() => { setDueMember(row); setEditingDue(null); }}><Plus size={15} />会费</button>}
        {(row._count?.dues ?? row.dues.length) > 0 && <button className="table-action" onClick={() => { setDueHistoryPage(1); setViewingDues(row); }}><ReceiptText size={14} />记录</button>}
        {canEdit && <button className="table-action" onClick={() => openMemberEditor(row)}><Pencil size={14} />会员</button>}
        {canEdit && <button className="table-action" onClick={() => openMaterials(row)}><FileCheck2 size={14} />会员材料</button>}
        {canEdit && row.status === 'ACTIVE' && <button className="table-action danger" onClick={() => setDeactivatingMember(row)}><Trash2 size={14} />停用</button>}
      </span>;
    } },
  ];
  const committeeColumns: TableColumn<Committee>[] = [
    { key: 'code', label: '专委会编码', render: (row) => <strong className="mono key-cell">{row.committeeCode}</strong> },
    { key: 'name', label: '专委会名称', render: (row) => <strong>{row.name}</strong> },
    { key: 'established', label: '成立日期', render: (row) => formatDate(row.establishedOn) },
    { key: 'owner', label: '负责 PM', render: (row) => row.owner.displayName },
    { key: 'members', label: '会员数量', className: 'number', render: (row) => `${row._count?.memberships ?? 0} 位` },
    { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status ?? 'ACTIVE'} /> },
    { key: 'action', label: '操作', render: (row) => canEdit ? <span className="row-actions"><button type="button" className="table-action" onClick={() => setEditingCommittee(row)}><Pencil size={14} />编辑</button><button type="button" className="table-action danger" onClick={() => setDeactivatingCommittee(row)}><Trash2 size={14} />停用</button></span> : null },
  ];
  return <div className="page-enter">
    {view === 'committees' ? <PageHeader eyebrow="基础资料 / 会员库" title="专委会" description="查询和维护专委会基础资料。" action={canCreate ? <button className="button primary" onClick={() => { setCommitteeModal(true); setEditingCommittee(null); }}><Landmark size={16} />新增专委会</button> : undefined} />
      : <PageHeader eyebrow="基础资料 / 会员库" title="会员" description="管理会员资料、专委会任职与会费记录。" action={(user?.role === 'SYSTEM_ADMIN' || canCreate) ? <div className="button-group">{user?.role === 'SYSTEM_ADMIN' && <LedgerExportButton dataset="members" fileName="会员库" filters={{ q }} />}{canCreate && <button className="button secondary" onClick={() => setImportOpen(true)}><Upload size={16} />批量导入</button>}{canCreate && <button className="button primary" onClick={openNewMember}><Plus size={17} />新增会员</button>}</div> : undefined} />}
    {view === 'members' && memberNotice && <div className="operation-banner">{memberNotice}</div>}
    {view === 'committees' && <><div className="toolbar"><SearchBar value={committeeQ} onChange={(value) => { setCommitteeQ(value); setCommitteePage(1); }} placeholder="搜索专委会名称或编码" /><span className="result-count">{committees.data?.total ?? 0} 个专委会</span></div>
    <section className="panel table-panel">{committees.isLoading ? <LoadingState /> : committees.error ? <ErrorState error={committees.error} /> : <><DataTable tableId="committees" columns={committeeColumns} rows={committees.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={committeePage} total={committees.data?.total ?? 0} onPageChange={setCommitteePage} /></>}</section></>}
    {view === 'members' && <><div className="toolbar"><SearchBar value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="搜索会员或所属专委会" /><span className="result-count">{members.data?.total ?? 0} 位会员</span></div>
    <section className="panel table-panel">{members.isLoading ? <LoadingState /> : members.error ? <ErrorState error={members.error} /> : <><DataTable columns={columns} rows={members.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={members.data?.total ?? 0} onPageChange={setPage} /></>}</section></>}

    <Modal open={memberModal || Boolean(editingMember)} onClose={closeMemberEditor} title={editingMember ? '编辑会员' : '新增会员'} description="会员可不加入专委会；选择加入后再填写任职信息。" size="large">
      <form key={editingMember?.id ?? 'new'} className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const body = formObject(event.currentTarget); if (!body.joinedOn) delete body.joinedOn; if (!body.committeeTerm) delete body.committeeTerm; saveMember.mutate({ body, files: memberAttachmentFiles }); }}>
        <div className="membership-section-title span-2"><strong>基础信息</strong></div>
        <Field label="会员名称"><Input name="memberName" required defaultValue={editingMember?.memberName ?? ''} /></Field>
        <Field label="会员类别"><Select name="memberType" required defaultValue={editingMember?.memberType ?? ''}><option value="">请选择会员类别</option>{editingMember?.memberType && !['个人会员', '单位会员'].includes(editingMember.memberType) && <option value={editingMember.memberType}>{editingMember.memberType}</option>}<option value="个人会员">个人会员</option><option value="单位会员">单位会员</option></Select></Field>
        <Field label="单位"><Input name="organizationName" maxLength={200} defaultValue={editingMember?.organizationName ?? ''} /></Field>
        <Field label="科室"><Input name="department" maxLength={100} defaultValue={editingMember?.department ?? ''} /></Field>
        <Field label="身份证号" hint={editingMember?.idNumberMasked ? `留空保留原号码 ${editingMember.idNumberMasked}` : '保存后仅显示脱敏号码'}><Input name="idNumber" maxLength={32} autoComplete="off" /></Field>
        <Field label="手机号" hint={editingMember?.phoneMasked ? `留空保留原号码 ${editingMember.phoneMasked}` : '保存后仅显示脱敏号码'}><Input name="phone" maxLength={30} autoComplete="off" /></Field>
        <Field label="邮箱" span={2}><Input name="email" type="email" maxLength={200} defaultValue={editingMember?.email ?? ''} /></Field>
        <Field label="负责 PM"><SearchableSelect name="pmUserId" ariaLabel="负责 PM" required defaultValue={editingMember?.pmUserId ?? editingMember?.pm.id ?? ''} disabled={users.isLoading || users.isError} placeholder="请选择 PM" searchPlaceholder="搜索 PM 姓名" options={(users.data ?? []).map((user) => ({ value: user.id, label: user.displayName, searchText: user.department }))} /></Field><Field label="入会日期"><DateInput name="joinedOn" aria-label="入会日期" defaultValue={editingMember?.joinedOn?.slice(0, 10) ?? ''} /></Field>
        {editingMember && <Field label="会员状态"><Select name="status" defaultValue={editingMember.status}><option value="ACTIVE">启用</option><option value="INACTIVE">停用</option></Select></Field>}
        <Field label="会员申请表" span={2} hint="上传专家委员会会员申请表；仅支持 PDF，单个文件不超过 10MB。"><PdfAttachmentInput files={memberAttachmentFiles} onFilesChange={setMemberAttachmentFiles} existingCount={editingMember?.attachments?.length ?? 0} />{editingMember && <LedgerAttachmentList objectType="MEMBERSHIP" objectId={editingMember.id} attachments={editingMember.attachments ?? []} canDelete onDeleted={(attachmentId) => { setEditingMember((current) => current ? { ...current, attachments: current.attachments?.filter((item) => item.id !== attachmentId) } : current); void queryClient.invalidateQueries({ queryKey: ['memberships'] }); }} />}</Field>
        <div className="membership-section-title span-2"><strong>专委会信息</strong></div>
        <Field label="是否加入专委会" span={2}><span className="binary-choice"><label><input type="radio" name="joinsCommittee" value="false" checked={!joinsCommittee} onChange={() => setJoinsCommittee(false)} />否</label><label><input type="radio" name="joinsCommittee" value="true" checked={joinsCommittee} onChange={() => setJoinsCommittee(true)} />是</label></span></Field>
        {joinsCommittee && <div className="committee-join-fields span-2"><Field label="所属专委会" span={2}><SearchableSelect name="committeeId" ariaLabel="所属专委会" required defaultValue={editingMember?.committeeId ?? editingMember?.committee?.id ?? ''} disabled={committeeOptions.isLoading || committeeOptions.isError} placeholder="请选择专委会" searchPlaceholder="搜索专委会名称或编码" options={(committeeOptions.data ?? []).map((item) => ({ value: item.id, label: `${item.committeeCode} · ${item.name}` }))} /></Field><Field label="委员职务"><Input name="memberPosition" defaultValue={editingMember?.memberPosition ?? ''} /></Field><Field label="届次"><Input name="committeeTerm" type="number" min="1" step="1" defaultValue={editingMember?.committeeTerm ?? ''} /></Field></div>}
        {saveMember.error && <p className="form-error span-2">{saveMember.error.message}</p>}<div className="span-2"><FormActions pending={saveMember.isPending} onCancel={closeMemberEditor} submitLabel="保存" /></div>
      </form>
    </Modal>
    <Modal open={Boolean(materialsMember)} onClose={() => setMaterialsMember(null)} title="会员材料" description={materialsMember?.memberName}>
      <div className="member-materials-form">
        <label><span>是否发放会员证书</span><input type="checkbox" checked={certificateIssued} onChange={(event) => setCertificateIssued(event.target.checked)} /></label>
        <label><span>是否发放委员聘书</span><input type="checkbox" checked={appointmentLetterIssued} onChange={(event) => setAppointmentLetterIssued(event.target.checked)} disabled={!materialsMember?.committee} /></label>
        {!materialsMember?.committee && <small>该会员未加入专委会，不能发放委员聘书。</small>}
        {saveMaterials.error && <p className="form-error">{saveMaterials.error.message}</p>}
        <div className="form-actions"><button type="button" className="button ghost" onClick={() => setMaterialsMember(null)}>取消</button><button type="button" className="button primary" disabled={saveMaterials.isPending} onClick={() => saveMaterials.mutate()}>{saveMaterials.isPending ? '正在保存…' : '确认'}</button></div>
      </div>
    </Modal>

    <Modal open={Boolean(committeeMember)} onClose={() => setCommitteeMember(null)} title="专委会任职" description={committeeMember?.memberName}>
      <form key={committeeMember?.id} className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const body = formObject(event.currentTarget); if (committeeMembershipStatus === 'NOT_JOINED') saveCommitteeMembership.mutate({ joinsCommittee: 'false' }); else { if (!body.committeeTerm) delete body.committeeTerm; saveCommitteeMembership.mutate({ ...body, joinsCommittee: 'true', committeeMemberStatus: committeeMembershipStatus }); } }}>
        <Field label="任职状态" span={2}><Select name="committeeMemberStatus" value={committeeMembershipStatus} onChange={(event) => setCommitteeMembershipStatus(event.target.value as CommitteeMembershipStatus)}><option value="NOT_JOINED">未加入专委会</option><option value="LEFT_OFFICE">离任</option><option value="IN_OFFICE">在任</option></Select></Field>
        {committeeMembershipStatus !== 'NOT_JOINED' && <div className="committee-join-fields span-2">
          <Field label="所属专委会" span={2}><SearchableSelect name="committeeId" ariaLabel="所属专委会" required defaultValue={committeeMember?.committeeId ?? committeeMember?.committee?.id ?? ''} disabled={committeeOptions.isLoading || committeeOptions.isError} placeholder="请选择专委会" searchPlaceholder="搜索专委会名称或编码" options={(committeeOptions.data ?? []).map((item) => ({ value: item.id, label: `${item.committeeCode} · ${item.name}` }))} /></Field>
          {committeeMembershipStatus === 'IN_OFFICE' && <><Field label="专委会职务"><Input name="memberPosition" defaultValue={committeeMember?.memberPosition ?? ''} /></Field>
          <Field label="届次"><Input name="committeeTerm" type="number" min="1" step="1" defaultValue={committeeMember?.committeeTerm ?? ''} /></Field></>}
        </div>}
        {saveCommitteeMembership.error && <p className="form-error span-2">{saveCommitteeMembership.error.message}</p>}
        <div className="span-2"><FormActions pending={saveCommitteeMembership.isPending} onCancel={() => setCommitteeMember(null)} submitLabel="保存" /></div>
      </form>
    </Modal>

    <Modal open={importOpen} onClose={closeImport} title="批量导入会员" description="使用标准 CSV 模板录入会员，系统将逐行校验并反馈结果。">
      <div className="import-panel">
        <div className="import-instructions"><strong>导入说明</strong><p>支持 CSV，单次最多 1000 行。模板包含单位、科室、身份证号、手机号和邮箱；负责 PM 按姓名匹配，专委会可填写名称或编码。会员申请表请在导入后通过编辑会员上传。</p></div>
        <button type="button" className="button secondary" onClick={() => void downloadImportTemplate()}><Download size={16} />下载导入模板</button>
        <Field label="选择 CSV 文件"><Input type="file" accept=".csv,text/csv" onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); importMembers.reset(); }} /></Field>
        {importMembers.data && <div className={`import-result ${importMembers.data.failureCount ? 'has-errors' : ''}`}><strong>共 {importMembers.data.total} 行，成功 {importMembers.data.successCount} 行，失败 {importMembers.data.failureCount} 行</strong>{importMembers.data.errors.length > 0 && <ul>{importMembers.data.errors.slice(0, 100).map((error) => <li key={`${error.row}-${error.message}`}>第 {error.row} 行：{error.message}</li>)}</ul>}</div>}
        {importMembers.error && <p className="form-error">{importMembers.error.message}</p>}
        <div className="form-actions"><button type="button" className="button ghost" onClick={closeImport}>关闭</button><button type="button" className="button primary" disabled={!importFile || importMembers.isPending} onClick={() => importFile && importMembers.mutate(importFile)}>{importMembers.isPending ? '正在导入…' : '开始导入'}</button></div>
      </div>
    </Modal>

    <Modal open={committeeModal || Boolean(editingCommittee)} onClose={() => { setCommitteeModal(false); setEditingCommittee(null); }} title={editingCommittee ? '编辑专委会' : '新增专委会'}>
      <form key={editingCommittee?.id ?? 'new'} className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); saveCommittee.mutate(formObject(event.currentTarget)); }}>
        <Field label="专委会编码"><Input name="committeeCode" required defaultValue={editingCommittee?.committeeCode ?? ''} /></Field><Field label="成立日期"><DateInput name="establishedOn" aria-label="成立日期" required defaultValue={editingCommittee?.establishedOn?.slice(0, 10) ?? ''} /></Field>
        <Field label="专委会名称" span={2}><Input name="name" required defaultValue={editingCommittee?.name ?? ''} /></Field><Field label="负责 PM" span={2}><SearchableSelect name="ownerUserId" ariaLabel="负责 PM" required defaultValue={editingCommittee?.ownerUserId ?? editingCommittee?.owner.id ?? ''} disabled={users.isLoading || users.isError} placeholder="请选择 PM" searchPlaceholder="搜索 PM 姓名" options={(users.data ?? []).map((user) => ({ value: user.id, label: user.displayName, searchText: user.department }))} /></Field>
        {saveCommittee.error && <p className="form-error span-2">{saveCommittee.error.message}</p>}<div className="span-2"><FormActions pending={saveCommittee.isPending} onCancel={() => { setCommitteeModal(false); setEditingCommittee(null); }} submitLabel="保存专委会" /></div>
      </form>
    </Modal>
    <Modal open={Boolean(dueMember)} onClose={() => { setDueMember(null); setEditingDue(null); }} title={editingDue ? '编辑会费应收' : '新增会费应收'} description={dueMember ? `${dueMember.committee?.name ?? '未加入专委会'} · ${dueMember.memberName}` : undefined}>
      <form key={editingDue?.id ?? 'new'} className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const body = formObject(event.currentTarget); if (!body.dueOn) delete body.dueOn; saveDue.mutate(body); }}>
        <Field label="应收编号"><Input name="dueCode" required defaultValue={editingDue?.dueCode ?? ''} /></Field><Field label="缴费期次"><Input name="periodLabel" defaultValue={editingDue?.periodLabel ?? ''} /></Field>
        <Field label="应收金额"><MoneyInput name="amountDue" min="0.01" required defaultValue={editingDue?.amountDue ?? ''} /></Field><Field label="应缴日期"><DateInput name="dueOn" aria-label="应缴日期" defaultValue={editingDue?.dueOn?.slice(0, 10) ?? ''} /></Field>
        {saveDue.error && <p className="form-error span-2">{saveDue.error.message}</p>}<div className="span-2"><FormActions pending={saveDue.isPending} onCancel={() => { setDueMember(null); setEditingDue(null); }} submitLabel="保存会费" /></div>
      </form>
    </Modal>
    <Modal open={Boolean(viewingDues)} onClose={() => setViewingDues(null)} title="会费记录" description={viewingDues ? `${viewingDues.committee?.name ?? '未加入专委会'} · ${viewingDues.memberName} · 共 ${dueHistory.data?.total ?? viewingDues._count?.dues ?? 0} 笔` : undefined} size="wide">
      <div className="due-history">
        <div className="due-history-toolbar"><span>按应缴日期倒序排列</span>{canCreate && <button type="button" className="button primary" onClick={() => { if (!viewingDues) return; setDueMember(viewingDues); setEditingDue(null); setViewingDues(null); }}><Plus size={15} />新增会费</button>}</div>
        {dueHistory.isLoading ? <LoadingState /> : dueHistory.error ? <ErrorState error={dueHistory.error} /> : <>
          <DataTable columns={[
            { key: 'period', label: '缴费期次', render: (due: MemberDue) => <span className="primary-cell"><strong>{due.periodLabel ?? '未填写'}</strong><small className="mono">{due.dueCode}</small></span> },
            { key: 'date', label: '应缴日期', render: (due: MemberDue) => formatDate(due.dueOn) },
            { key: 'amount', label: '应收 / 实收', className: 'number', render: (due: MemberDue) => <span>{formatMoney(due.amountDue)}<small className="block-muted">实收 {formatMoney(due.amountPaid)}</small></span> },
            { key: 'status', label: '状态', render: (due: MemberDue) => <StatusChip value={due.status} /> },
            { key: 'action', label: '操作', render: (due: MemberDue) => canEdit ? <span className="row-actions"><button type="button" className="table-action" onClick={() => { if (!viewingDues) return; setDueMember(viewingDues); setEditingDue(due); setViewingDues(null); }}><Pencil size={14} />编辑</button>{due.status !== 'WAIVED' && <button type="button" className="table-action danger" onClick={() => { setWaivingDue(due); setViewingDues(null); }}><Trash2 size={14} />免除</button>}</span> : null },
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
