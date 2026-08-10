import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { DateInput, Field, FormActions, Input, MoneyInput, SearchableSelect, Select } from '../components/FormControls';
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
import { formatDate, formatMoney } from '../lib/format';
import type { Contract, ListResponse, Organization, Project } from '../lib/types';

export function ContractsPage() {
  const { user } = useAuth();
  const canEdit = hasPermission(user, 'CONTRACTS', 'EDIT');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [contractType, setContractType] = useState<'SUPPORT' | 'EXECUTION'>('SUPPORT');
  const [editing, setEditing] = useState<Contract | null>(null);
  const [voiding, setVoiding] = useState<Contract | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState('');
  const queryClient = useQueryClient();
  const contracts = useQuery({ queryKey: ['contracts', q, page], queryFn: () => api.get<ListResponse<Contract>>(`/contracts${queryString({ q, page, pageSize: DEFAULT_PAGE_SIZE })}`) });
  const projects = useQuery({ queryKey: ['project-options'], queryFn: () => api.get<Pick<Project, 'id' | 'projectCode' | 'name'>[]>('/projects/options') });
  const roleType = contractType === 'SUPPORT' ? 'SUPPORTER' : 'EXECUTOR';
  const organizations = useQuery({ queryKey: ['organization-options', roleType], queryFn: () => api.get<Organization[]>(`/organizations/options?roleType=${roleType}`) });
  const save = useMutation({
    mutationFn: async ({ body, files }: { body: Record<string, string>; files: File[] }) => {
      const contract = editing
        ? await api.patch<Contract>(`/contracts/${editing.id}`, body)
        : await api.post<Contract>('/contracts', body);
      return { failedUploads: await uploadLedgerAttachments('CONTRACT', contract.id, files) };
    },
    onSuccess: ({ failedUploads }) => {
      void queryClient.invalidateQueries({ queryKey: ['contracts'] }); void queryClient.invalidateQueries({ queryKey: ['projects'] });
      setNotice(failedUploads ? `合同已保存，但有 ${failedUploads} 个附件上传失败，请编辑合同后重试。` : '');
      setModal(false); setEditing(null); setAttachmentFiles([]); setContractType('SUPPORT');
    },
  });
  const voidContract = useMutation({
    mutationFn: (id: string) => api.post(`/contracts/${id}/void`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['contracts'] }); void queryClient.invalidateQueries({ queryKey: ['projects'] }); setVoiding(null); },
  });
  const columns: TableColumn<Contract>[] = [
    { key: 'project', label: '关联项目', render: (row) => <span className="primary-cell"><strong>{row.project.name}</strong><small className="mono">{row.project.projectCode}</small></span> },
    { key: 'entity', label: '合同主体', render: (row) => row.contractEntity },
    { key: 'party', label: '签约方', render: (row) => row.counterparty.name },
    { key: 'type', label: '合同类型', render: (row) => <span className="row-actions"><StatusChip value={row.contractType} />{row.status !== 'SIGNED' && <StatusChip value={row.status} />}</span> },
    { key: 'amount', label: '合同金额', className: 'number', render: (row) => formatMoney(row.amount) },
    { key: 'date', label: '签约日期', render: (row) => formatDate(row.signedOn) },
    { key: 'attachments', label: '附件列表', render: (row) => <LedgerAttachmentList objectType="CONTRACT" objectId={row.id} attachments={row.attachments ?? []} /> },
  ];
  if (canEdit) columns.push({ key: 'action', label: '', render: (row) => <span className="row-actions"><button className="table-action" disabled={row.status === 'VOID' || row.status === 'TERMINATED'} onClick={() => { setContractType(row.contractType as 'SUPPORT' | 'EXECUTION'); setAttachmentFiles([]); setNotice(''); setEditing(row); }}><Pencil size={14} />编辑</button>{row.status !== 'VOID' && <button className="table-action danger" onClick={() => setVoiding(row)}><Trash2 size={14} />作废</button>}</span> });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); save.mutate({ body: formObject(event.currentTarget), files: attachmentFiles }); }
  return <div className="page-enter">
    <PageHeader eyebrow="业务台账 / 合同" title="合同台账" description="支持协议计入项目应收，执行协议计入项目应付执行款。" action={(user?.role === 'SYSTEM_ADMIN' || canEdit) ? <div className="button-group">{user?.role === 'SYSTEM_ADMIN' && <LedgerExportButton dataset="contracts" fileName="合同台账" filters={{ q }} />}{canEdit && <button className="button primary" onClick={() => { setContractType('SUPPORT'); setAttachmentFiles([]); setNotice(''); setModal(true); }}><Plus size={17} />登记合同</button>}</div> : undefined} />
    {notice && <div className="operation-banner">{notice}</div>}
    <div className="toolbar"><SearchBar value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="搜索项目、合同主体或签约方" /><span className="result-count">{contracts.data?.total ?? 0} 份合同</span></div>
    <section className="panel table-panel">{contracts.isLoading ? <LoadingState /> : contracts.error ? <ErrorState error={contracts.error} /> : <><DataTable columns={columns} rows={contracts.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={contracts.data?.total ?? 0} onPageChange={setPage} /></>}</section>
    <Modal open={modal || Boolean(editing)} onClose={() => { setModal(false); setEditing(null); setAttachmentFiles([]); }} title={editing ? '编辑合同' : '登记合同'} description={editing ? '修改会保留审计记录并重新计算项目汇总。' : '合同保存为已签署状态后立即进入项目汇总。'} size="large">
      <form className="form-grid" onSubmit={submit} key={editing?.id ?? 'new'}>
        <Field label="关联项目"><SearchableSelect name="projectId" ariaLabel="关联项目" required defaultValue={editing?.projectId ?? editing?.project.id ?? ''} disabled={projects.isLoading || projects.isError} placeholder="请选择项目" searchPlaceholder="搜索项目编码或名称" options={(projects.data ?? []).map((item) => ({ value: item.id, label: `${item.projectCode} · ${item.name}` }))} /></Field>
        <Field label="合同主体"><Input name="contractEntity" required defaultValue={editing?.contractEntity} /></Field>
        <Field label={contractType === 'SUPPORT' ? '支持方' : '执行方'}><SearchableSelect key={`${editing?.id ?? 'new'}-${contractType}`} name="counterpartyId" ariaLabel={contractType === 'SUPPORT' ? '支持方' : '执行方'} required defaultValue={editing?.contractType === contractType ? editing.counterpartyId ?? editing.counterparty.id : ''} disabled={organizations.isLoading || organizations.isError} placeholder={contractType === 'SUPPORT' ? '请选择支持方' : '请选择执行方'} searchPlaceholder={contractType === 'SUPPORT' ? '搜索支持方编号或名称' : '搜索执行方编号或名称'} options={(organizations.data ?? []).map((item) => ({ value: item.id, label: `${item.organizationCode} · ${item.name}` }))} /></Field>
        <Field label="合同类型"><Select name="contractType" value={contractType} onChange={(event) => setContractType(event.target.value as 'SUPPORT' | 'EXECUTION')}><option value="SUPPORT">支持协议</option><option value="EXECUTION">执行协议</option></Select></Field>
        <Field label="合同金额"><MoneyInput name="amount" min="0.01" required defaultValue={editing?.amount} /></Field>
        <Field label="签约日期"><DateInput name="signedOn" aria-label="签约日期" required defaultValue={editing?.signedOn.slice(0, 10) ?? ''} /></Field>
        <Field label="附件列表" span={2} hint="可选；仅支持 PDF，每次添加一份，最多 10 份；单个文件不超过 10MB。"><PdfAttachmentInput files={attachmentFiles} onFilesChange={setAttachmentFiles} existingCount={editing?.attachments?.length ?? 0} />{editing && <LedgerAttachmentList objectType="CONTRACT" objectId={editing.id} attachments={editing.attachments ?? []} canDelete onDeleted={(attachmentId) => { setEditing((current) => current ? { ...current, attachments: current.attachments.filter((item) => item.id !== attachmentId) } : current); void queryClient.invalidateQueries({ queryKey: ['contracts'] }); }} />}</Field>
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={() => { setModal(false); setEditing(null); setAttachmentFiles([]); }} submitLabel={editing ? '保存修改' : `保存${contractType === 'SUPPORT' ? '支持协议' : '执行协议'}`} /></div>
      </form>
    </Modal>
    <ConfirmActionModal open={Boolean(voiding)} onClose={() => setVoiding(null)} title="作废合同" description={voiding ? `“${voiding.project.name}”与“${voiding.counterparty.name}”的${voiding.contractType === 'SUPPORT' ? '支持协议' : '执行协议'}作废后将不再参与项目${voiding.contractType === 'SUPPORT' ? '应收' : '应付执行款'}汇总。` : ''} confirmLabel="确认作废" pending={voidContract.isPending} error={voidContract.error} onConfirm={() => voiding && voidContract.mutate(voiding.id)} />
  </div>;
}
