import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, UserX } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { DataTable, type TableColumn } from '../components/DataTable';
import { Field, FormActions, Input, SearchableMultiSelect, SearchableSelect, Select } from '../components/FormControls';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_PAGE_SIZE, Pagination } from '../components/Pagination';
import { SearchBar } from '../components/SearchBar';
import { ErrorState, LoadingState } from '../components/States';
import { api, queryString } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formObject } from '../lib/form';
import type { ListResponse, PermissionLevel, PermissionResource, ProjectManager, User } from '../lib/types';

type EditorState = User | 'new' | null;
type AccountRole = User['role'];

const roleLabels: Record<AccountRole, string> = {
  SYSTEM_ADMIN: '系统管理员',
  ADMIN: '运营管理员',
  PM: 'PM',
  EXTERNAL: '第三方外部',
};

const permissionResources: { resource: PermissionResource; label: string; review?: boolean }[] = [
  { resource: 'PROJECTS', label: '项目台账', review: true },
  { resource: 'CONTRACTS', label: '合同台账' },
  { resource: 'BANKING', label: '银行日记账' },
  { resource: 'INVOICES', label: '发票台账' },
  { resource: 'DONATION_RECEIPTS', label: '捐赠票据台账' },
  { resource: 'SUPPORTERS', label: '支持方库' },
  { resource: 'EXECUTORS', label: '执行方库' },
  { resource: 'EXPERTS', label: '专家库', review: true },
  { resource: 'MEMBERS', label: '会员库' },
];

type PermissionChoice = PermissionLevel | 'NONE';

export function AccountsPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<EditorState>(null);
  const [role, setRole] = useState<AccountRole>('EXTERNAL');
  const [permissionLevels, setPermissionLevels] = useState<Partial<Record<PermissionResource, PermissionChoice>>>({});
  const [projectIds, setProjectIds] = useState<string[]>([]);
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
  const projects = useQuery({
    queryKey: ['account-project-options'],
    queryFn: () => api.get<Array<{ id: string; projectCode: string; name: string }>>('/accounts/project-options'),
  });
  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Record<string, unknown> }) => id
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
    setRole(value && value !== 'new' ? value.role : 'EXTERNAL');
    setPermissionLevels(Object.fromEntries((value && value !== 'new' ? value.permissions ?? [] : []).map((permission) => [permission.resource, permission.level])));
    setProjectIds(value && value !== 'new' ? (value.projectScopes ?? []).map((scope) => scope.projectId) : []);
    save.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: Record<string, unknown> = formObject(event.currentTarget);
    if (!body.password) delete body.password;
    if (body.role !== 'PM') body.projectManagerId = '';
    body.projectIds = body.role === 'EXTERNAL' ? projectIds : [];
    body.permissions = body.role === 'ADMIN' || body.role === 'PM' || body.role === 'EXTERNAL' ? permissionResources.flatMap(({ resource }) => {
      const level = permissionLevels[resource] ?? 'NONE';
      return level === 'NONE' ? [] : [{ resource, level }];
    }) : [];
    save.mutate({ id: editor === 'new' || !editor ? undefined : editor.id, body });
  }

  const editing = editor !== 'new' ? editor : null;
  const columns: TableColumn<User>[] = [
    { key: 'person', label: '账号使用人', render: (row) => <span className="pm-identity"><span><strong>{row.displayName}</strong><small className="mono">@{row.username}</small></span></span> },
    { key: 'role', label: '账号类型', render: (row) => <span className={`status-chip ${row.role === 'EXTERNAL' ? 'neutral' : row.role === 'SYSTEM_ADMIN' ? 'warn' : 'good'}`}>{roleLabels[row.role]}</span> },
    { key: 'scope', label: '数据范围', render: (row) => row.projectManager ? <span className="primary-cell"><strong>{row.projectManager.displayName}</strong><small>{row.projectManager.department || '本人项目'}</small></span> : row.role === 'EXTERNAL' ? (row.projectScopes?.length ? `${row.projectScopes.length} 个指定项目` : '未指定项目') : '全部数据' },
    { key: 'permissions', label: '业务权限', render: (row) => row.role === 'SYSTEM_ADMIN' ? '全权限' : <span className="permission-summary">{row.permissions?.length ?? 0} 个模块</span> },
    { key: 'status', label: '状态', render: (row) => <span className={`status-chip ${row.status === 'ACTIVE' ? 'good' : 'neutral'}`}>{row.status === 'ACTIVE' ? '正常' : '已停用'}</span> },
    { key: 'action', label: '', render: (row) => <span className="row-actions"><button className="table-action" onClick={() => openEditor(row)}><Pencil size={14} />编辑</button>{row.status === 'ACTIVE' && row.id !== user?.id && <button className="table-action danger" onClick={() => setDeactivating(row)}><UserX size={14} />停用</button>}</span> },
  ];

  return <div className="page-enter">
    <PageHeader eyebrow="系统管理 / 登录权限" title="账号管理" description="系统管理员维护账号、逐模块权限以及 PM 或第三方的数据范围。" action={<button className="button primary" onClick={() => openEditor('new')}><Plus size={17} />新增账号</button>} />
    <div className="toolbar"><SearchBar value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="搜索姓名、用户名或绑定 PM" /><span className="result-count">{accounts.data?.total ?? 0} 个账号</span></div>
    <section className="panel table-panel">{accounts.isLoading ? <LoadingState /> : accounts.error ? <ErrorState error={accounts.error} /> : <><DataTable className="compact-default" columns={columns} rows={accounts.data?.items ?? []} rowKey={(row) => row.id} /><Pagination page={page} total={accounts.data?.total ?? 0} onPageChange={setPage} /></>}</section>

    <Modal open={Boolean(editor)} onClose={() => setEditor(null)} title={editing ? '编辑账号' : '新增账号'} description="姓名用于界面识别，登录用户名用于登录系统。" size="large">
      <form className="form-grid" onSubmit={submit} key={editing?.id ?? 'new'}>
        <Field label="姓名"><Input name="displayName" required maxLength={100} defaultValue={editing?.displayName} /></Field>
        <Field label="登录用户名"><Input name="username" required maxLength={64} autoComplete="off" defaultValue={editing?.username} /></Field>
        <Field label="账号类型"><Select name="role" value={role} disabled={editing?.id === user?.id} onChange={(event) => setRole(event.target.value as AccountRole)}><option value="SYSTEM_ADMIN">系统管理员（全权限）</option><option value="ADMIN">运营管理员（逐模块配置）</option><option value="PM">PM（仅本人项目）</option><option value="EXTERNAL">第三方外部（项目可选）</option></Select></Field>
        {role === 'PM' && <Field label="绑定 PM" hint="PM 账号必须绑定，数据只显示该 PM 负责的范围。"><SearchableSelect name="projectManagerId" required defaultValue={editing?.projectManagerId ?? ''} placeholder="请选择 PM" searchPlaceholder="搜索 PM 姓名或部门" options={(managers.data ?? []).map((pm) => ({ value: pm.id, label: `${pm.displayName}${pm.department ? ` · ${pm.department}` : ''}` }))} /></Field>}
        {role === 'EXTERNAL' && <Field label="指定项目（可选）" span={2} hint="未指定时不能查看项目相关数据；可按项目编码搜索并多选。"><SearchableMultiSelect values={projectIds} onValuesChange={setProjectIds} placeholder="搜索项目编码或名称" options={(projects.data ?? []).map((project) => ({ value: project.id, label: `${project.projectCode} · ${project.name}`, searchText: project.projectCode }))} /></Field>}
        {(role === 'ADMIN' || role === 'PM' || role === 'EXTERNAL') && <fieldset className="permission-matrix span-2">
          <legend>业务模块权限</legend>
          <p>{role === 'ADMIN' ? '复核权限同时包含查看、录入和编辑权限。' : '录入上传包含查看、新增、模板导入和附件上传，不包含修改、作废、停用或删除。'}</p>
          <div>{permissionResources.map(({ resource, label }) => <label key={resource}><span>{label}</span><Select aria-label={`${label}权限`} value={permissionLevels[resource] ?? 'NONE'} onChange={(event) => setPermissionLevels((current) => ({ ...current, [resource]: event.target.value as PermissionChoice }))}><option value="NONE">无权限</option>{role === 'ADMIN' ? <><option value="VIEW">可查看</option><option value="EDIT">可编辑</option><option value="REVIEW">复核</option></> : <><option value="ENTRY">录入上传</option><option value="VIEW">仅查看</option></>}</Select></label>)}</div>
        </fieldset>}
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
