import {
  BookOpenText, BriefcaseBusiness, Building2, ChartNoAxesCombined, ChevronLeft, FileSignature,
  KeyRound, Landmark, LogOut, Menu, ReceiptText, ScrollText, Search, ShieldCheck, UserRoundCog, UsersRound, X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BrandLogo } from './BrandLogo';
import { useAuth } from '../lib/auth';
import { hasPermission } from '../lib/permissions';
import type { PermissionResource } from '../lib/types';

interface NavItem {
  to?: string;
  label: string;
  icon: typeof BriefcaseBusiness;
  resource?: PermissionResource;
  children?: Array<{ to: string; label: string; resource: PermissionResource }>;
}

const groups: { label: string; items: NavItem[] }[] = [
  { label: '项目管理', items: [
    { to: '/project-overview', label: '项目全览', icon: ChartNoAxesCombined, resource: 'PROJECTS' },
    { to: '/projects', label: '项目台账', icon: BriefcaseBusiness, resource: 'PROJECTS' },
  ] },
  { label: '业务台账', items: [
    { to: '/contracts', label: '合同台账', icon: FileSignature, resource: 'CONTRACTS' },
    { label: '银行日记账', icon: Landmark, resource: 'BANKING', children: [
      { to: '/banking/support-income', label: '支持款收入', resource: 'BANKING' },
      { to: '/banking/member-dues', label: '会费收入', resource: 'BANKING' },
      { to: '/banking/execution-payment', label: '执行款支出', resource: 'BANKING' },
      { to: '/banking/expert-fee', label: '专家费支出', resource: 'BANKING' },
    ] },
    { label: '发票台账', icon: ReceiptText, resource: 'INVOICES', children: [
      { to: '/invoices/support-income', label: '支持款收入票据', resource: 'INVOICES' },
      { to: '/invoices/member-dues', label: '会费收入票据', resource: 'INVOICES' },
      { to: '/invoices/execution-payment', label: '执行款支出票据', resource: 'INVOICES' },
      { to: '/invoices/expert-fee', label: '专家费支出票据', resource: 'INVOICES' },
      { to: '/invoices/donation', label: '捐赠票据', resource: 'DONATION_RECEIPTS' },
    ] },
  ] },
  { label: '基础资料', items: [
    { to: '/supporters', label: '支持方库', icon: Building2, resource: 'SUPPORTERS' },
    { to: '/executors', label: '执行方库', icon: BookOpenText, resource: 'EXECUTORS' },
    { to: '/experts', label: '专家库', icon: ShieldCheck, resource: 'EXPERTS' },
    { label: '会员库', icon: UsersRound, resource: 'MEMBERS', children: [
      { to: '/members/committees', label: '专委会', resource: 'MEMBERS' },
      { to: '/members/list', label: '会员', resource: 'MEMBERS' },
    ] },
  ] },
];

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openNavParent, setOpenNavParent] = useState('');
  const [search, setSearch] = useState('');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const systemItems: NavItem[] = user?.role === 'SYSTEM_ADMIN'
    ? [
      { to: '/project-managers', label: 'PM 管理', icon: UserRoundCog },
      { to: '/accounts', label: '账号管理', icon: KeyRound },
      { to: '/audit-logs', label: '操作日志', icon: ScrollText },
    ]
    : [];
  const businessGroups = groups
    .map((group) => ({ ...group, items: group.items
      .map((item) => item.children ? { ...item, children: item.children.filter((child) => hasPermission(user, child.resource, 'VIEW')) } : item)
      .filter((item) => item.children ? item.children.length > 0 : item.resource && hasPermission(user, item.resource, 'VIEW')) }))
    .filter((group) => group.items.length);
  const visibleGroups = systemItems.length ? [...businessGroups, { label: '系统管理', items: systemItems }] : businessGroups;

  function globalSearch(event: React.FormEvent) {
    event.preventDefault();
    if (search.trim()) navigate(`/projects?q=${encodeURIComponent(search.trim())}`);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <BrandLogo />
          <span><strong>PMS</strong><small>项目管理系统</small></span>
          <button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="关闭导航"><X size={19} /></button>
        </div>
        <nav>{visibleGroups.map((group) => (
          <section className="nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map(({ to, label, icon: Icon, children }) => children ? <div className={`nav-parent${openNavParent === label ? ' open' : ''}`} key={label}>
              <button type="button" className="nav-parent-label" aria-expanded={openNavParent === label} onClick={() => setOpenNavParent((open) => open === label ? '' : label)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span><ChevronLeft className="nav-parent-arrow" size={14} /></button>
              {openNavParent === label && <div className="nav-children">{children.map((child) => <NavLink key={child.to} to={child.to} onClick={() => setMenuOpen(false)}><span>{child.label}</span><ChevronLeft className="nav-arrow" size={13} /></NavLink>)}</div>}
            </div> : <NavLink key={to} to={to!} onClick={() => setMenuOpen(false)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span><ChevronLeft className="nav-arrow" size={14} />
            </NavLink>)}
          </section>
        ))}</nav>
        <div className="sidebar-foot">
          <span><strong>{user?.displayName}</strong><small>{user?.role === 'SYSTEM_ADMIN' ? '系统管理员' : user?.role === 'ADMIN' ? '运营管理员' : user?.role === 'PM' ? 'PM' : '第三方外部'}</small></span>
          <button onClick={logout} aria-label="退出登录"><LogOut size={17} /></button>
        </div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="关闭导航遮罩" />}
      <div className="workspace">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="打开导航"><Menu size={20} /></button>
          {hasPermission(user, 'PROJECTS', 'VIEW') && <form className="global-search" onSubmit={globalSearch}>
            <Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索项目编码或名称" /><kbd>↵</kbd>
          </form>}
          <div className="topbar-meta"><span className="live-dot" /> 数据实时汇总</div>
        </header>
        <main className="main-content"><Outlet /></main>
      </div>
    </div>
  );
}
