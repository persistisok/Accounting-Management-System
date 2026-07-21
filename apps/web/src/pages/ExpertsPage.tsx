import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldCheck } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { Field, FormActions, Input } from '../components/FormControls';
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
  const queryClient = useQueryClient();
  const experts = useQuery({ queryKey: ['experts', q], queryFn: () => api.get<ListResponse<Expert>>(`/experts${queryString({ q, pageSize: 100 })}`) });
  const create = useMutation({
    mutationFn: (body: Record<string, string>) => api.post('/experts', body),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['experts'] }); setModal(false); },
  });
  const columns: TableColumn<Expert>[] = [
    { key: 'name', label: '专家', render: (row) => <span className="primary-cell"><strong>{row.person.name}</strong><small>{row.professionalTitle ?? '未填写职称'}</small></span> },
    { key: 'org', label: '单位 / 科室', render: (row) => <span>{row.person.organizationName ?? '—'}<small className="block-muted">{row.person.department}</small></span> },
    { key: 'phone', label: '手机', render: (row) => <span className="mono">{row.person.phoneMasked ?? '—'}</span> },
    { key: 'id', label: '身份证号码', render: (row) => <span className="mono sensitive-value">{row.person.idNumberMasked ?? '—'}</span> },
    { key: 'bank', label: '收款账户', render: (row) => <span>{row.bankName ?? '—'}<small className="block-muted mono">{row.bankAccountMasked}</small></span> },
    { key: 'joined', label: '入库时间', render: (row) => formatDate(row.joinedOn) },
    { key: 'owner', label: '填表人', render: (row) => row.formOwner.displayName },
    { key: 'status', label: '复核状态', render: (row) => <StatusChip value={row.reviewStatus} /> },
  ];
  return <div className="page-enter">
    <PageHeader eyebrow="基础资料 / 专家" title="专家库" description="证件号和银行卡号加密存储，列表仅显示脱敏值。" action={<button className="button primary" onClick={() => setModal(true)}><Plus size={17} />新增专家</button>} />
    <div className="privacy-banner"><ShieldCheck size={18} /><span><strong>敏感信息保护已启用</strong> 明文查看和导出将单独授权并写入审计日志。</span></div>
    <div className="toolbar"><SearchBar value={q} onChange={setQ} placeholder="搜索专家姓名、单位或科室" /><span className="result-count">{experts.data?.total ?? 0} 位专家</span></div>
    <section className="panel table-panel">{experts.isLoading ? <LoadingState /> : experts.error ? <ErrorState error={experts.error} /> : <DataTable columns={columns} rows={experts.data?.items ?? []} rowKey={(row) => row.id} />}</section>
    <Modal open={modal} onClose={() => setModal(false)} title="新增专家" description="身份证号用于查重，保存后默认进入待复核状态。" size="large">
      <form className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); create.mutate(formObject(event.currentTarget)); }}>
        <Field label="姓名"><Input name="name" required /></Field><Field label="职称"><Input name="professionalTitle" /></Field>
        <Field label="手机"><Input name="phone" /></Field><Field label="身份证号码"><Input name="idNumber" /></Field>
        <Field label="单位"><Input name="organizationName" /></Field><Field label="专业 / 科室"><Input name="department" /></Field>
        <Field label="职务"><Input name="position" /></Field><Field label="邮箱"><Input name="email" type="email" /></Field>
        <Field label="开户行"><Input name="bankName" /></Field><Field label="银行账号"><Input name="bankAccount" /></Field>
        <Field label="入库日期"><Input name="joinedOn" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
        {create.error && <p className="form-error span-2">{create.error.message}</p>}
        <div className="span-2"><FormActions pending={create.isPending} onCancel={() => setModal(false)} /></div>
      </form>
    </Modal>
  </div>;
}
