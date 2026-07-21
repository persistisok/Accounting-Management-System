import { Modal } from './Modal';

export function ConfirmActionModal({ open, title, description, confirmLabel, pending, error, onClose, onConfirm }: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  error?: Error | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return <Modal open={open} onClose={onClose} title={title} description="此操作会记录到审计日志。">
    <div className="confirm-content">
      <p>{description}</p>
      {error && <p className="form-error">{error.message}</p>}
      <div className="form-actions"><button type="button" className="button ghost" onClick={onClose}>取消</button><button type="button" className="button danger" disabled={pending} onClick={onConfirm}>{pending ? '正在处理…' : confirmLabel}</button></div>
    </div>
  </Modal>;
}
