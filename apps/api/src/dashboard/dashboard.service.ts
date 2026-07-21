import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, private readonly projects: ProjectsService) {}

  async overview() {
    const [projectList, unmatchedTransactions, pendingExperts, activeProjects, contracts, invoices] = await Promise.all([
      this.projects.list({ page: 1, pageSize: 6, status: 'ACTIVE' }),
      this.prisma.bankTransaction.count({ where: { matchStatus: { in: ['UNMATCHED', 'PARTIAL'] }, settlementApplicable: true } }),
      this.prisma.expertProfile.count({ where: { reviewStatus: 'PENDING' } }),
      this.prisma.project.count({ where: { status: 'ACTIVE' } }),
      this.prisma.contract.count({ where: { status: 'SIGNED' } }),
      this.prisma.invoice.count({ where: { status: 'NORMAL' } }),
    ]);
    const projectsWithGaps = projectList.items.filter((project) =>
      Number(project.financialSummary.unreceivedAmount) > 0
      || Number(project.financialSummary.unpaidExecutionAmount) > 0,
    );
    return {
      counts: { activeProjects, contracts, invoices, unmatchedTransactions, pendingExperts },
      recentProjects: projectList.items,
      tasks: [
        { id: 'unmatched', label: '待关联银行流水', count: unmatchedTransactions, href: '/banking?status=UNMATCHED', tone: 'warning' },
        { id: 'experts', label: '待复核专家资料', count: pendingExperts, href: '/experts?status=PENDING', tone: 'neutral' },
        { id: 'gaps', label: '存在资金差额的项目', count: projectsWithGaps.length, href: '/projects', tone: 'accent' },
      ],
    };
  }
}
