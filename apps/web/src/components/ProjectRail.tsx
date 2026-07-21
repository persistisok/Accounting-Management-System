import { ArrowRight, FileCheck2, Landmark, ReceiptText } from 'lucide-react';
import type { FinancialSummary } from '../lib/types';
import { formatMoney } from '../lib/format';

function RailNode({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: string }) {
  return <div className={`rail-node ${tone}`}><span className="rail-icon">{icon}</span><span className="rail-label">{label}</span><strong>{formatMoney(value)}</strong><small>{detail}</small></div>;
}

export function ProjectRail({ summary, approvedAmount, executionCost }: { summary: FinancialSummary; approvedAmount: string; executionCost: string }) {
  return (
    <section className="project-rail" aria-label="项目资金轨道">
      <div className="rail-heading"><div><p className="eyebrow">项目资金轨道</p><h2>每个金额都有来源</h2></div><span className="rail-legend"><i className="income-dot" /> 收入 <i className="expense-dot" /> 支出</span></div>
      <div className="rail-row income">
        <RailNode icon={<Landmark size={18} />} label="立项金额" value={approvedAmount} detail="项目基准" tone="base" />
        <ArrowRight className="rail-arrow" />
        <RailNode icon={<FileCheck2 size={18} />} label="支持协议" value={summary.receivableAmount} detail={`待收 ${formatMoney(summary.unreceivedAmount)}`} tone="income" />
        <ArrowRight className="rail-arrow" />
        <RailNode icon={<Landmark size={18} />} label="已收支持款" value={summary.receivedAmount} detail="来自银行流水" tone="income" />
        <ArrowRight className="rail-arrow" />
        <RailNode icon={<ReceiptText size={18} />} label="已开票" value={summary.invoicedAmount} detail={`收票差 ${formatMoney(summary.uninvoicedAmount)}`} tone="income" />
      </div>
      <div className="rail-divider"><span>项目编码连接全部凭证</span></div>
      <div className="rail-row expense">
        <RailNode icon={<Landmark size={18} />} label="执行成本" value={executionCost} detail="计划成本" tone="base" />
        <ArrowRight className="rail-arrow" />
        <RailNode icon={<FileCheck2 size={18} />} label="执行协议" value={summary.payableExecutionAmount} detail={`待付 ${formatMoney(summary.unpaidExecutionAmount)}`} tone="expense" />
        <ArrowRight className="rail-arrow" />
        <RailNode icon={<Landmark size={18} />} label="已付执行款" value={summary.paidExecutionAmount} detail="来自银行流水" tone="expense" />
        <ArrowRight className="rail-arrow" />
        <RailNode icon={<Landmark size={18} />} label="已付专家费" value={summary.paidExpertAmount} detail="关联专家资料" tone="expense" />
      </div>
    </section>
  );
}
