import {
  BookOpenText, BriefcaseBusiness, Building2, ChevronLeft, CircleGauge, FileSignature,
  Landmark, LogOut, Menu, ReceiptText, Search, ShieldCheck, UserRoundCog, UsersRound, X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const groups = [
  { label: '工作', items: [{ to: '/', label: '工作台', icon: CircleGauge }, { to: '/projects', label: '项目台账', icon: BriefcaseBusiness }] },
  { label: '业务台账', items: [
    { to: '/contracts', label: '合同台账', icon: FileSignature },
    { to: '/banking', label: '银行日记账', icon: Landmark },
    { to: '/invoices', label: '发票台账', icon: ReceiptText },
  ] },
  { label: '基础资料', items: [
    { to: '/supporters', label: '支持方库', icon: Building2 },
    { to: '/executors', label: '执行方库', icon: BookOpenText },
    { to: '/experts', label: '专家库', icon: ShieldCheck },
    { to: '/members', label: '会员库', icon: UsersRound },
  ] },
];

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const visibleGroups = user?.role === 'ADMIN'
    ? [...groups, { label: '系统管理', items: [{ to: '/project-managers', label: 'PM 管理', icon: UserRoundCog }] }]
    : groups;

  function globalSearch(event: React.FormEvent) {
    event.preventDefault();
    if (search.trim()) navigate(`/projects?q=${encodeURIComponent(search.trim())}`);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">账</span>
          <span><strong>项目账册</strong><small>业务数据中枢</small></span>
          <button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="关闭导航"><X size={19} /></button>
        </div>
        <nav>{visibleGroups.map((group) => (
          <section className="nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenuOpen(false)}>
                <Icon size={18} strokeWidth={1.8} /><span>{label}</span><ChevronLeft className="nav-arrow" size={14} />
              </NavLink>
            ))}
          </section>
        ))}</nav>
        <div className="sidebar-foot">
          <span className="user-avatar">{user?.displayName.slice(0, 1)}</span>
          <span><strong>{user?.displayName}</strong><small>{user?.role}</small></span>
          <button onClick={logout} aria-label="退出登录"><LogOut size={17} /></button>
        </div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="关闭导航遮罩" />}
      <div className="workspace">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="打开导航"><Menu size={20} /></button>
          <form className="global-search" onSubmit={globalSearch}>
            <Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索项目编码或名称" /><kbd>↵</kbd>
          </form>
          <div className="topbar-meta"><span className="live-dot" /> 数据实时汇总</div>
        </header>
        <main className="main-content"><Outlet /></main>
      </div>
    </div>
  );
}
