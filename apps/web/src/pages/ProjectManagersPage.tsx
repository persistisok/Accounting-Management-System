import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { Field, FormActions, Input, Select } from '../components/FormControls';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_PAGE_SIZE, Pagination } from '../components/Pagination';
import { SearchBar } from '../components/SearchBar';
import { ErrorState, LoadingState } from '../components/States';
import { api, queryString } from '../lib/api';
import { formObject } from '../lib/form';
import type { ListResponse, ProjectManager } from '../lib/types';

type EditorState = ProjectManager | 'new' | null;

export function ProjectManagersPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleting, setDeleting] = useState<ProjectManager | null>(null);
  const queryClient = useQueryClient();
  const managers = useQuery({
    queryKey: ['project-managers', q, page],
    queryFn: () => api.get<ListResponse<ProjectManager>>(`/project-managers${queryString({ q, page, pageSize: DEFAULT_PAGE_SIZE })}`),
  });
  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Record<string, string> }) => id
      ? api.patch<ProjectManager>(`/project-managers/${id}`, body)
      : api.post<ProjectManager>('/project-managers', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-managers'] });
      void queryClient.invalidateQueries({ queryKey: ['project-manager-options'] });
      setEditor(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete<ProjectManager>(`/project-managers/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-managers'] });
      void queryClient.invalidateQueries({ queryKey: ['project-manager-options'] });
      setDeleting(null);
    },
  });
  const columns: TableColumn<ProjectManager>[] = [
    { key: 'name', label: 'PM', render: (row) => <span className="pm-identity"><i>{row.displayName.slice(0, 1)}</i><span><strong>{row.displayName}</strong><small>项目经理</small></span></span> },
    { key: 'department', label: '所属部门', render: (row) => row.department || '—' },
    { key: 'projects', label: '关联项目', className: 'number', render: (row) => <strong>{row._count?.projects ?? 0}</strong> },
    { key: 'status', label: '状态', render: (row) => <span className={`status-chip ${row.status === 'ACTIVE' ? 'good' : 'neutral'}`}>{row.status === 'ACTIVE' ? '在用' : '已停用'}</span> },
    { key: 'action', label: '', render: (row) => <span className="row-actions"><button className="table-action" onClick={() => setEditor(row)}><Pencil size={14} />编辑</button>{row.status === 'ACTIVE' && <button className="table-action danger" onClick={() => setDeleting(row)}><Trash2 size={14} />停用</button>}</span> },
  ];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = formObject(event.currentTarget);
    save.mutate({ id: editor === 'new' || !editor ? undefined : editor.id, body });
  }

  const editing = editor !== 'new' ? editor : null;
  return <div className="page-enter">
    <PageHeader eyebrow="系统管理 / 业务人员" title="PM 管理" description="维护业务资料中的项目经理，不包含登录账号和密码。" action={<button className="button primary" onClick={() => setEditor('new')}><Plus size={17} />新增 PM</button>} />
    <div className="toolbar"><SearchBar value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="搜索姓名或部门" /><span className="result-count">{managers.data?.total ?? 0} 位 PM</span></div>
    <section className="panel table-panel">{managers.isLoading ? <LoadingState /> : managers.error ? <ErrorState error={managers.error} /> : <><DataTable columns={columns} rows={managers.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={managers.data?.total ?? 0} onPageChange={setPage} /></>}</section>

    <Modal open={Boolean(editor)} onClose={() => setEditor(null)} title={editing ? '编辑 PM' : '新增 PM'} description={editing ? '姓名变更会同步到已关联项目。' : '新增后可在项目、机构和业务资料中选择。'} size="large">
      <form className="form-grid" onSubmit={submit} key={editing?.id ?? 'new'}>
        <Field label="姓名"><Input name="displayName" required maxLength={100} defaultValue={editing?.displayName} /></Field>
        <Field label="所属部门"><Input name="department" maxLength={100} defaultValue={editing?.department} /></Field>
        {editing && <Field label="账号状态"><Select name="status" defaultValue={editing.status}><option value="ACTIVE">正常</option><option value="INACTIVE">已停用</option></Select></Field>}
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={() => setEditor(null)} submitLabel={editing ? '保存修改' : '创建 PM'} /></div>
      </form>
    </Modal>

    <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="停用 PM" description="历史业务记录不会被删除。">
      <div className="confirm-content">
        <p>停用后，<strong>{deleting?.displayName}</strong> 不会再出现在业务表单的 PM 下拉框中。</p>
        {remove.error && <p className="form-error">{remove.error.message}</p>}
        <div className="form-actions"><button type="button" className="button ghost" onClick={() => setDeleting(null)}>取消</button><button type="button" className="button danger" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>{remove.isPending ? '正在停用…' : '确认停用'}</button></div>
      </div>
    </Modal>
  </div>;
}
