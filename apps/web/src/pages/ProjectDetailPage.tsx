import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DataTable, type TableColumn } from '../components/DataTable';
import { Field, FormActions, Select, Textarea } from '../components/FormControls';
import { Modal } from '../components/Modal';
import { ProjectRail } from '../components/ProjectRail';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { api } from '../lib/api';
import { formObject } from '../lib/form';
import { formatDate, formatMoney, formatProjectPeriod, statusLabels } from '../lib/format';
import type { BankAllocation, Candidate, Contract, Invoice, Organization, Project } from '../lib/types';

type DetailTab = 'overview' | 'contracts' | 'banking' | 'invoices' | 'candidates';

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [candidateModal, setCandidateModal] = useState(false);
  const queryClient = useQueryClient();
  const project = useQuery({ queryKey: ['project', id], queryFn: () => api.get<Project>(`/projects/${id}`), enabled: Boolean(id) });
  const executors = useQuery({ queryKey: ['organization-options', 'EXECUTOR'], queryFn: () => api.get<Organization[]>('/organizations/options?roleType=EXECUTOR') });
  const addCandidate = useMutation({
    mutationFn: (body: Record<string, string>) => api.post('/organizations/executor-candidates', { ...body, projectId: id }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['project', id] }); setCandidateModal(false); },
  });
  if (project.isLoading) return <LoadingState />;
  if (project.error || !project.data) return <ErrorState error={project.error} />;
  const data = project.data;
  const tabs: { key: DetailTab; label: string; count?: number }[] = [
    { key: 'overview', label: '项目概览' }, { key: 'contracts', label: '合同', count: data.contracts?.length },
    { key: 'banking', label: '流水', count: data.allocations?.length }, { key: 'invoices', label: '发票', count: data.invoices?.length },
    { key: 'candidates', label: '执行方遴选', count: data.candidates?.length },
  ];
  return <div className="page-enter">
    <Link to="/projects" className="back-link"><ArrowLeft size={16} />返回项目台账</Link>
    <header className="project-heading"><div><p className="eyebrow">{data.platform} / {data.projectCode}</p><h1>{data.name}</h1><p>{data.nature} · {data.pmName} · {formatProjectPeriod(data.periodMonths)}</p></div><StatusChip value={data.status} /></header>
    <ProjectRail summary={data.financialSummary} approvedAmount={data.approvedAmount} executionCost={data.executionCost} />
    <nav className="detail-tabs">{tabs.map((item) => <button key={item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}</nav>
    <section className="panel detail-panel">
      {tab === 'overview' && <div className="overview-grid">
        <Info label="项目编码" value={data.projectCode} mono /><Info label="发布日期" value={formatDate(data.publishedOn)} /><Info label="项目经理" value={data.pmName} /><Info label="项目性质" value={data.nature} />
        <Info label="立项金额" value={formatMoney(data.approvedAmount)} /><Info label="执行成本" value={formatMoney(data.executionCost)} /><Info label="项目周期" value={formatProjectPeriod(data.periodMonths)} /><Info label="备注" value={data.remark || '暂无备注'} />
      </div>}
      {tab === 'contracts' && <DataTable columns={contractColumns} rows={data.contracts ?? []} rowKey={(row) => row.id} />}
      {tab === 'banking' && <DataTable columns={allocationColumns} rows={data.allocations ?? []} rowKey={(row) => row.id} />}
      {tab === 'invoices' && <DataTable columns={invoiceColumns} rows={data.invoices ?? []} rowKey={(row) => row.id} />}
      {tab === 'candidates' && <>
        <div className="inline-heading"><div><h2>执行方遴选</h2><p>中选后才允许登记执行协议。</p></div><button className="button secondary" onClick={() => setCandidateModal(true)}><Plus size={16} />登记执行方</button></div>
        <DataTable columns={candidateColumns} rows={data.candidates ?? []} rowKey={(row) => row.id} />
      </>}
    </section>
    <Modal open={candidateModal} onClose={() => setCandidateModal(false)} title="登记参与遴选的执行方">
      <form className="form-grid" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); addCandidate.mutate(formObject(event.currentTarget)); }}>
        <Field label="执行方" span={2}><Select name="organizationId" required><option value="">请选择</option>{executors.data?.map((item) => <option key={item.id} value={item.id}>{item.organizationCode} · {item.name}</option>)}</Select></Field>
        <Field label="遴选状态" span={2}><Select name="selectionStatus" defaultValue="CANDIDATE"><option value="CANDIDATE">候选</option><option value="SELECTED">已中选</option><option value="NOT_SELECTED">未中选</option><option value="WITHDRAWN">已退出</option></Select></Field>
        <Field label="备注" span={2}><Textarea name="remark" /></Field>
        {addCandidate.error && <p className="form-error span-2">{addCandidate.error.message}</p>}
        <div className="span-2"><FormActions pending={addCandidate.isPending} onCancel={() => setCandidateModal(false)} submitLabel="保存遴选记录" /></div>
      </form>
    </Modal>
  </div>;
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div className="info-item"><span>{label}</span><strong className={mono ? 'mono' : ''}>{value}</strong></div>; }

const contractColumns: TableColumn<Contract>[] = [
  { key: 'no', label: '合同编号', render: (row) => <span className="mono key-cell">{row.contractNo}</span> },
  { key: 'type', label: '类型', render: (row) => statusLabels[row.contractType] },
  { key: 'party', label: '相对方', render: (row) => row.counterparty.name },
  { key: 'date', label: '签约日期', render: (row) => formatDate(row.signedOn) },
  { key: 'amount', label: '合同金额', className: 'number', render: (row) => formatMoney(row.amount) },
  { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
];
const allocationColumns: TableColumn<BankAllocation>[] = [
  { key: 'category', label: '资金分类', render: (row) => statusLabels[row.category] ?? row.category },
  { key: 'expert', label: '关联对象', render: (row) => row.expertProfile?.person.name ?? '项目资金' },
  { key: 'amount', label: '分配金额', className: 'number', render: (row) => formatMoney(row.allocatedAmount) },
  { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
];
const invoiceColumns: TableColumn<Invoice>[] = [
  { key: 'no', label: '发票号码', render: (row) => <span className="mono key-cell">{row.invoiceNumber}</span> },
  { key: 'buyer', label: '购买方', render: (row) => row.buyerName },
  { key: 'date', label: '开票日期', render: (row) => formatDate(row.issuedOn) },
  { key: 'amount', label: '价税合计', className: 'number', render: (row) => formatMoney(row.totalAmount) },
  { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
];
const candidateColumns: TableColumn<Candidate>[] = [
  { key: 'code', label: '执行方编号', render: (row) => <span className="mono key-cell">{row.organization.organizationCode}</span> },
  { key: 'name', label: '执行方', render: (row) => row.organization.name },
  { key: 'platform', label: '入库平台', render: (row) => row.organization.platform },
  { key: 'date', label: '中选日期', render: (row) => formatDate(row.selectedOn) },
  { key: 'status', label: '状态', render: (row) => <StatusChip value={row.selectionStatus} /> },
];
