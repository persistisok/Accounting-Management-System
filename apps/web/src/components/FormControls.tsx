import { CalendarDays, Check, ChevronDown, Search } from 'lucide-react';
import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useEffect, useRef, useState } from 'react';

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

export interface SearchableOption {
  value: string;
  label: string;
  searchText?: string;
}

export function SearchableSelect({ name, options, defaultValue = '', required = false, disabled = false, placeholder = '请选择', searchPlaceholder = '输入关键词搜索', ariaLabel, onValueChange }: {
  name: string;
  options: SearchableOption[];
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  ariaLabel?: string;
  onValueChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  const filtered = options.filter((option) => `${option.label} ${option.searchText ?? ''}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery));

  useEffect(() => {
    if (!open) setQuery(selected?.label ?? '');
  }, [open, selected?.label]);

  function choose(option: SearchableOption) {
    setValue(option.value);
    setQuery(option.label);
    setOpen(false);
    onValueChange?.(option.value);
  }

  return <div className={`searchable-select${open ? ' open' : ''}${disabled ? ' disabled' : ''}`} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <Search className="searchable-leading" size={15} aria-hidden="true" />
    <input
      className="control searchable-input"
      type="text"
      role="combobox"
      aria-label={ariaLabel}
      aria-expanded={open}
      aria-autocomplete="list"
      autoComplete="off"
      disabled={disabled}
      value={query}
      placeholder={open ? searchPlaceholder : placeholder}
      onFocus={() => { setOpen(true); setQuery(''); }}
      onChange={(event) => { setQuery(event.target.value); setValue(''); onValueChange?.(''); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
        if (event.key === 'Enter' && open && filtered[0]) { event.preventDefault(); choose(filtered[0]); }
      }}
    />
    <ChevronDown className="searchable-chevron" size={16} aria-hidden="true" />
    <select className="searchable-native" name={name} required={required} disabled={disabled} value={value} onChange={() => undefined} tabIndex={-1} aria-hidden="true">
      <option value="" />
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {open && !disabled && <div className="searchable-menu" role="listbox">
      {filtered.length ? filtered.map((option) => <button
        key={option.value}
        type="button"
        role="option"
        aria-selected={option.value === value}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(option)}
      ><span>{option.label}</span>{option.value === value && <Check size={14} />}</button>) : <p>没有匹配结果</p>}
    </div>}
  </div>;
}

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'>;

export function DateInput({ className, defaultValue = '', disabled, required, name, min, max, 'aria-label': ariaLabel, ...props }: DateInputProps) {
  const [value, setValue] = useState(String(defaultValue));
  const inputRef = useRef<HTMLInputElement>(null);
  const displayValue = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value.slice(0, 4)}年${value.slice(5, 7)}月${value.slice(8, 10)}日`
    : '';

  function openPicker() {
    if (disabled) return;
    try {
      inputRef.current?.showPicker();
    } catch {
      inputRef.current?.focus();
      inputRef.current?.click();
    }
  }

  return <span className={`date-control${disabled ? ' disabled' : ''}${className ? ` ${className}` : ''}`}>
    <input
      className="control date-display"
      type="text"
      value={displayValue}
      placeholder="年/月/日"
      readOnly
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={openPicker}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openPicker(); }}
    />
    <CalendarDays size={16} aria-hidden="true" />
    <input
      {...props}
      ref={inputRef}
      className="date-native"
      type="date"
      name={name}
      value={value}
      min={min}
      max={max}
      required={required}
      disabled={disabled}
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => setValue(event.target.value)}
    />
  </span>;
}

export function FormActions({ pending, onCancel, submitLabel = '保存' }: { pending: boolean; onCancel: () => void; submitLabel?: string }) {
  return <div className="form-actions"><button type="button" className="button ghost" onClick={onCancel}>取消</button><button type="submit" className="button primary" disabled={pending}>{pending ? '正在保存…' : submitLabel}</button></div>;
}
