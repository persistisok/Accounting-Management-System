import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react';

export function LoadingState({ label = '正在读取账目' }: { label?: string }) {
  return <div className="state-block"><LoaderCircle className="spin" /><span>{label}</span></div>;
}

export function ErrorState({ error }: { error: unknown }) {
  return <div className="state-block error"><AlertCircle /><span>{error instanceof Error ? error.message : '数据加载失败'}</span></div>;
}

export function EmptyState({ title = '暂无记录', description = '使用右上角按钮添加第一条业务数据。' }: { title?: string; description?: string }) {
  return <div className="empty-state"><Inbox /><strong>{title}</strong><p>{description}</p></div>;
}
