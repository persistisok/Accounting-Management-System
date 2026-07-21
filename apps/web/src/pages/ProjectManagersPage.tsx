import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { Field, FormActions, Input, Select } from '../components/FormControls';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { SearchBar } from '../components/SearchBar';
import { ErrorState, LoadingState } from '../components/States';
import { api, queryString } from '../lib/api';
import { formObject } from '../lib/form';
import type { ListResponse, User } from '../lib/types';

type EditorState = User | 'new' | null;

export function ProjectManagersPage() {
  const [q, setQ] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const queryClient = useQueryClient();
  const managers = useQuery({
    queryKey: ['project-managers', q],
    queryFn: () => api.get<ListResponse<User>>(`/project-managers${queryString({ q, pageSize: 100 })}`),
  });
  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Record<string, string> }) => id
      ? api.patch<User>(`/project-managers/${id}`, body)
      : api.post<User>('/project-managers', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-managers'] });
      void queryClient.invalidateQueries({ queryKey: ['project-manager-options'] });
      setEditor(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete<User>(`/project-managers/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-managers'] });
      void queryClient.invalidateQueries({ queryKey: ['project-manager-options'] });
      setDeleting(null);
    },
  });
  const columns: TableColumn<User>[] = [
    { key: 'name', label: 'PM', render: (row) => <span className="pm-identity"><i>{row.displayName.slice(0, 1)}</i><span><strong>{row.displayName}</strong><small className="mono">@{row.username}</small></span></span> },
    { key: 'department', label: '所属部门', render: (row) => row.department || '—' },
    { key: 'projects', label: '关联项目', className: 'number', render: (row) => <strong>{row._count?.projects ?? 0}</strong> },
    { key: 'status', label: '账号状态', render: (row) => <span className={`status-chip ${row.status === 'ACTIVE' ? 'good' : 'neutral'}`}>{row.status === 'ACTIVE' ? '正常' : '已停用'}</span> },
    { key: 'action', label: '', render: (row) => <span className="row-actions"><button className="table-action" onClick={() => setEditor(row)}><Pencil size={14} />编辑</button>{row.status === 'ACTIVE' && <button className="table-action danger" onClick={() => setDeleting(row)}><Trash2 size={14} />删除</button>}</span> },
  ];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = formObject(event.currentTarget);
    if (!body.password) delete body.password;
    save.mutate({ id: editor === 'new' || !editor ? undefined : editor.id, body });
  }

  const editing = editor !== 'new' ? editor : null;
  return <div className="page-enter">
    <PageHeader eyebrow="系统管理 / 人员权限" title="PM 管理" description="维护可被分配到项目、机构和业务资料的项目经理账号。" action={<button className="button primary" onClick={() => setEditor('new')}><Plus size={17} />新增 PM</button>} />
    <div className="toolbar"><SearchBar value={q} onChange={setQ} placeholder="搜索姓名、用户名或部门" /><span className="result-count">{managers.data?.total ?? 0} 位 PM</span></div>
    <section className="panel table-panel">{managers.isLoading ? <LoadingState /> : managers.error ? <ErrorState error={managers.error} /> : <DataTable columns={columns} rows={managers.data?.items ?? []} rowKey={(row) => row.id} />}</section>

    <Modal open={Boolean(editor)} onClose={() => setEditor(null)} title={editing ? '编辑 PM' : '新增 PM'} description={editing ? '姓名变更会同步到已关联项目；密码留空则保持不变。' : '创建后，该账号可登录系统并被分配为项目经理。'} size="large">
      <form className="form-grid" onSubmit={submit} key={editing?.id ?? 'new'}>
        <Field label="姓名"><Input name="displayName" required maxLength={100} defaultValue={editing?.displayName} /></Field>
        <Field label="登录用户名"><Input name="username" required minLength={3} maxLength={64} autoComplete="off" defaultValue={editing?.username} /></Field>
        <Field label="所属部门"><Input name="department" maxLength={100} defaultValue={editing?.department} /></Field>
        {editing && <Field label="账号状态"><Select name="status" defaultValue={editing.status}><option value="ACTIVE">正常</option><option value="INACTIVE">已停用</option></Select></Field>}
        <Field label={editing ? '重置密码' : '初始密码'} hint={editing ? '留空表示不修改密码' : '至少 8 个字符'} span={editing ? 2 : 1}><Input name="password" type="password" minLength={8} maxLength={128} required={!editing} autoComplete="new-password" /></Field>
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={() => setEditor(null)} submitLabel={editing ? '保存修改' : '创建 PM'} /></div>
      </form>
    </Modal>

    <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="删除 PM" description="历史业务记录不会被删除。">
      <div className="confirm-content">
        <p>删除后，<strong>{deleting?.displayName}</strong> 将被停用，不能继续登录，也不会再出现在项目经理下拉框中。</p>
        {remove.error && <p className="form-error">{remove.error.message}</p>}
        <div className="form-actions"><button type="button" className="button ghost" onClick={() => setDeleting(null)}>取消</button><button type="button" className="button danger" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>{remove.isPending ? '正在删除…' : '确认删除'}</button></div>
      </div>
    </Modal>
  </div>;
}
