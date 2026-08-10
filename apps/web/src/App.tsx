import { type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useAuth } from './lib/auth';
import { defaultPath, hasPermission } from './lib/permissions';
import type { PermissionResource } from './lib/types';
import { AccountsPage } from './pages/AccountsPage';
import { BankingPage } from './pages/BankingPage';
import { ContractsPage } from './pages/ContractsPage';
import { ExpertsPage } from './pages/ExpertsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { LoginPage } from './pages/LoginPage';
import { MembersPage } from './pages/MembersPage';
import { OrganizationsPage } from './pages/OrganizationsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectOverviewPage } from './pages/ProjectOverviewPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectManagersPage } from './pages/ProjectManagersPage';

function ProtectedLayout() {
  const { user } = useAuth();
  return user ? <AppShell /> : <Navigate to="/login" replace />;
}

function ModuleAccess({ resource, children }: { resource: PermissionResource; children: ReactNode }) {
  const { user } = useAuth();
  return hasPermission(user, resource, 'VIEW') ? children : <Navigate to={defaultPath(user)} replace />;
}

function SystemAdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === 'SYSTEM_ADMIN' ? children : <Navigate to={defaultPath(user)} replace />;
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={defaultPath(user)} replace />;
}

function NoAccessPage() {
  return <div className="panel empty-state"><strong>暂无可访问模块</strong><p>请联系系统管理员配置账号权限。</p></div>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<HomeRedirect />} />
        <Route path="project-overview" element={<ModuleAccess resource="PROJECTS"><ProjectOverviewPage /></ModuleAccess>} />
        <Route path="projects" element={<ModuleAccess resource="PROJECTS"><ProjectsPage /></ModuleAccess>} />
        <Route path="projects/:id" element={<ModuleAccess resource="PROJECTS"><ProjectDetailPage /></ModuleAccess>} />
        <Route path="contracts" element={<ModuleAccess resource="CONTRACTS"><ContractsPage /></ModuleAccess>} />
        <Route path="banking" element={<ModuleAccess resource="BANKING"><BankingPage /></ModuleAccess>} />
        <Route path="invoices" element={<ModuleAccess resource="INVOICES"><InvoicesPage /></ModuleAccess>} />
        <Route path="supporters" element={<ModuleAccess resource="SUPPORTERS"><OrganizationsPage roleType="SUPPORTER" /></ModuleAccess>} />
        <Route path="executors" element={<ModuleAccess resource="EXECUTORS"><OrganizationsPage roleType="EXECUTOR" /></ModuleAccess>} />
        <Route path="experts" element={<ModuleAccess resource="EXPERTS"><ExpertsPage /></ModuleAccess>} />
        <Route path="members" element={<ModuleAccess resource="MEMBERS"><MembersPage /></ModuleAccess>} />
        <Route path="project-managers" element={<SystemAdminOnly><ProjectManagersPage /></SystemAdminOnly>} />
        <Route path="accounts" element={<SystemAdminOnly><AccountsPage /></SystemAdminOnly>} />
        <Route path="no-access" element={<NoAccessPage />} />
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
