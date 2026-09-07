import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, CheckCircle2, Circle, Clock3, FileCheck2, FileUp, ShieldCheck, XCircle } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { LedgerAttachmentList, PdfAttachmentInput, uploadLedgerAttachments } from './LedgerAttachments';
import { Field, FormActions, Select, Textarea } from './FormControls';
import { Modal } from './Modal';
import { ErrorState, LoadingState } from './States';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { hasPermission } from '../lib/permissions';
import type { ArchiveChecklistItem, ArchiveChecklistResponse } from '../lib/types';

export function ProjectArchiveChecklist({ projectId, archived }: { projectId: string; archived: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'UPLOAD' | 'REVIEW' | 'VIEW'>(
    user?.role === 'ADMIN' ? 'REVIEW' : user?.role === 'PM' || user?.role === 'SYSTEM_ADMIN' ? 'UPLOAD' : 'VIEW',
  );
  const [uploading, setUploading] = useState<ArchiveChecklistItem | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [markingNa, setMarkingNa] = useState<ArchiveChecklistItem | null>(null);
  const [reviewing, setReviewing] = useState<ArchiveChecklistItem | null>(null);
  const canSubmit = viewMode === 'UPLOAD' && !archived && (user?.role === 'PM' || user?.role === 'SYSTEM_ADMIN') && hasPermission(user, 'PROJECTS', 'ENTRY');
  const canReview = viewMode === 'REVIEW' && (user?.role === 'ADMIN' || user?.role === 'SYSTEM_ADMIN') && hasPermission(user, 'PROJECTS', 'REVIEW');
  const checklist = useQuery({
    queryKey: ['project-archive-checklist', projectId],
    queryFn: () => api.get<ArchiveChecklistResponse>(`/projects/${projectId}/archive-checklist`),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['project-archive-checklist', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
    void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
  };
  const upload = useMutation({
    mutationFn: async ({ item, pendingFiles }: { item: ArchiveChecklistItem; pendingFiles: File[] }) => {
      const prepared = await api.post<{ id: string }>(`/projects/${projectId}/archive-checklist/${item.key}/prepare`);
      const failures = await uploadLedgerAttachments('PROJECT_ARCHIVE_ITEM', prepared.id, pendingFiles);
      if (failures) throw new Error(`${failures} 份材料上传失败，请重试`);
      await api.post(`/projects/${projectId}/archive-checklist/${item.key}/submit`);
    },
    onSuccess: () => { setUploading(null); setFiles([]); refresh(); },
  });
  const markNa = useMutation({
    mutationFn: ({ item, reason }: { item: ArchiveChecklistItem; reason: string }) => api.post(`/projects/${projectId}/archive-checklist/${item.key}/not-applicable`, { reason }),
    onSuccess: () => { setMarkingNa(null); refresh(); },
  });
  const review = useMutation({
    mutationFn: ({ item, decision, reason }: { item: ArchiveChecklistItem; decision: string; reason: string }) => api.post(`/projects/${projectId}/archive-checklist/${item.key}/review`, { decision, reason }),
    onSuccess: () => { setReviewing(null); refresh(); },
  });

  if (checklist.isLoading) return <LoadingState label="正在读取归档清单" />;
  if (checklist.error || !checklist.data) return <ErrorState error={checklist.error} />;
  const { items, summary } = checklist.data;

  return <div className="archive-checklist">
    <header className="archive-checklist-head">
      <div><p className="eyebrow">项目交付凭证</p><h2>归档清单</h2><p>{viewMode === 'REVIEW' ? '审核 PM 提交的材料；驳回时必须填写原因。' : viewMode === 'UPLOAD' ? '上传归档材料；条件材料可提交不适用原因。' : '查看归档材料及逐项审核结果。'}</p></div>
      <div className={`archive-readiness${summary.readyForArchive ? ' ready' : ''}`}><ShieldCheck size={22} /><span><small>归档就绪度</small><strong>{summary.approvedRequired} / {summary.required} 项通过</strong></span></div>
    </header>
    <div className="archive-view-bar">
      <span>{viewMode === 'UPLOAD' ? '上传材料视图' : viewMode === 'REVIEW' ? '审核材料视图' : '清单查看视图'}</span>
      {user?.role === 'SYSTEM_ADMIN' && <div className="archive-view-switch" role="tablist" aria-label="归档清单视图">
        <button type="button" role="tab" aria-selected={viewMode === 'UPLOAD'} className={viewMode === 'UPLOAD' ? 'active' : ''} onClick={() => setViewMode('UPLOAD')}><FileUp size={14} />上传材料</button>
        <button type="button" role="tab" aria-selected={viewMode === 'REVIEW'} className={viewMode === 'REVIEW' ? 'active' : ''} onClick={() => setViewMode('REVIEW')}><FileCheck2 size={14} />审核材料</button>
      </div>}
    </div>
    <div className="archive-summary">
      <span><Circle size={13} />未上传<strong>{summary.notUploaded}</strong></span>
      <span className="pending"><Clock3 size={13} />待审核<strong>{summary.pending}</strong></span>
      <span className="approved"><CheckCircle2 size={13} />已通过<strong>{summary.approved}</strong></span>
      <span className="rejected"><XCircle size={13} />已驳回<strong>{summary.rejected}</strong></span>
      {summary.readyForArchive && <em><Check size={14} />必需材料已全部通过，可在项目台账申请归档</em>}
    </div>
    <div className="archive-item-grid">
      {items.map((item, index) => <article key={item.key} className={`archive-item ${item.status.toLowerCase().replace('_', '-')} ${item.requirement.toLowerCase()}`}>
        <div className="archive-item-index">{String(index + 1).padStart(2, '0')}</div>
        <div className="archive-item-body">
          <div className="archive-item-title"><strong>{item.label}</strong><ArchiveStatus item={item} /></div>
          {item.condition && <p className="archive-condition"><AlertTriangle size={12} />{item.condition}</p>}
          {item.requirement === 'OPTIONAL' && <p className="archive-condition optional">选填，不影响项目归档申请</p>}
          {item.notApplicable && <p className="archive-note">不适用：{item.notApplicableReason}</p>}
          {item.rejectionReason && <p className="archive-rejection">驳回原因：{item.rejectionReason}</p>}
          {item.id && item.attachments.length > 0 && <LedgerAttachmentList objectType="PROJECT_ARCHIVE_ITEM" objectId={item.id} attachments={item.attachments} />}
          {(item.uploader || item.reviewer) && <small className="archive-actors">{item.uploader ? `提交：${item.uploader.displayName}` : ''}{item.reviewer ? ` · 审核：${item.reviewer.displayName}` : ''}</small>}
        </div>
        <div className="archive-item-actions">
          {canSubmit && (item.status === 'NOT_UPLOADED' || item.status === 'REJECTED') && <button className="table-action" onClick={() => { setFiles([]); upload.reset(); setUploading(item); }}><FileUp size={14} />{item.status === 'REJECTED' ? '重新上传' : '上传'}</button>}
          {canSubmit && item.requirement === 'CONDITIONAL' && (item.status === 'NOT_UPLOADED' || item.status === 'REJECTED') && <button className="table-action" onClick={() => { markNa.reset(); setMarkingNa(item); }}>不适用</button>}
          {canReview && item.status === 'PENDING' && <button className="table-action review" onClick={() => { review.reset(); setReviewing(item); }}><FileCheck2 size={14} />审核</button>}
        </div>
      </article>)}
    </div>

    <Modal open={Boolean(uploading)} onClose={() => { setUploading(null); setFiles([]); }} title={uploading ? `上传 · ${uploading.label}` : '上传归档材料'} description="仅支持 PDF，每个清单项最多 10 份，单份不超过 10MB。">
      <div className="archive-modal-content">
        <PdfAttachmentInput files={files} onFilesChange={setFiles} existingCount={uploading?.attachments.length ?? 0} />
        {upload.error && <p className="form-error">{upload.error.message}</p>}
        <div className="form-actions"><button className="button ghost" onClick={() => { setUploading(null); setFiles([]); }}>取消</button><button className="button primary" disabled={!files.length || upload.isPending} onClick={() => uploading && upload.mutate({ item: uploading, pendingFiles: files })}>{upload.isPending ? '正在上传…' : '上传并提交审核'}</button></div>
      </div>
    </Modal>

    <Modal open={Boolean(markingNa)} onClose={() => setMarkingNa(null)} title={markingNa ? `标记不适用 · ${markingNa.label}` : '标记不适用'} description={markingNa?.condition}>
      <form className="form-grid" onSubmit={(event) => submitNa(event, markingNa, markNa)}><Field label="不适用原因" span={2}><Textarea name="reason" required minLength={2} maxLength={500} /></Field>{markNa.error && <p className="form-error span-2">{markNa.error.message}</p>}<div className="span-2"><FormActions pending={markNa.isPending} onCancel={() => setMarkingNa(null)} submitLabel="提交管理员审核" /></div></form>
    </Modal>

    <Modal open={Boolean(reviewing)} onClose={() => setReviewing(null)} title={reviewing ? `审核 · ${reviewing.label}` : '审核归档材料'} description="驳回时必须填写原因，结果和审核人将被记录。">
      <form className="form-grid" onSubmit={(event) => submitReview(event, reviewing, review)}><Field label="审核结论" span={2}><Select name="decision" defaultValue="APPROVED"><option value="APPROVED">通过</option><option value="REJECTED">驳回</option></Select></Field><Field label="审核说明 / 驳回原因" span={2}><Textarea name="reason" maxLength={500} /></Field>{review.error && <p className="form-error span-2">{review.error.message}</p>}<div className="span-2"><FormActions pending={review.isPending} onCancel={() => setReviewing(null)} submitLabel="确认审核" /></div></form>
    </Modal>
  </div>;
}

function ArchiveStatus({ item }: { item: ArchiveChecklistItem }) {
  const values = {
    NOT_UPLOADED: ['未上传', 'neutral'], PENDING: ['待审核', 'warn'], APPROVED: ['已通过', 'good'], REJECTED: ['已驳回', 'bad'],
  } as const;
  const [label, tone] = values[item.status];
  return <span className={`status-chip ${tone}`}>{item.notApplicable && item.status !== 'REJECTED' ? `不适用 · ${label}` : label}</span>;
}

function submitNa(event: FormEvent<HTMLFormElement>, item: ArchiveChecklistItem | null, mutation: { mutate: (value: { item: ArchiveChecklistItem; reason: string }) => void }) {
  event.preventDefault();
  if (!item) return;
  mutation.mutate({ item, reason: String(new FormData(event.currentTarget).get('reason') ?? '') });
}

function submitReview(event: FormEvent<HTMLFormElement>, item: ArchiveChecklistItem | null, mutation: { mutate: (value: { item: ArchiveChecklistItem; decision: string; reason: string }) => void }) {
  event.preventDefault();
  if (!item) return;
  const data = new FormData(event.currentTarget);
  mutation.mutate({ item, decision: String(data.get('decision') ?? ''), reason: String(data.get('reason') ?? '') });
}
