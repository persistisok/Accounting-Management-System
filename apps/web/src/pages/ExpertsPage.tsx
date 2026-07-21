import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { Field, FormActions, Input, Select } from '../components/FormControls';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { SearchBar } from '../components/SearchBar';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { api, queryString } from '../lib/api';
import { formObject } from '../lib/form';
import { formatDate } from '../lib/format';
import type { Expert, ListResponse } from '../lib/types';

export function ExpertsPage() {
  const [q, setQ] = useState(''); const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Expert | null>(null);
  const [deactivating, setDeactivating] = useState<Expert | null>(null);
  const queryClient = useQueryClient();
  const experts = useQuery({ queryKey: ['experts', q], queryFn: () => api.get<ListResponse<Expert>>(`/experts${queryString({ q, pageSize: 100 })}`) });
  const save = useMutation({
    mutationFn: (body: Record<string, string>) => editing ? api.patch(`/experts/${editing.id}`, body) : api.post('/experts', body),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['experts'] }); setModal(false); setEditing(null); },
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/experts/${id}`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['experts'] }); setDeactivating(null); },
  });
  const columns: TableColumn<Expert>[] = [
    { key: 'name', label: '专家', render: (row) => <span className="primary-cell"><strong>{row.person.name}</strong><small>{row.professionalTitle ?? '未填写职称'}</small></span> },
    { key: 'org', label: '单位 / 科室', render: (row) => <span>{row.person.organizationName ?? '—'}<small className="block-muted">{row.person.department}</small></span> },
    { key: 'phone', label: '手机', render: (row) => <span className="mono">{row.person.phoneMasked ?? '—'}</span> },
    { key: 'id', label: '身份证号码', render: (row) => <span className="mono sensitive-value">{row.person.idNumberMasked ?? '—'}</span> },
    { key: 'bank', label: '收款账户', render: (row) => <span>{row.bankName ?? '—'}<small className="block-muted mono">{row.bankAccountMasked}</small></span> },
    { key: 'joined', label: '入库时间', render: (row) => formatDate(row.joinedOn) },
    { key: 'owner', label: '填表人', render: (row) => row.formOwner.displayName },
    { key: 'status', label: '状态', render: (row) => <span className="row-actions"><StatusChip value={row.reviewStatus} /><StatusChip value={row.status} /></span> },
    { key: 'action', label: '', render: (row) => <span className="row-actions"><button className="table-action" onClick={() => setEditing(row)}><Pencil size={14} />编辑</button>{row.status === 'ACTIVE' && <button className="table-action danger" onClick={() => setDeactivating(row)}><Trash2 size={14} />停用</button>}</span> },
  ];
  return <div className="page-enter">
    <PageHeader eyebrow="基础资料 / 专家" title="专家库" description="证件号和银行卡号加密存储，列表仅显示脱敏值。" action={<button className="button primary" onClick={() => setModal(true)}><Plus size={17} />新增专家</button>} />
    <div className="privacy-banner"><ShieldCheck size={18} /><span><strong>敏感信息保护已启用</strong> 明文查看和导出将单独授权并写入审计日志。</span></div>
    <div className="toolbar"><SearchBar value={q} onChange={setQ} placeholder="搜索专家姓名、单位或科室" /><span className="result-count">{experts.data?.total ?? 0} 位专家</span></div>
    <section className="panel table-panel">{experts.isLoading ? <LoadingState /> : experts.error ? <ErrorState error={experts.error} /> : <DataTable columns={columns} rows={experts.data?.items ?? []} rowKey={(row) => row.id} />}</section>
    <Modal open={modal || Boolean(editing)} onClose={() => { setModal(false); setEditing(null); }} title={editing ? '编辑专家' : '新增专家'} description={editing ? '手机、证件号和银行账号留空时保留原值。' : '身份证号用于查重，保存后默认进入待复核状态。'} size="large">
      <form key={editing?.id ?? 'new'} className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const body = formObject(event.currentTarget); ['phone', 'idNumber', 'email', 'bankAccount'].forEach((key) => { if (!body[key]) delete body[key]; }); save.mutate(body); }}>
        <Field label="姓名"><Input name="name" required defaultValue={editing?.person.name ?? ''} /></Field><Field label="职称"><Input name="professionalTitle" defaultValue={editing?.professionalTitle ?? ''} /></Field>
        <Field label="手机"><Input name="phone" /></Field><Field label="身份证号码"><Input name="idNumber" /></Field>
        <Field label="单位"><Input name="organizationName" defaultValue={editing?.person.organizationName ?? ''} /></Field><Field label="专业 / 科室"><Input name="department" defaultValue={editing?.person.department ?? ''} /></Field>
        <Field label="职务"><Input name="position" defaultValue={editing?.person.position ?? ''} /></Field><Field label="邮箱"><Input name="email" type="email" defaultValue={editing?.person.email ?? ''} /></Field>
        <Field label="开户行"><Input name="bankName" defaultValue={editing?.bankName ?? ''} /></Field><Field label="银行账号"><Input name="bankAccount" /></Field>
        <Field label="入库日期"><Input name="joinedOn" type="date" defaultValue={editing?.joinedOn?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)} /></Field>
        {editing && <Field label="资料状态"><Select name="status" defaultValue={editing.status}><option value="ACTIVE">启用</option><option value="INACTIVE">停用</option></Select></Field>}
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={() => { setModal(false); setEditing(null); }} submitLabel="保存" /></div>
      </form>
    </Modal>
    <ConfirmActionModal open={Boolean(deactivating)} onClose={() => setDeactivating(null)} onConfirm={() => deactivating && deactivate.mutate(deactivating.id)} pending={deactivate.isPending} title="停用专家" description={deactivating ? `确认停用“${deactivating.person.name}”？历史费用记录将保留。` : ''} confirmLabel="确认停用" error={deactivate.error} />
  </div>;
}
