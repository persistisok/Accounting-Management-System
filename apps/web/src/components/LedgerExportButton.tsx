import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, queryString } from '../lib/api';

export function LedgerExportButton({
  dataset,
  fileName,
  filters = {},
  sensitive = false,
}: {
  dataset: 'projects' | 'contracts' | 'banking' | 'invoices' | 'supporters' | 'executors' | 'experts' | 'members';
  fileName: string;
  filters?: Record<string, string | number | undefined>;
  sensitive?: boolean;
}) {
  const download = useMutation({
    mutationFn: () => api.download(`/exports/${dataset}${queryString(filters)}`),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}_${localTimestamp()}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });

  function startExport() {
    if (sensitive && !window.confirm('导出文件包含完整敏感信息。确认导出并写入审计日志？')) return;
    download.mutate();
  }

  return <span className="ledger-export-action">
    <button type="button" className="button secondary" disabled={download.isPending} onClick={startExport}>
      <Download size={16} />{download.isPending ? '正在导出…' : '导出筛选结果'}
    </button>
    {download.error && <small className="attachment-error">{download.error.message}</small>}
  </span>;
}

function localTimestamp() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}
