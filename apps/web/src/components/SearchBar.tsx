import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="search-bar">
      <Search size={17} />
      <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onChange(draft); }} placeholder={placeholder} />
      {draft !== value && <button onClick={() => onChange(draft)}>搜索</button>}
    </label>
  );
}
