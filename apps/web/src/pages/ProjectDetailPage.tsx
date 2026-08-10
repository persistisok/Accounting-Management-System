import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DataTable, type TableColumn } from '../components/DataTable';
import { ProjectRail } from '../components/ProjectRail';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { api } from '../lib/api';
import { formatDate, formatMoney, formatProjectPeriod, statusLabels } from '../lib/format';
import type { BankAllocation, Contract, Invoice, Project } from '../lib/types';

type DetailTab = 'overview' | 'contracts' | 'banking' | 'invoices';

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<DetailTab>('overview');
  const project = useQuery({ queryKey: ['project', id], queryFn: () => api.get<Project>(`/projects/${id}`), enabled: Boolean(id) });
  if (project.isLoading) return <LoadingState />;
  if (project.error || !project.data) return <ErrorState error={project.error} />;
  const data = project.data;
  const tabs: { key: DetailTab; label: string; count?: number }[] = [
    { key: 'overview', label: '项目概览' }, { key: 'contracts', label: '合同', count: data.contracts?.length },
    { key: 'banking', label: '流水', count: data.allocations?.length }, { key: 'invoices', label: '发票', count: data.invoices?.length },
  ];
  return <div className="page-enter">
    <Link to="/projects" className="back-link"><ArrowLeft size={16} />返回项目台账</Link>
    <header className="project-heading"><div><p className="eyebrow">{data.platform} / {data.projectCode}</p><h1>{data.name}</h1><p>{data.nature} · {data.pmName} · {formatProjectPeriod(data.periodMonths)}</p></div><StatusChip value={data.status} /></header>
    <ProjectRail summary={data.financialSummary} approvedAmount={data.approvedAmount} executionCost={data.executionCost} />
    <nav className="detail-tabs">{tabs.map((item) => <button key={item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}</nav>
    <section className="panel detail-panel">
      {tab === 'overview' && <div className="overview-grid">
        <Info label="项目编码" value={data.projectCode} mono /><Info label="发布日期" value={formatDate(data.publishedOn)} /><Info label="项目经理" value={data.pmName} /><Info label="项目性质" value={data.nature} />
        <Info label="项目类型" value={data.projectType} /><Info label="项目状态" value={statusLabels[data.status] ?? data.status} /><Info label="归档状态" value={statusLabels[data.archiveStatus] ?? data.archiveStatus} /><Info label="立项金额" value={formatMoney(data.approvedAmount)} /><Info label="执行成本" value={formatMoney(data.executionCost)} /><Info label="项目周期" value={formatProjectPeriod(data.periodMonths)} /><Info label="状态复核人" value={data.statusReviewer?.displayName ?? '尚无'} /><Info label="归档复核人" value={data.archiveReviewer?.displayName ?? '尚无'} /><Info label="备注" value={data.remark || '暂无备注'} />
      </div>}
      {tab === 'contracts' && <DataTable columns={contractColumns} rows={data.contracts ?? []} rowKey={(row) => row.id} />}
      {tab === 'banking' && <DataTable columns={allocationColumns} rows={data.allocations ?? []} rowKey={(row) => row.id} />}
      {tab === 'invoices' && <DataTable columns={invoiceColumns} rows={data.invoices ?? []} rowKey={(row) => row.id} />}
    </section>
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
  { key: 'amount', label: '流水金额', className: 'number', render: (row) => formatMoney(row.allocatedAmount) },
  { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
];
const invoiceColumns: TableColumn<Invoice>[] = [
  { key: 'direction', label: '发票方向', render: (row) => <StatusChip value={row.direction} /> },
  { key: 'type', label: '发票类型', render: (row) => row.invoiceType },
  { key: 'platform', label: '开票平台', render: (row) => row.invoicePlatform },
  { key: 'buyer', label: '相对方', render: (row) => row.buyerName },
  { key: 'date', label: '发票日期', render: (row) => formatDate(row.issuedOn) },
  { key: 'amount', label: '价税合计', className: 'number', render: (row) => formatMoney(row.totalAmount) },
  { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
];
