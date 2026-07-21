import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, FileClock, Landmark, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/States';
import { StatusChip } from '../components/StatusChip';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import type { Project } from '../lib/types';

interface DashboardData {
  counts: { activeProjects: number; contracts: number; invoices: number; unmatchedTransactions: number; pendingExperts: number };
  recentProjects: Project[];
  tasks: { id: string; label: string; count: number; href: string; tone: string }[];
}

export function DashboardPage() {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardData>('/dashboard') });
  if (query.isLoading) return <LoadingState />;
  if (query.error || !query.data) return <ErrorState error={query.error} />;
  const { counts, recentProjects, tasks } = query.data;
  return <div className="page-enter">
    <PageHeader eyebrow="工作台 / 今日概览" title="先处理差额，再推进项目" description="待办来自真实台账状态，完成处理后会自动从这里消失。" />
    <section className="ledger-strip" aria-label="业务规模">
      <span><strong>{counts.activeProjects}</strong>进行中项目</span><i />
      <span><strong>{counts.contracts}</strong>有效合同</span><i />
      <span><strong>{counts.invoices}</strong>有效发票</span><i />
      <span className="attention"><strong>{counts.unmatchedTransactions}</strong>待匹配流水</span>
    </section>
    <div className="dashboard-grid">
      <section className="panel task-panel">
        <div className="panel-heading"><div><p className="eyebrow">待处理</p><h2>账目需要你的判断</h2></div><FileClock /></div>
        <div className="task-list">{tasks.map((task, index) => (
          <Link to={task.href} className="task-row" key={task.id}>
            <span className="task-index">{String(index + 1).padStart(2, '0')}</span>
            <span className={`task-symbol ${task.tone}`}>{task.id === 'unmatched' ? <Landmark /> : task.id === 'experts' ? <ShieldCheck /> : <FileClock />}</span>
            <span><strong>{task.label}</strong><small>{task.count ? `还有 ${task.count} 项需要处理` : '当前没有待处理事项'}</small></span>
            <b>{task.count}</b><ArrowUpRight size={17} />
          </Link>
        ))}</div>
      </section>
      <section className="panel recent-panel">
        <div className="panel-heading"><div><p className="eyebrow">最近项目</p><h2>资金进度</h2></div><Link to="/projects">查看全部</Link></div>
        <div className="project-list">{recentProjects.map((project) => {
          const total = Number(project.financialSummary.receivableAmount) || 1;
          const ratio = Math.min(100, Number(project.financialSummary.receivedAmount) / total * 100);
          return <button key={project.id} onClick={() => navigate(`/projects/${project.id}`)}>
            <span className="project-code">{project.projectCode}</span><span className="project-list-title"><strong>{project.name}</strong><small>{project.pmName} · {project.platform}</small></span>
            <span className="mini-progress"><i style={{ width: `${ratio}%` }} /></span><span className="project-list-money"><strong>{formatMoney(project.financialSummary.receivedAmount)}</strong><small>应收 {formatMoney(project.financialSummary.receivableAmount)}</small></span><StatusChip value={project.status} />
          </button>;
        })}</div>
      </section>
    </div>
  </div>;
}
