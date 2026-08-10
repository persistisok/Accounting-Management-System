import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Landmark, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { DateInput, Field, FormActions, Input, MoneyInput, SearchableSelect, Select } from '../components/FormControls';
import { LedgerAttachmentList, PdfAttachmentInput, uploadLedgerAttachments } from '../components/LedgerAttachments';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { LedgerExportButton } from '../components/LedgerExportButton';
import { DEFAULT_PAGE_SIZE, Pagination } from '../components/Pagination';
import { SearchBar } from '../components/SearchBar';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { api, queryString } from '../lib/api';
import { useAuth } from '../lib/auth';
import { hasPermission } from '../lib/permissions';
import { formObject } from '../lib/form';
import { formatDate, formatMoney, statusLabels } from '../lib/format';
import type { BankAllocation, BankTransaction, ListResponse, Project } from '../lib/types';

interface BankAccount {
  id: string;
  bankName: string;
  accountNumberMasked: string;
  status?: string;
  _count?: { transactions: number };
}
interface ExpertOption { id: string; person: { name: string; organizationName?: string } }
interface ExpertPaymentDetails { name: string; bankName: string; bankAccount: string }
interface MemberPaymentOption {
  id: string;
  memberName: string;
  committee: { committeeCode: string; name: string };
  outstandingAmount: string;
  dueCount: number;
}
interface BankingImportResult {
  total: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ row: number; message: string }>;
  expertReport?: { fileName: string; contentBase64: string; rowCount: number };
}
type FundingCategory = 'SUPPORT_RECEIPT' | 'MEMBER_DUE' | 'EXECUTION_PAYMENT' | 'EXPERT_FEE';
type AccountEditor = BankAccount | 'new' | null;

export function BankingPage() {
  const { user } = useAuth();
  const canEdit = hasPermission(user, 'BANKING', 'EDIT');
  const canManageBankAccounts = canEdit && user?.role !== 'PM';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [transactionModal, setTransactionModal] = useState(false);
  const [editing, setEditing] = useState<BankTransaction | null>(null);
  const [excluding, setExcluding] = useState<BankTransaction | null>(null);
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [category, setCategory] = useState<FundingCategory>('SUPPORT_RECEIPT');
  const [expertId, setExpertId] = useState('');
  const [membershipId, setMembershipId] = useState('');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [counterpartyBankName, setCounterpartyBankName] = useState('');
  const [counterpartyAccountNumber, setCounterpartyAccountNumber] = useState('');
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<BankingImportResult | null>(null);
  const [accountManager, setAccountManager] = useState(false);
  const [accountQ, setAccountQ] = useState('');
  const [accountPage, setAccountPage] = useState(1);
  const [accountEditor, setAccountEditor] = useState<AccountEditor>(null);
  const [deletingAccount, setDeletingAccount] = useState<BankAccount | null>(null);
  const queryClient = useQueryClient();
  const transactions = useQuery({ queryKey: ['banking', q, page], queryFn: () => api.get<ListResponse<BankTransaction>>(`/banking/transactions${queryString({ q, page, pageSize: DEFAULT_PAGE_SIZE })}`) });
  const accounts = useQuery({ queryKey: ['bank-account-options'], queryFn: () => api.get<BankAccount[]>('/banking/accounts/options') });
  const accountList = useQuery({
    queryKey: ['bank-accounts', accountQ, accountPage],
    queryFn: () => api.get<ListResponse<BankAccount>>(`/banking/accounts${queryString({ q: accountQ, page: accountPage, pageSize: 10 })}`),
    enabled: accountManager,
  });
  const projects = useQuery({ queryKey: ['project-options'], queryFn: () => api.get<Pick<Project, 'id' | 'projectCode' | 'name'>[]>('/projects/options') });
  const experts = useQuery({ queryKey: ['expert-options'], queryFn: () => api.get<ExpertOption[]>('/experts/options') });
  const members = useQuery({ queryKey: ['member-payment-options'], queryFn: () => api.get<MemberPaymentOption[]>('/memberships/payments/options') });
  const expertPaymentDetails = useMutation({
    mutationFn: (id: string) => api.get<ExpertPaymentDetails>(`/experts/${id}/payment-details`),
    onSuccess: (details) => {
      setCounterpartyName(details.name);
      setCounterpartyBankName(details.bankName);
      setCounterpartyAccountNumber(details.bankAccount);
    },
  });
  const save = useMutation({
    mutationFn: async ({ body, files }: { body: Record<string, string>; files: File[] }) => {
      const transaction = editing
        ? await api.patch<BankTransaction>(`/banking/transactions/${editing.id}`, body)
        : await api.post<BankTransaction>('/banking/transactions', body);
      return { failedUploads: await uploadLedgerAttachments('BANK_TRANSACTION', transaction.id, files) };
    },
    onSuccess: ({ failedUploads }) => {
      void queryClient.invalidateQueries({ queryKey: ['banking'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['memberships'] });
      void queryClient.invalidateQueries({ queryKey: ['member-dues'] });
      void queryClient.invalidateQueries({ queryKey: ['member-payment-options'] });
      setNotice(failedUploads ? `银行流水已保存，但有 ${failedUploads} 个附件上传失败，请编辑流水后重试。` : '');
      setTransactionModal(false);
      setEditing(null);
      setAttachmentFiles([]);
    },
  });
  const exclude = useMutation({
    mutationFn: (id: string) => api.delete(`/banking/transactions/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['banking'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['memberships'] });
      setExcluding(null);
    },
  });
  const saveAccount = useMutation({
    mutationFn: (body: Record<string, string>) => accountEditor && accountEditor !== 'new'
      ? api.patch<BankAccount>(`/banking/accounts/${accountEditor.id}`, body)
      : api.post<BankAccount>('/banking/accounts', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['bank-account-options'] });
      setAccountEditor(null);
      setAccountManager(true);
    },
  });
  const removeAccount = useMutation({
    mutationFn: (id: string) => api.delete<BankAccount>(`/banking/accounts/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['bank-account-options'] });
      setDeletingAccount(null);
      setAccountManager(true);
    },
  });
  const downloadTemplate = useMutation({
    mutationFn: () => api.download('/banking/transactions/import-template'),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '银行日记账导入模板.csv';
      link.click();
      URL.revokeObjectURL(url);
    },
  });
  const importTransactions = useMutation({
    mutationFn: (file: File) => api.upload<BankingImportResult>('/banking/transactions/import', file),
    onSuccess: (result) => {
      setImportResult(result);
      if (result.expertReport) downloadBase64Csv(result.expertReport);
      void queryClient.invalidateQueries({ queryKey: ['banking'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['memberships'] });
      void queryClient.invalidateQueries({ queryKey: ['member-payment-options'] });
    },
  });
  const columns: TableColumn<BankTransaction>[] = [
    { key: 'date', label: '交易日期', render: (row) => <span className="small-text">{formatDate(row.transactionAt)}<br /><span className="mono">{row.bankAccount.bankName}</span></span> },
    { key: 'counterparty', label: '对方账户', render: (row) => <span className="primary-cell"><strong>{row.counterpartyName}</strong><small>{row.counterpartyBankName ?? '未登记银行'} · {row.counterpartyAccountMasked ?? '未登记账号'}</small><small>{row.nature}</small></span> },
    { key: 'direction', label: '收支', render: (row) => <StatusChip value={row.direction} /> },
    { key: 'amount', label: '流水金额', className: 'number', render: (row) => <strong className={row.direction === 'IN' ? 'positive' : 'expense-text'}>{row.direction === 'IN' ? '+' : '−'}{formatMoney(row.amount)}</strong> },
    { key: 'allocation', label: '关联对象 / 资金分类', render: (row) => row.allocations.some((item) => item.status === 'CONFIRMED') ? <span className="allocation-list">{row.allocations.filter((item) => item.status === 'CONFIRMED').map((item) => <small key={item.id}>{allocationSubject(item)} · {statusLabels[item.category] ?? item.category}</small>)}</span> : <span className="muted">尚未归类</span> },
    { key: 'attachments', label: '附件列表', render: (row) => <LedgerAttachmentList objectType="BANK_TRANSACTION" objectId={row.id} attachments={row.attachments ?? []} /> },
    { key: 'status', label: '匹配状态', render: (row) => <StatusChip value={row.matchStatus} /> },
  ];
  if (canEdit) columns.push({ key: 'action', label: '', render: (row) => {
      return <span className="row-actions">
        <button className="table-action" onClick={() => {
          const allocation = row.allocations.find((item) => item.status === 'CONFIRMED');
          setDirection(row.direction);
          setCategory((allocation?.category as FundingCategory | undefined) ?? (row.direction === 'IN' ? 'SUPPORT_RECEIPT' : 'EXECUTION_PAYMENT'));
          setExpertId(allocation?.expertProfile?.id ?? '');
          setMembershipId(allocation?.memberDue?.membership.id ?? '');
          setCounterpartyName(row.counterpartyName);
          setCounterpartyBankName(row.counterpartyBankName ?? '');
          setCounterpartyAccountNumber('');
          setAttachmentFiles([]);
          setNotice('');
          setEditing(row);
        }} disabled={!row.settlementApplicable}><Pencil size={14} />编辑</button>
        {row.settlementApplicable && <button className="table-action danger" onClick={() => setExcluding(row)}><Trash2 size={14} />作废</button>}
      </span>;
    } });
  const accountColumns: TableColumn<BankAccount>[] = [
    { key: 'bank', label: '银行名称', render: (row) => <strong className="key-cell">{row.bankName}</strong> },
    { key: 'number', label: '银行账号', render: (row) => <span className="mono sensitive-value">{row.accountNumberMasked}</span> },
    { key: 'transactions', label: '关联流水', className: 'number', render: (row) => <strong>{row._count?.transactions ?? 0}</strong> },
    { key: 'status', label: '状态', render: (row) => <span className={`status-chip ${row.status === 'INACTIVE' ? 'neutral' : 'good'}`}>{row.status === 'INACTIVE' ? '已停用' : '启用'}</span> },
    { key: 'action', label: '', render: (row) => <span className="row-actions"><button type="button" className="table-action" onClick={() => { setAccountEditor(row); setAccountManager(false); }}><Pencil size={14} />编辑</button>{row.status === 'ACTIVE' && <button type="button" className="table-action danger" onClick={() => { setDeletingAccount(row); setAccountManager(false); }}><Trash2 size={14} />停用</button>}</span> },
  ];

  function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = formObject(event.currentTarget);
    body.transactionAt = body.transactionDate ?? '';
    delete body.transactionDate;
    if (!body.counterpartyAccountNumber) delete body.counterpartyAccountNumber;
    save.mutate({ body, files: attachmentFiles });
  }
  function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = formObject(event.currentTarget);
    if (!body.accountNumber) delete body.accountNumber;
    saveAccount.mutate(body);
  }
  function openNewTransaction() {
    setDirection('IN');
    setCategory('SUPPORT_RECEIPT');
    setExpertId('');
    setMembershipId('');
    setCounterpartyName('');
    setCounterpartyBankName('');
    setCounterpartyAccountNumber('');
    setAttachmentFiles([]);
    setNotice('');
    expertPaymentDetails.reset();
    setTransactionModal(true);
  }
  const localTransactionAt = editing?.transactionAt.slice(0, 10) ?? '';
  const editingAllocation = editing?.allocations.find((item) => item.status === 'CONFIRMED');
  const editingAccount = accountEditor && accountEditor !== 'new' ? accountEditor : null;
  const memberPaymentOptions = (members.data ?? []).filter((item) => Number(item.outstandingAmount) > 0 || item.id === membershipId);
  return <div className="page-enter">
    <PageHeader eyebrow="业务台账 / 资金" title="银行日记账" description="按资金分类关联项目、专家或会员，保存后同步更新业务台账。" action={(user?.role === 'SYSTEM_ADMIN' || canEdit) ? <div className="button-group">{user?.role === 'SYSTEM_ADMIN' && <LedgerExportButton dataset="banking" fileName="银行日记账" filters={{ q }} sensitive />}{canManageBankAccounts && <button className="button secondary" onClick={() => setAccountManager(true)}><Landmark size={16} />本方账户管理</button>}{canEdit && <button className="button secondary" onClick={() => { setImportFile(null); setImportResult(null); importTransactions.reset(); setImportOpen(true); }}><Upload size={16} />模板导入</button>}{canEdit && <button className="button primary" onClick={openNewTransaction}><Plus size={17} />录入流水</button>}</div> : undefined} />
    {notice && <div className="operation-banner">{notice}</div>}
    <div className="toolbar"><SearchBar value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="搜索对方账户、银行、性质或项目编码" /><span className="result-count">{transactions.data?.total ?? 0} 笔流水</span></div>
    <section className="panel table-panel">{transactions.isLoading ? <LoadingState /> : transactions.error ? <ErrorState error={transactions.error} /> : <><DataTable columns={columns} rows={transactions.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={transactions.data?.total ?? 0} onPageChange={setPage} /></>}</section>

    <Modal open={transactionModal || Boolean(editing)} onClose={() => { setTransactionModal(false); setEditing(null); setAttachmentFiles([]); expertPaymentDetails.reset(); }} title={editing ? '编辑银行流水' : '录入银行流水'} description="先选择收支方向和资金分类，再填写对应业务信息。" size="large">
      <form key={editing?.id ?? 'new'} className="form-grid" onSubmit={submitTransaction}>
        <Field label="收支方向"><Select name="direction" value={direction} onChange={(event) => { const value = event.target.value as 'IN' | 'OUT'; setDirection(value); setCategory(value === 'IN' ? 'SUPPORT_RECEIPT' : 'EXECUTION_PAYMENT'); setExpertId(''); setMembershipId(''); setCounterpartyName(''); setCounterpartyBankName(''); setCounterpartyAccountNumber(''); expertPaymentDetails.reset(); }}><option value="IN">收入</option><option value="OUT">支出</option></Select></Field>
        <Field label="资金分类"><Select name="category" value={category} onChange={(event) => { const value = event.target.value as FundingCategory; setCategory(value); if (value !== 'EXPERT_FEE') setExpertId(''); if (value !== 'MEMBER_DUE') setMembershipId(''); setCounterpartyName(''); setCounterpartyBankName(''); setCounterpartyAccountNumber(''); expertPaymentDetails.reset(); }}>{direction === 'IN' ? <><option value="SUPPORT_RECEIPT">支持款收入</option><option value="MEMBER_DUE">会员会费收入</option></> : <><option value="EXECUTION_PAYMENT">执行款支出</option><option value="EXPERT_FEE">专家费支出</option></>}</Select></Field>
        {category !== 'MEMBER_DUE' && <Field label="关联项目" span={category === 'EXPERT_FEE' ? 1 : 2}><SearchableSelect name="projectId" ariaLabel="关联项目" required defaultValue={editingAllocation?.project?.id ?? ''} disabled={projects.isLoading || projects.isError} placeholder="请选择关联项目" searchPlaceholder="搜索项目编码或名称" options={(projects.data ?? []).map((item) => ({ value: item.id, label: `${item.projectCode} · ${item.name}` }))} /></Field>}
        {category === 'EXPERT_FEE' && <Field label="专家"><SearchableSelect name="expertProfileId" ariaLabel="专家" required defaultValue={expertId} disabled={experts.isLoading || experts.isError || expertPaymentDetails.isPending} placeholder="请选择专家" searchPlaceholder="搜索专家姓名或单位" options={(experts.data ?? []).map((item) => ({ value: item.id, label: item.person.name, searchText: item.person.organizationName }))} onValueChange={(value) => { setExpertId(value); if (value) expertPaymentDetails.mutate(value); else { setCounterpartyName(''); setCounterpartyBankName(''); setCounterpartyAccountNumber(''); } }} /></Field>}
        {category === 'MEMBER_DUE' && <Field label="会员" span={2} hint="会费将按应缴日期从早到晚自动冲抵"><SearchableSelect name="membershipId" ariaLabel="会员" required defaultValue={membershipId} disabled={members.isLoading || members.isError} placeholder="请选择有未缴会费的会员" searchPlaceholder="搜索会员、专委会或编码" options={memberPaymentOptions.map((item) => ({ value: item.id, label: `${item.memberName} · 未缴 ${formatMoney(item.outstandingAmount)}`, searchText: `${item.committee.committeeCode} ${item.committee.name}` }))} onValueChange={(value) => { setMembershipId(value); const member = members.data?.find((item) => item.id === value); if (member) setCounterpartyName(member.memberName); }} /></Field>}
        <Field label="本方银行账户" span={2}><SearchableSelect name="bankAccountId" ariaLabel="本方银行账户" required defaultValue={editing?.bankAccountId ?? ''} disabled={accounts.isLoading || accounts.isError} placeholder="请选择本方银行账户" searchPlaceholder="搜索银行名称或账号尾号" options={(accounts.data ?? []).map((item) => ({ value: item.id, label: `${item.bankName} · ${item.accountNumberMasked}` }))} /></Field>
        <div className="form-section-label span-2"><span>对方账户</span><small>以下信息用于识别本笔流水的交易对方</small></div>
        <Field label="对方账户名称" span={2}><Input name="counterpartyName" required value={counterpartyName} onChange={(event) => setCounterpartyName(event.target.value)} /></Field>
        <Field label="银行名称"><Input name="counterpartyBankName" required value={counterpartyBankName} onChange={(event) => setCounterpartyBankName(event.target.value)} /></Field>
        <Field label="银行账号" hint={editing && !counterpartyAccountNumber ? `留空保留原账号 ${editing.counterpartyAccountMasked ?? ''}` : undefined}><Input name="counterpartyAccountNumber" required={!editing} autoComplete="off" value={counterpartyAccountNumber} onChange={(event) => setCounterpartyAccountNumber(event.target.value)} /></Field>
        <div className="form-section-divider span-2" aria-hidden="true" />
        <Field label="交易日期" span={2}><DateInput name="transactionDate" aria-label="交易日期" required defaultValue={localTransactionAt} /></Field>
        <Field label="金额"><MoneyInput name="amount" min="0.01" required defaultValue={editing?.amount ?? ''} /></Field><Field label="性质"><Input name="nature" required defaultValue={editing?.nature ?? ''} /></Field>
        <Field label="附件列表" span={2} hint="可选；仅支持 PDF，每次添加一份，最多 10 份；单个文件不超过 10MB。"><PdfAttachmentInput files={attachmentFiles} onFilesChange={setAttachmentFiles} existingCount={editing?.attachments?.length ?? 0} />{editing && <LedgerAttachmentList objectType="BANK_TRANSACTION" objectId={editing.id} attachments={editing.attachments ?? []} canDelete onDeleted={(attachmentId) => { setEditing((current) => current ? { ...current, attachments: current.attachments.filter((item) => item.id !== attachmentId) } : current); void queryClient.invalidateQueries({ queryKey: ['banking'] }); }} />}</Field>
        {expertPaymentDetails.error && <p className="form-error span-2">专家银行信息读取失败：{expertPaymentDetails.error.message}，请手工填写。</p>}
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={() => { setTransactionModal(false); setEditing(null); setAttachmentFiles([]); }} submitLabel="保存流水" /></div>
      </form>
    </Modal>

    <Modal open={importOpen} onClose={() => setImportOpen(false)} title="模板导入银行流水" description="下载模板后使用 Excel 填写，并保持 CSV 格式上传。" size="wide">
      <div className="import-panel">
        <div className="import-instructions">
          <p>交易日期填写“年/月/日”。资金分类仅支持：支持款收入、会员会费收入、执行款支出、专家费支出。</p>
          <p>项目使用项目编码匹配；专家费只需填写专家姓名和专家身份证号，对方账户、开户行及银行卡号会从专家库自动带入；会员会费填写专委会编码和会员姓名。单次最多 1000 行。</p>
        </div>
        <button type="button" className="button secondary" disabled={downloadTemplate.isPending} onClick={() => downloadTemplate.mutate()}><Download size={16} />下载导入模板</button>
        <Field label="选择填写后的 CSV 文件" hint="文件不超过 2MB"><Input type="file" accept=".csv,text/csv" onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); setImportResult(null); importTransactions.reset(); }} /></Field>
        {downloadTemplate.error && <p className="form-error">模板下载失败：{downloadTemplate.error.message}</p>}
        {importTransactions.error && <p className="form-error">导入失败：{importTransactions.error.message}</p>}
        {importResult && <div className={`import-result ${importResult.failureCount ? 'has-errors' : ''}`}><strong>共 {importResult.total} 行，成功 {importResult.successCount} 行，失败 {importResult.failureCount} 行</strong>{importResult.errors.length > 0 && <ul>{importResult.errors.map((error) => <li key={`${error.row}-${error.message}`}>第 {error.row} 行：{error.message}</li>)}</ul>}{importResult.expertReport && <p><button type="button" className="button secondary" onClick={() => downloadBase64Csv(importResult.expertReport!)}><Download size={15} />下载专家费匹配与个税表（{importResult.expertReport.rowCount} 行）</button></p>}</div>}
        <div className="form-actions"><button type="button" className="button ghost" onClick={() => setImportOpen(false)}>关闭</button><button type="button" className="button primary" disabled={!importFile || importTransactions.isPending} onClick={() => importFile && importTransactions.mutate(importFile)}>{importTransactions.isPending ? '正在导入…' : '开始导入'}</button></div>
      </div>
    </Modal>

    <Modal open={accountManager} onClose={() => setAccountManager(false)} title="本方银行账户" description="账户由银行名称和银行账号组成；列表仅显示脱敏账号。" size="wide">
      <div className="account-management">
        <div className="account-management-toolbar"><SearchBar value={accountQ} onChange={(value) => { setAccountQ(value); setAccountPage(1); }} placeholder="搜索银行名称或账号尾号" /><button type="button" className="button primary" onClick={() => { setAccountEditor('new'); setAccountManager(false); }}><Plus size={15} />新增账户</button></div>
        {accountList.isLoading ? <LoadingState /> : accountList.error ? <ErrorState error={accountList.error} /> : <>
          <DataTable columns={accountColumns} rows={accountList.data?.items ?? []} rowKey={(row) => row.id} />
          <Pagination page={accountPage} pageSize={10} total={accountList.data?.total ?? 0} onPageChange={setAccountPage} />
        </>}
      </div>
    </Modal>

    <Modal open={Boolean(accountEditor)} onClose={() => { setAccountEditor(null); setAccountManager(true); }} title={editingAccount ? '编辑本方银行账户' : '新增本方银行账户'} description={editingAccount ? '银行账号留空时保留原账号；修改会记录审计日志。' : '完整银行账号将加密保存，业务页面仅显示脱敏值。'}>
      <form key={editingAccount?.id ?? 'new'} className="form-grid" onSubmit={submitAccount}>
        <Field label="银行名称" span={2}><Input name="bankName" required maxLength={200} defaultValue={editingAccount?.bankName ?? ''} /></Field>
        <Field label="银行账号" span={2} hint={editingAccount ? `留空保留原账号 ${editingAccount.accountNumberMasked}` : '保存后仅显示账号末四位'}><Input name="accountNumber" required={!editingAccount} maxLength={64} autoComplete="off" /></Field>
        {editingAccount && <Field label="账户状态" span={2}><Select name="status" defaultValue={editingAccount.status}><option value="ACTIVE">启用</option><option value="INACTIVE">停用</option></Select></Field>}
        {saveAccount.error && <p className="form-error span-2">{saveAccount.error.message}</p>}
        <div className="span-2"><FormActions pending={saveAccount.isPending} onCancel={() => { setAccountEditor(null); setAccountManager(true); }} submitLabel={editingAccount ? '保存修改' : '保存账户'} /></div>
      </form>
    </Modal>

    <ConfirmActionModal open={Boolean(deletingAccount)} onClose={() => { setDeletingAccount(null); setAccountManager(true); }} onConfirm={() => deletingAccount && removeAccount.mutate(deletingAccount.id)} pending={removeAccount.isPending} title="停用本方银行账户" description={deletingAccount ? `确认停用“${deletingAccount.bankName} · ${deletingAccount.accountNumberMasked}”？已有流水记录不会删除。` : ''} confirmLabel="确认停用" error={removeAccount.error} />
    <ConfirmActionModal open={Boolean(excluding)} onClose={() => setExcluding(null)} onConfirm={() => excluding && exclude.mutate(excluding.id)} pending={exclude.isPending} title="作废银行流水" description={excluding ? `确认作废 ${excluding.counterpartyName} 的 ${formatMoney(excluding.amount)} 流水？已有分配将自动撤销，作废后不再参与结算。` : ''} confirmLabel="确认作废" error={exclude.error} />
  </div>;
}

function allocationSubject(allocation: BankAllocation) {
  if (allocation.memberDue) return `${allocation.memberDue.membership.memberName} · ${allocation.memberDue.periodLabel ?? allocation.memberDue.dueCode}`;
  if (allocation.expertProfile) return `${allocation.project?.projectCode ?? '未关联项目'} · ${allocation.expertProfile.person.name}`;
  return allocation.project?.projectCode ?? '未关联对象';
}

function downloadBase64Csv(report: NonNullable<BankingImportResult['expertReport']>) {
  const bytes = Uint8Array.from(window.atob(report.contentBase64), (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = report.fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
