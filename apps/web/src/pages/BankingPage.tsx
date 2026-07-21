import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranchPlus, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
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
import { formatDate, formatMoney, statusLabels } from '../lib/format';
import type { BankTransaction, Expert, ListResponse, MemberDue, Membership, Project } from '../lib/types';

interface BankAccount { id: string; accountName: string; accountNumberMasked: string; bankName: string }
interface DueOption extends MemberDue { membership: Membership }

export function BankingPage() {
  const [q, setQ] = useState('');
  const [transactionModal, setTransactionModal] = useState(false);
  const [editing, setEditing] = useState<BankTransaction | null>(null);
  const [excluding, setExcluding] = useState<BankTransaction | null>(null);
  const [selected, setSelected] = useState<BankTransaction | null>(null);
  const [category, setCategory] = useState('SUPPORT_RECEIPT');
  const queryClient = useQueryClient();
  const transactions = useQuery({ queryKey: ['banking', q], queryFn: () => api.get<ListResponse<BankTransaction>>(`/banking/transactions${queryString({ q, pageSize: 100 })}`) });
  const accounts = useQuery({ queryKey: ['bank-accounts'], queryFn: () => api.get<BankAccount[]>('/banking/accounts') });
  const projects = useQuery({ queryKey: ['projects-options-list'], queryFn: () => api.get<ListResponse<Project>>('/projects?pageSize=100') });
  const experts = useQuery({ queryKey: ['expert-options'], queryFn: () => api.get<Pick<Expert, 'id' | 'person'>[]>('/experts/options') });
  const dues = useQuery({ queryKey: ['due-options'], queryFn: () => api.get<DueOption[]>('/memberships/dues/options') });
  const save = useMutation({
    mutationFn: (body: Record<string, string>) => editing
      ? api.patch(`/banking/transactions/${editing.id}`, body)
      : api.post('/banking/transactions', { ...body, settlementApplicable: true, sourceType: 'MANUAL' }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['banking'] }); setTransactionModal(false); setEditing(null); },
  });
  const exclude = useMutation({
    mutationFn: (id: string) => api.delete(`/banking/transactions/${id}`),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['banking'] }); setExcluding(null); },
  });
  const allocate = useMutation({
    mutationFn: (body: Record<string, string>) => api.post(`/banking/transactions/${selected?.id}/allocations`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['banking'] }); void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['memberships'] }); setSelected(null);
    },
  });
  const reverse = useMutation({
    mutationFn: (id: string) => api.post(`/banking/allocations/${id}/reverse`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['banking'] });
      void queryClient.invalidateQueries({ queryKey: ['memberships'] });
      setSelected(null);
    },
  });
  const columns: TableColumn<BankTransaction>[] = [
    { key: 'date', label: '交易时间', render: (row) => <span className="small-text">{formatDate(row.transactionAt, true)}<br /><span className="mono">{row.transactionNo ?? '手工录入'}</span></span> },
    { key: 'counterparty', label: '对方账户名称', render: (row) => <span className="primary-cell"><strong>{row.counterpartyName}</strong><small>{row.nature}</small></span> },
    { key: 'direction', label: '收支', render: (row) => <StatusChip value={row.direction} /> },
    { key: 'amount', label: '流水金额', className: 'number', render: (row) => <strong className={row.direction === 'IN' ? 'positive' : 'expense-text'}>{row.direction === 'IN' ? '+' : '−'}{formatMoney(row.amount)}</strong> },
    { key: 'allocation', label: '已关联', render: (row) => row.allocations.some((item) => item.status !== 'REVERSED') ? <span className="allocation-list">{row.allocations.filter((item) => item.status !== 'REVERSED').map((item) => <small key={item.id}>{statusLabels[item.category]} · {item.project?.projectCode ?? item.expertProfile?.person.name ?? '会费'} · {formatMoney(item.allocatedAmount)}</small>)}</span> : <span className="muted">尚未关联</span> },
    { key: 'status', label: '匹配状态', render: (row) => <StatusChip value={row.matchStatus} /> },
    { key: 'action', label: '', render: (row) => {
      const hasAllocation = row.allocations.some((item) => item.status !== 'REVERSED');
      return <span className="row-actions">
        <button className="table-action" onClick={(event) => { event.stopPropagation(); setSelected(row); setCategory(row.direction === 'IN' ? 'SUPPORT_RECEIPT' : 'EXECUTION_PAYMENT'); }} disabled={row.matchStatus === 'MATCHED' || row.matchStatus === 'EXCLUDED'}><GitBranchPlus size={15} />分配</button>
        <button className="table-action" onClick={() => setEditing(row)} disabled={row.sourceType !== 'MANUAL' || !row.settlementApplicable || hasAllocation}><Pencil size={14} />编辑</button>
        {row.settlementApplicable && <button className="table-action danger" onClick={() => setExcluding(row)} disabled={hasAllocation}><Trash2 size={14} />排除</button>}
      </span>;
    } },
  ];

  function submitAllocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = formObject(event.currentTarget);
    Object.keys(body).forEach((key) => { if (!body[key]) delete body[key]; });
    allocate.mutate(body);
  }
  const allocated = selected?.allocations.filter((item) => item.status !== 'REVERSED').reduce((sum, item) => sum + Number(item.allocatedAmount), 0) ?? 0;
  const remaining = Number(selected?.amount ?? 0) - allocated;
  return <div className="page-enter">
    <PageHeader eyebrow="业务台账 / 资金" title="银行日记账" description="原始流水保持不变，通过分配记录连接项目、专家或会员会费。" action={<button className="button primary" onClick={() => setTransactionModal(true)}><Plus size={17} />录入流水</button>} />
    <div className="toolbar"><SearchBar value={q} onChange={setQ} placeholder="搜索流水号、对方、摘要或项目编码" /><span className="result-count">{transactions.data?.total ?? 0} 笔流水</span></div>
    <section className="panel table-panel">{transactions.isLoading ? <LoadingState /> : transactions.error ? <ErrorState error={transactions.error} /> : <DataTable columns={columns} rows={transactions.data?.items ?? []} rowKey={(row) => row.id} />}</section>

    <Modal open={transactionModal || Boolean(editing)} onClose={() => { setTransactionModal(false); setEditing(null); }} title={editing ? '编辑银行流水' : '录入银行流水'} description={editing ? '只有未分配的手工流水可以修改。' : '保存后可继续把金额分配到项目或会费。'} size="large">
      <form key={editing?.id ?? 'new'} className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); save.mutate(formObject(event.currentTarget)); }}>
        <Field label="本方银行账户" span={2}><Select name="bankAccountId" required defaultValue={editing?.bankAccountId ?? ''}><option value="">请选择</option>{accounts.data?.map((item) => <option key={item.id} value={item.id}>{item.accountName} · {item.accountNumberMasked}</option>)}</Select></Field>
        <Field label="银行流水号"><Input name="transactionNo" defaultValue={editing?.transactionNo ?? ''} /></Field><Field label="交易时间"><Input name="transactionAt" type="datetime-local" required defaultValue={editing ? toLocalDateTime(editing.transactionAt) : ''} /></Field>
        <Field label="对方账户名称"><Input name="counterpartyName" required defaultValue={editing?.counterpartyName ?? ''} /></Field><Field label="收支方向"><Select name="direction" defaultValue={editing?.direction ?? 'IN'}><option value="IN">收入</option><option value="OUT">支出</option></Select></Field>
        <Field label="金额"><MoneyInput name="amount" min="0.01" required defaultValue={editing?.amount ?? ''} /></Field><Field label="摘要 / 性质"><Input name="nature" required defaultValue={editing?.nature ?? ''} /></Field>
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={() => { setTransactionModal(false); setEditing(null); }} submitLabel="保存流水" /></div>
      </form>
    </Modal>

    <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="分配流水" description="一笔流水可以分配给多个项目；分配总额不能超过流水金额。" size="large">
      {selected && <>
        <div className="allocation-summary"><span><small>流水金额</small><strong>{formatMoney(selected.amount)}</strong></span><i /><span><small>已分配</small><strong>{formatMoney(allocated)}</strong></span><i /><span className="remaining"><small>本次可分配</small><strong>{formatMoney(remaining)}</strong></span></div>
        {selected.allocations.some((item) => item.status !== 'REVERSED') && <div className="allocation-list allocation-editor">{selected.allocations.filter((item) => item.status !== 'REVERSED').map((item) => <span key={item.id}><small>{statusLabels[item.category]} · {item.project?.projectCode ?? item.expertProfile?.person.name ?? '会费'} · {formatMoney(item.allocatedAmount)}</small><button className="table-action danger" type="button" disabled={reverse.isPending} onClick={() => reverse.mutate(item.id)}><RotateCcw size={13} />撤销分配</button></span>)}</div>}
        <form className="form-grid" onSubmit={submitAllocation}>
          <Field label="资金分类"><Select name="category" value={category} onChange={(event) => setCategory(event.target.value)}>{selected.direction === 'IN' ? <><option value="SUPPORT_RECEIPT">支持款收入</option><option value="MEMBER_DUE">会员会费</option><option value="OTHER">其他收入</option></> : <><option value="EXECUTION_PAYMENT">执行款支出</option><option value="EXPERT_FEE">专家费支出</option><option value="OTHER">其他支出</option></>}</Select></Field>
          <Field label="分配金额"><MoneyInput name="allocatedAmount" min="0.01" max={remaining} required defaultValue={remaining.toFixed(2)} /></Field>
          {['SUPPORT_RECEIPT', 'EXECUTION_PAYMENT', 'EXPERT_FEE'].includes(category) && <Field label="关联项目" span={2}><Select name="projectId" required><option value="">请选择项目</option>{projects.data?.items.map((item) => <option key={item.id} value={item.id}>{item.projectCode} · {item.name}</option>)}</Select></Field>}
          {category === 'EXPERT_FEE' && <Field label="关联专家" span={2}><Select name="expertProfileId" required><option value="">请选择专家</option>{experts.data?.map((item) => <option key={item.id} value={item.id}>{item.person.name} · {item.person.organizationName}</option>)}</Select></Field>}
          {category === 'MEMBER_DUE' && <Field label="关联会费" span={2}><Select name="memberDueId" required><option value="">请选择会费应收</option>{dues.data?.map((item) => <option key={item.id} value={item.id}>{item.membership.committee.name} · {item.membership.memberName} · {item.periodLabel ?? item.dueCode}</option>)}</Select></Field>}
          {allocate.error && <p className="form-error span-2">{allocate.error.message}</p>}
          <div className="span-2"><FormActions pending={allocate.isPending} onCancel={() => setSelected(null)} submitLabel="确认分配" /></div>
        </form>
      </>}
    </Modal>
    <ConfirmActionModal open={Boolean(excluding)} onClose={() => setExcluding(null)} onConfirm={() => excluding && exclude.mutate(excluding.id)} pending={exclude.isPending} title="排除银行流水" description={excluding ? `确认排除 ${excluding.counterpartyName} 的 ${formatMoney(excluding.amount)} 流水？排除后不再参与结算。` : ''} confirmLabel="确认排除" error={exclude.error} />
  </div>;
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
