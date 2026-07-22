import { Download, FileText, Trash2 } from 'lucide-react';
import { useEffect, useState, type ChangeEvent } from 'react';
import { api } from '../lib/api';
import type { LedgerAttachment, LedgerAttachmentObjectType } from '../lib/types';

export async function uploadLedgerAttachments(
  objectType: LedgerAttachmentObjectType,
  objectId: string,
  files: File[],
) {
  let failedUploads = 0;
  for (const file of files) {
    try {
      await api.upload(`/attachments/${objectType}/${objectId}`, file);
    } catch {
      failedUploads += 1;
    }
  }
  return failedUploads;
}

export function PdfAttachmentInput({
  files,
  onFilesChange,
  existingCount = 0,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  existingCount?: number;
}) {
  const totalCount = existingCount + files.length;
  const remainingCount = Math.max(0, 10 - totalCount);

  function change(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file && totalCount < 10) onFilesChange([...files, file]);
    event.target.value = '';
  }

  return <div className="pdf-upload-queue">
    <div className="pdf-upload-heading">
      <input className="control pdf-file-input" type="file" accept="application/pdf,.pdf" disabled={remainingCount === 0} onChange={change} />
      <small>已有 {existingCount} 份 · 待上传 {files.length} 份 · 还可添加 {remainingCount} 份</small>
    </div>
    {files.length > 0 && <div className="pending-file-list">
      {files.map((file, index) => <span key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
        <FileText size={13} /><strong title={file.name}>{file.name}</strong>
        <button type="button" onClick={() => onFilesChange(files.filter((_, fileIndex) => fileIndex !== index))}><Trash2 size={12} />移除</button>
      </span>)}
    </div>}
    {remainingCount === 0 && <small className="attachment-limit">已达到最多 10 份附件的限制。</small>}
  </div>;
}

export function LedgerAttachmentList({
  objectType,
  objectId,
  attachments,
  canDelete = false,
  onDeleted,
}: {
  objectType: LedgerAttachmentObjectType;
  objectId: string;
  attachments: LedgerAttachment[];
  canDelete?: boolean;
  onDeleted?: (attachmentId: string) => void;
}) {
  const [items, setItems] = useState(attachments);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => setItems(attachments), [attachments]);

  async function download(attachment: LedgerAttachment) {
    setBusyId(attachment.id);
    setError('');
    try {
      const blob = await api.download(`/attachments/${objectType}/${objectId}/${attachment.id}/download`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '附件下载失败');
    } finally {
      setBusyId('');
    }
  }

  async function remove(attachment: LedgerAttachment) {
    if (!window.confirm(`确认删除附件“${attachment.fileName}”？`)) return;
    setBusyId(attachment.id);
    setError('');
    try {
      await api.delete(`/attachments/${objectType}/${objectId}/${attachment.id}`);
      setItems((current) => current.filter((item) => item.id !== attachment.id));
      onDeleted?.(attachment.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '附件删除失败');
    } finally {
      setBusyId('');
    }
  }

  if (items.length === 0) return <span className="attachment-empty">无附件</span>;
  return <span className={`attachment-list${canDelete ? ' editor' : ''}`} onClick={(event) => event.stopPropagation()}>
    {items.map((attachment) => <span className="attachment-item" key={attachment.id}>
      <button type="button" disabled={busyId === attachment.id} title={`下载 ${attachment.fileName}`} onClick={() => void download(attachment)}>
        <FileText size={13} /><span>{attachment.fileName}</span><Download size={12} />
      </button>
      {canDelete && <button type="button" className="attachment-remove" disabled={busyId === attachment.id} aria-label={`删除 ${attachment.fileName}`} onClick={() => void remove(attachment)}><Trash2 size={13} />删除</button>}
    </span>)}
    {error && <small className="attachment-error">{error}</small>}
  </span>;
}
