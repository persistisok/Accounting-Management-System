import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Filter, RotateCcw, Search } from 'lucide-react';
import { type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataTable, type TableColumn } from '../components/DataTable';
import { DateInput, Input, SearchableSelect, Select } from '../components/FormControls';
import { LedgerExportButton } from '../components/LedgerExportButton';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_PAGE_SIZE, Pagination } from '../components/Pagination';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { api, queryString } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formObject } from '../lib/form';
import { formatDate, formatMoney } from '../lib/format';
import type { Project, ProjectFilterOptions, ProjectListResponse } from '../lib/types';

export function collectionProgress(received: string, agreement: string) {
  const agreementValue = Number(agreement);
  const receivedValue = Number(received);
  if (!Number.isFinite(agreementValue) || agreementValue <= 0 || !Number.isFinite(receivedValue)) return 0;
  return Math.max(0, receivedValue / agreementValue * 100);
}

export function ProjectOverviewPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') ?? '';
  const platform = params.get('platform') ?? '';
  const nature = params.get('nature') ?? '';
  const projectType = params.get('projectType') ?? '';
  const pmUserId = params.get('pmUserId') ?? '';
  const publishedFrom = params.get('publishedFrom') ?? '';
  const publishedTo = params.get('publishedTo') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const projects = useQuery({
    queryKey: ['project-overview', q, platform, nature, projectType, pmUserId, publishedFrom, publishedTo, page],
    queryFn: () => api.get<ProjectListResponse>(`/projects${queryString({
      q, platform, nature, projectType, pmUserId, publishedFrom, publishedTo, page, pageSize: DEFAULT_PAGE_SIZE,
    })}`),
  });
  const filterOptions = useQuery({
    queryKey: ['project-filter-options'],
    queryFn: () => api.get<ProjectFilterOptions>('/projects/filter-options'),
  });

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formObject(event.currentTarget);
    const next = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => { if (value) next.set(key, value); });
    setParams(next);
  }

  function resetFilters() {
    setParams({});
  }

  const columns: TableColumn<Project>[] = [
    { key: 'project', label: '项目', render: (row) => <span className="overview-project"><strong>{row.name}</strong><small className="mono">{row.projectCode}</small></span> },
    { key: 'profile', label: '平台 / 类型', render: (row) => <span className="overview-profile"><strong>{row.platform}</strong><small>{row.projectType} · {row.nature}</small></span> },
    { key: 'published', label: '立项时间', render: (row) => formatDate(row.publishedOn) },
    { key: 'pm', label: 'PM', render: (row) => <span className="overview-pm"><strong>{row.pm?.displayName ?? row.pmName}</strong></span> },
    { key: 'approved', label: '立项金额', className: 'number', render: (row) => formatMoney(row.approvedAmount) },
    { key: 'agreement', label: '支持协议金额', className: 'number', render: (row) => formatMoney(row.financialSummary.receivableAmount) },
    { key: 'received', label: '实收金额', className: 'number', render: (row) => <strong className="overview-received">{formatMoney(row.financialSummary.receivedAmount)}</strong> },
    { key: 'progress', label: '回款刻度', render: (row) => <CollectionMeter received={row.financialSummary.receivedAmount} agreement={row.financialSummary.receivableAmount} /> },
    { key: 'status', label: '状态', render: (row) => <StatusChip value={row.status} /> },
    { key: 'action', label: '', render: (row) => <button className="table-action detail-action" onClick={(event) => { event.stopPropagation(); navigate(`/projects/${row.id}`); }}><ArrowUpRight size={14} />详情</button> },
  ];

  const activeFilterCount = [q, platform, nature, projectType, pmUserId, publishedFrom, publishedTo].filter(Boolean).length;
  return <div className="page-enter project-overview-page">
    <PageHeader eyebrow="项目管理 / 横向总览" title="项目全览" description="按统一口径横向核对立项、支持协议与实际回款。" action={user?.role === 'SYSTEM_ADMIN' ? <LedgerExportButton dataset="projects" fileName="项目全览" filters={{ q, platform, nature, projectType, pmUserId, publishedFrom, publishedTo }} /> : undefined} />
    <section className="overview-filter-ledger" aria-label="项目筛选">
      <div className="overview-filter-heading">
        <span><Filter size={17} /><strong>筛选项目账面</strong></span>
        <small>{activeFilterCount ? `已启用 ${activeFilterCount} 项条件` : '当前展示全部项目'}</small>
      </div>
      <form key={params.toString() || 'all'} className="overview-filter-grid" onSubmit={applyFilters}>
        <label className="overview-search-field"><span>项目</span><div><Search size={15} /><Input name="q" defaultValue={q} placeholder="项目编码或名称" /></div></label>
        <label><span>平台</span><Select name="platform" defaultValue={platform}><option value="">全部平台</option>{filterOptions.data?.platforms.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
        <label><span>PM</span><SearchableSelect name="pmUserId" ariaLabel="PM" defaultValue={pmUserId} placeholder="全部 PM" searchPlaceholder="搜索 PM 姓名" options={(filterOptions.data?.projectManagers ?? []).map((item) => ({ value: item.id, label: item.displayName }))} /></label>
        <label><span>项目性质</span><Select name="nature" defaultValue={nature}><option value="">全部性质</option>{filterOptions.data?.natures.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
        <label><span>项目类型</span><Select name="projectType" defaultValue={projectType}><option value="">全部类型</option>{filterOptions.data?.projectTypes.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
        <label><span>立项时间起</span><DateInput name="publishedFrom" aria-label="立项时间起" defaultValue={publishedFrom} max={publishedTo || undefined} /></label>
        <label><span>立项时间止</span><DateInput name="publishedTo" aria-label="立项时间止" defaultValue={publishedTo} min={publishedFrom || undefined} /></label>
        <div className="overview-filter-actions">
          <button type="button" className="button ghost" onClick={resetFilters}><RotateCcw size={15} />重置</button>
          <button type="submit" className="button primary"><Filter size={15} />应用筛选</button>
        </div>
      </form>
      {filterOptions.error && <p className="overview-filter-error">筛选项加载失败：{filterOptions.error.message}</p>}
    </section>
    <div className="overview-result-line"><span><strong>{projects.data?.total ?? 0}</strong> 个项目符合当前条件</span><small>支持协议金额与实收金额来自合同、银行流水的实时汇总</small></div>
    <section className="panel table-panel overview-table">{projects.isLoading ? <LoadingState /> : projects.error ? <ErrorState error={projects.error} /> : <><DataTable className="compact-default" columns={columns} rows={projects.data?.items ?? []} rowKey={(row) => row.id} onRowClick={(row) => navigate(`/projects/${row.id}`)} footer={<tr className="overview-total-row"><th>合计</th><td>{projects.data?.total ?? 0} 个项目</td><td>—</td><td>—</td><td className="number">{formatMoney(projects.data?.totals.approvedAmount ?? '0')}</td><td className="number">{formatMoney(projects.data?.totals.supportAgreementAmount ?? '0')}</td><td className="number"><strong>{formatMoney(projects.data?.totals.receivedAmount ?? '0')}</strong></td><td><CollectionMeter received={projects.data?.totals.receivedAmount ?? '0'} agreement={projects.data?.totals.supportAgreementAmount ?? '0'} /></td><td>—</td><td>—</td></tr>} /><Pagination page={page} total={projects.data?.total ?? 0} onPageChange={(nextPage) => { const next = new URLSearchParams(params); if (nextPage === 1) next.delete('page'); else next.set('page', String(nextPage)); setParams(next); }} /></>}</section>
  </div>;
}

function CollectionMeter({ received, agreement }: { received: string; agreement: string }) {
  const progress = collectionProgress(received, agreement);
  const display = progress > 0 ? `${progress.toFixed(progress >= 100 ? 0 : 1)}%` : '0%';
  return <span className="collection-meter" title={`实收占支持协议金额 ${display}`}>
    <span><i style={{ width: `${Math.min(progress, 100)}%` }} /></span><strong>{display}</strong>
  </span>;
}
