import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Landmark, Upload } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from './DataTable';
import { DateInput, Field, SearchableSelect } from './FormControls';
import { EmptyState, LoadingState } from './States';
import { StatusChip } from './StatusChip';
import { api } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import type { BankAllocation, BankingImportResult, Project } from '../lib/types';

interface BankAccountOption {
  id: string;
  bankName: string;
  accountNumberMasked: string;
}

export function ProjectExpertFees({ project, canImport }: { project: Project; canImport: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BankingImportResult | null>(null);
  const queryClient = useQueryClient();
  const accounts = useQuery({
    queryKey: ['bank-account-options'],
    queryFn: () => api.get<BankAccountOption[]>('/banking/accounts/options'),
    enabled: canImport,
  });
  const downloadTemplate = useMutation({
    mutationFn: () => api.download(`/banking/projects/${project.id}/expert-fees/import-template`),
    onSuccess: (blob) => downloadBlob(blob, `专家劳务费导入模板_${project.projectCode}.csv`),
  });
  const importFees = useMutation({
    mutationFn: (input: { file: File; bankAccountId: string; transactionDate: string }) => api.uploadForm<BankingImportResult>(
      `/banking/projects/${project.id}/expert-fees/import`,
      input.file,
      { bankAccountId: input.bankAccountId, transactionDate: input.transactionDate },
    ),
    onSuccess: (nextResult) => {
      setResult(nextResult);
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      void queryClient.invalidateQueries({ queryKey: ['banking'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
  const fees = (project.allocations ?? []).filter((allocation) => allocation.category === 'EXPERT_FEE'
    && allocation.status === 'CONFIRMED'
    && allocation.bankTransaction?.settlementApplicable !== false);
  const paidTotal = fees.reduce((sum, fee) => sum + Number(fee.allocatedAmount), 0);
  const taxTotal = fees.reduce((sum, fee) => sum + calculateExpertTax(Number(fee.allocatedAmount)), 0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const values = new FormData(event.currentTarget);
    importFees.mutate({
      file,
      bankAccountId: String(values.get('bankAccountId') ?? ''),
      transactionDate: String(values.get('transactionDate') ?? ''),
    });
  }

  return <div className="expert-fee-workspace">
    <header className="expert-fee-heading">
      <div><p className="eyebrow">项目专项支付</p><h2>专家劳务费清单</h2><p>按专家库信息完成收款账户匹配，支付记录同步进入银行日记账。</p></div>
      <div className="expert-fee-metrics">
        <span><small>已入账</small><strong>{fees.length} 笔</strong></span>
        <span><small>支付合计</small><strong>{formatMoney(paidTotal)}</strong></span>
        <span><small>预估个税</small><strong>{formatMoney(taxTotal)}</strong></span>
      </div>
    </header>

    {canImport && <form className="expert-fee-import" onSubmit={submit}>
      <div className="expert-fee-template">
        <FileSpreadsheet size={24} />
        <div><strong>使用项目专属模板</strong><span>仅填写专家姓名、身份证号、支付金额，单次最多 1000 行。</span></div>
        <button type="button" className="button secondary" disabled={downloadTemplate.isPending} onClick={() => downloadTemplate.mutate()}><Download size={15} />下载模板</button>
      </div>
      <div className="expert-fee-fields">
        <Field label="本方银行账户"><SearchableSelect name="bankAccountId" ariaLabel="本方银行账户" required disabled={accounts.isLoading || accounts.isError} placeholder="请选择付款账户" searchPlaceholder="搜索银行名称或账号" options={(accounts.data ?? []).map((account) => ({ value: account.id, label: `${account.bankName} · ${account.accountNumberMasked}` }))} /></Field>
        <Field label="支付日期"><DateInput name="transactionDate" required /></Field>
        <label className={`expert-fee-file${file ? ' selected' : ''}`}>
          <input type="file" accept=".csv,text/csv" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResult(null); }} />
          <Upload size={17} /><span>{file?.name ?? '选择专家劳务费清单'}</span><small>{file ? '点击可更换文件' : 'CSV，最大 2MB'}</small>
        </label>
        <button type="submit" className="button primary expert-fee-submit" disabled={!file || importFees.isPending || accounts.isLoading}>{importFees.isPending ? '正在匹配并入账…' : '上传并入账'}</button>
      </div>
      {accounts.data?.length === 0 && <p className="form-error">尚未配置可用的本方银行账户，请先前往银行日记账配置。</p>}
      {(downloadTemplate.error || importFees.error || accounts.error) && <p className="form-error">{(downloadTemplate.error ?? importFees.error ?? accounts.error)?.message}</p>}
      {result && <ImportResult result={result} />}
    </form>}

    <section className="expert-fee-ledger">
      <div className="expert-fee-ledger-title"><span><Landmark size={16} />明细</span><small>银行卡仅显示脱敏信息，个税为按当前规则计算的预估值。</small></div>
      {!project.allocations ? <LoadingState /> : <DataTable columns={expertFeeColumns} rows={fees} rowKey={(row) => row.id} emptyState={<EmptyState title="暂无专家劳务费" description="下载模板并上传清单后，成功匹配的记录将在这里显示。" />} footer={<tr className="expert-fee-total"><th>合计</th><td>{fees.length} 笔</td><td>—</td><td>—</td><td className="number">{formatMoney(paidTotal)}</td><td className="number">{formatMoney(taxTotal)}</td><td>—</td></tr>} />}
    </section>
  </div>;
}

const expertFeeColumns: TableColumn<BankAllocation>[] = [
  { key: 'date', label: '支付日期', render: (row) => formatDate(row.bankTransaction?.transactionAt) },
  { key: 'expert', label: '专家', render: (row) => <span className="primary-cell"><strong>{row.expertProfile?.person.name ?? row.bankTransaction?.counterpartyName ?? '未关联专家'}</strong><small>{row.bankTransaction?.nature ?? '专家劳务费'}</small></span> },
  { key: 'title', label: '职称', render: (row) => row.expertProfile?.professionalTitle || '—' },
  { key: 'bank', label: '收款账户', render: (row) => <span className="primary-cell"><strong>{row.bankTransaction?.counterpartyBankName || '—'}</strong><small className="mono">{row.bankTransaction?.counterpartyAccountMasked || '—'}</small></span> },
  { key: 'amount', label: '支付金额', className: 'number', render: (row) => <strong>{formatMoney(row.allocatedAmount)}</strong> },
  { key: 'tax', label: '预估个税', className: 'number', render: (row) => formatMoney(calculateExpertTax(Number(row.allocatedAmount))) },
  { key: 'status', label: '状态', render: (row) => <StatusChip value={row.bankTransaction?.matchStatus ?? row.status} /> },
];

function ImportResult({ result }: { result: BankingImportResult }) {
  return <div className={`import-result${result.failureCount ? ' has-errors' : ''}`}>
    <strong>处理 {result.total} 行，成功入账 {result.successCount} 行，失败 {result.failureCount} 行</strong>
    {result.errors.length > 0 && <ul>{result.errors.map((error) => <li key={`${error.row}-${error.message}`}>第 {error.row} 行：{error.message}</li>)}</ul>}
    {result.expertReport && <button type="button" className="button secondary" onClick={() => downloadBase64Csv(result.expertReport!)}><Download size={15} />下载匹配与个税结果</button>}
  </div>;
}

export function calculateExpertTax(paymentAmount: number) {
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) return 0;
  const taxable = paymentAmount <= 4000 ? paymentAmount - 800 : paymentAmount * 0.8;
  return Math.round((Math.max(taxable * 0.2, taxable * 0.3 - 2000, taxable * 0.4 - 7000, 0) + Number.EPSILON) * 100) / 100;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadBase64Csv(report: NonNullable<BankingImportResult['expertReport']>) {
  const bytes = Uint8Array.from(window.atob(report.contentBase64), (character) => character.charCodeAt(0));
  downloadBlob(new Blob([bytes], { type: 'text/csv;charset=utf-8' }), report.fileName);
}
