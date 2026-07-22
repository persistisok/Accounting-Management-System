import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, UserX } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { Field, FormActions, Input, SearchableSelect, Select } from '../components/FormControls';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_PAGE_SIZE, Pagination } from '../components/Pagination';
import { SearchBar } from '../components/SearchBar';
import { ErrorState, LoadingState } from '../components/States';
import { api, queryString } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formObject } from '../lib/form';
import type { ListResponse, ProjectManager, User } from '../lib/types';

type EditorState = User | 'new' | null;
type AccountRole = User['role'];

const roleLabels: Record<AccountRole, string> = {
  SYSTEM_ADMIN: '系统管理员',
  ADMIN: '普通管理员',
  GUEST: '访客',
};

export function AccountsPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<EditorState>(null);
  const [role, setRole] = useState<AccountRole>('GUEST');
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const accounts = useQuery({
    queryKey: ['accounts', q, page],
    queryFn: () => api.get<ListResponse<User>>(`/accounts${queryString({ q, page, pageSize: DEFAULT_PAGE_SIZE })}`),
  });
  const managers = useQuery({
    queryKey: ['project-manager-options'],
    queryFn: () => api.get<ProjectManager[]>('/project-managers/options'),
  });
  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Record<string, string> }) => id
      ? api.patch<User>(`/accounts/${id}`, body)
      : api.post<User>('/accounts', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setEditor(null);
    },
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete<User>(`/accounts/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setDeactivating(null);
    },
  });

  function openEditor(value: EditorState) {
    setEditor(value);
    setRole(value && value !== 'new' ? value.role : 'GUEST');
    save.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = formObject(event.currentTarget);
    if (!body.password) delete body.password;
    if (body.role === 'GUEST') body.projectManagerId = '';
    save.mutate({ id: editor === 'new' || !editor ? undefined : editor.id, body });
  }

  const editing = editor !== 'new' ? editor : null;
  const columns: TableColumn<User>[] = [
    { key: 'person', label: '账号使用人', render: (row) => <span className="pm-identity"><i>{row.displayName.slice(0, 1)}</i><span><strong>{row.displayName}</strong><small className="mono">@{row.username}</small></span></span> },
    { key: 'role', label: '账号类型', render: (row) => <span className={`status-chip ${row.role === 'GUEST' ? 'neutral' : row.role === 'SYSTEM_ADMIN' ? 'warn' : 'good'}`}>{roleLabels[row.role]}</span> },
    { key: 'pm', label: '绑定 PM', render: (row) => row.projectManager ? <span className="primary-cell"><strong>{row.projectManager.displayName}</strong><small>{row.projectManager.department || '未填写部门'}</small></span> : '—' },
    { key: 'status', label: '状态', render: (row) => <span className={`status-chip ${row.status === 'ACTIVE' ? 'good' : 'neutral'}`}>{row.status === 'ACTIVE' ? '正常' : '已停用'}</span> },
    { key: 'action', label: '', render: (row) => <span className="row-actions"><button className="table-action" onClick={() => openEditor(row)}><Pencil size={14} />编辑</button>{row.status === 'ACTIVE' && row.id !== user?.id && <button className="table-action danger" onClick={() => setDeactivating(row)}><UserX size={14} />停用</button>}</span> },
  ];

  return <div className="page-enter">
    <PageHeader eyebrow="系统管理 / 登录权限" title="账号管理" description="仅系统管理员可维护账号；普通管理员可编辑业务，访客仅可查看。" action={<button className="button primary" onClick={() => openEditor('new')}><Plus size={17} />新增账号</button>} />
    <div className="toolbar"><SearchBar value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="搜索姓名、用户名或绑定 PM" /><span className="result-count">{accounts.data?.total ?? 0} 个账号</span></div>
    <section className="panel table-panel">{accounts.isLoading ? <LoadingState /> : accounts.error ? <ErrorState error={accounts.error} /> : <><DataTable columns={columns} rows={accounts.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={accounts.data?.total ?? 0} onPageChange={setPage} /></>}</section>

    <Modal open={Boolean(editor)} onClose={() => setEditor(null)} title={editing ? '编辑账号' : '新增账号'} description="姓名用于界面识别，登录用户名用于登录系统。" size="large">
      <form className="form-grid" onSubmit={submit} key={editing?.id ?? 'new'}>
        <Field label="姓名"><Input name="displayName" required maxLength={100} defaultValue={editing?.displayName} /></Field>
        <Field label="登录用户名"><Input name="username" required maxLength={64} autoComplete="off" defaultValue={editing?.username} /></Field>
        <Field label="账号类型"><Select name="role" value={role} disabled={editing?.id === user?.id} onChange={(event) => setRole(event.target.value as AccountRole)}><option value="SYSTEM_ADMIN">系统管理员（管理账号）</option><option value="ADMIN">普通管理员（可编辑）</option><option value="GUEST">访客（仅查看）</option></Select></Field>
        {role !== 'GUEST' && <Field label="绑定 PM" hint="可不绑定"><SearchableSelect name="projectManagerId" defaultValue={editing?.projectManagerId ?? ''} placeholder="不绑定 PM" searchPlaceholder="搜索 PM 姓名或部门" options={(managers.data ?? []).map((pm) => ({ value: pm.id, label: `${pm.displayName}${pm.department ? ` · ${pm.department}` : ''}` }))} /></Field>}
        {editing && <Field label="账号状态"><Select name="status" defaultValue={editing.status} disabled={editing.id === user?.id}><option value="ACTIVE">正常</option><option value="INACTIVE">已停用</option></Select></Field>}
        <Field label={editing ? '重置密码' : '初始密码'} hint={editing ? '留空表示不修改' : '至少 8 个字符'}><Input name="password" type="password" minLength={8} maxLength={100} required={!editing} autoComplete="new-password" /></Field>
        {save.error && <p className="form-error span-2">{save.error.message}</p>}
        <div className="span-2"><FormActions pending={save.isPending} onCancel={() => setEditor(null)} submitLabel={editing ? '保存修改' : '创建账号'} /></div>
      </form>
    </Modal>

    <Modal open={Boolean(deactivating)} onClose={() => setDeactivating(null)} title="停用账号" description="停用后将不能登录系统。">
      <div className="confirm-content">
        <p>确认停用 <strong>{deactivating?.displayName}</strong> 的账号 <span className="mono">@{deactivating?.username}</span>？</p>
        {deactivate.error && <p className="form-error">{deactivate.error.message}</p>}
        <div className="form-actions"><button type="button" className="button ghost" onClick={() => setDeactivating(null)}>取消</button><button type="button" className="button danger" disabled={deactivate.isPending} onClick={() => deactivating && deactivate.mutate(deactivating.id)}>{deactivate.isPending ? '正在停用…' : '确认停用'}</button></div>
      </div>
    </Modal>
  </div>;
}
