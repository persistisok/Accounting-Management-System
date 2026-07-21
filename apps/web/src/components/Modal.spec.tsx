import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders at the document root and closes with Escape', () => {
    const onClose = vi.fn();
    const { container, unmount } = render(
      <div className="page-enter">
        <Modal open title="新建项目" onClose={onClose}>
          <p>项目表单</p>
        </Modal>
      </div>,
    );

    expect(container.querySelector('.modal-backdrop')).toBeNull();
    expect(screen.getByRole('dialog', { name: '新建项目' })).not.toBeNull();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });
});
