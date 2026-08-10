import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PdfAttachmentInput } from './LedgerAttachments';

afterEach(cleanup);

function UploadHarness({ existingCount = 0 }: { existingCount?: number }) {
  const [files, setFiles] = useState<File[]>([]);
  return <PdfAttachmentInput files={files} onFilesChange={setFiles} existingCount={existingCount} />;
}

function ProjectUploadHarness() {
  const [files, setFiles] = useState<File[]>([]);
  return <PdfAttachmentInput projectFiles files={files} onFilesChange={setFiles} />;
}

describe('PdfAttachmentInput', () => {
  it('adds one file at a time and allows pending files to be removed', () => {
    const { container } = render(<UploadHarness existingCount={2} />);
    const input = container.querySelector('input[type="file"]')!;
    const first = new File(['%PDF-1.7'], 'first.pdf', { type: 'application/pdf' });
    const second = new File(['%PDF-1.7'], 'second.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [first] } });
    fireEvent.change(input, { target: { files: [second] } });

    expect(screen.getByText('first.pdf')).toBeTruthy();
    expect(screen.getByText('second.pdf')).toBeTruthy();
    expect(screen.getByText('已有 2 份 · 待上传 2 份 · 还可添加 6 份')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: '移除' })[0]!);
    expect(screen.queryByText('first.pdf')).toBeNull();
    expect(screen.getByText('已有 2 份 · 待上传 1 份 · 还可添加 7 份')).toBeTruthy();
  });

  it('disables file selection when ten attachments already exist', () => {
    const { container } = render(<UploadHarness existingCount={10} />);
    expect((container.querySelector('input[type="file"]') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('已达到最多 10 份附件的限制。')).toBeTruthy();
  });

  it('accepts project archives and rejects unsupported project file types', () => {
    const { container } = render(<ProjectUploadHarness />);
    const input = container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['PK'], 'archive.zip', { type: 'application/zip' })] } });
    expect(screen.getByText('archive.zip')).toBeTruthy();

    fireEvent.change(input, { target: { files: [new File(['MZ'], 'program.exe')] } });
    expect(screen.getByText('仅支持 PDF、ZIP、RAR 或 7Z 文件。')).toBeTruthy();
  });
});
