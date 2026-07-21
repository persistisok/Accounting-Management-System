import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Field({ label, hint, children, span = 1 }: { label: string; hint?: string; children: ReactNode; span?: 1 | 2 }) {
  return <label className={`field span-${span}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`control${className ? ` ${className}` : ''}`} {...props} />;
}

export function MoneyInput({ className, step = '0.01', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} className={`money-input${className ? ` ${className}` : ''}`} type="number" inputMode="decimal" step={step} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select className="control" {...props} />; }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className="control" rows={3} {...props} />; }

export function FormActions({ pending, onCancel, submitLabel = '保存' }: { pending: boolean; onCancel: () => void; submitLabel?: string }) {
  return <div className="form-actions"><button type="button" className="button ghost" onClick={onCancel}>取消</button><button type="submit" className="button primary" disabled={pending}>{pending ? '正在保存…' : submitLabel}</button></div>;
}
