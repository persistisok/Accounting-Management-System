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
import { DonationReceiptsPage } from './pages/DonationReceiptsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';

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
        <Route path="banking" element={<Navigate to="/banking/support-income" replace />} />
        <Route path="banking/support-income" element={<ModuleAccess resource="BANKING"><BankingPage key="support-income" fundingCategory="SUPPORT_RECEIPT" /></ModuleAccess>} />
        <Route path="banking/member-dues" element={<ModuleAccess resource="BANKING"><BankingPage key="member-dues" fundingCategory="MEMBER_DUE" /></ModuleAccess>} />
        <Route path="banking/execution-payment" element={<ModuleAccess resource="BANKING"><BankingPage key="execution-payment" fundingCategory="EXECUTION_PAYMENT" /></ModuleAccess>} />
        <Route path="banking/expert-fee" element={<ModuleAccess resource="BANKING"><BankingPage key="expert-fee" fundingCategory="EXPERT_FEE" /></ModuleAccess>} />
        <Route path="invoices" element={<Navigate to="/invoices/support-income" replace />} />
        <Route path="invoices/support-income" element={<ModuleAccess resource="INVOICES"><InvoicesPage key="support-income" category="SUPPORT_RECEIPT_ISSUED" /></ModuleAccess>} />
        <Route path="invoices/member-dues" element={<ModuleAccess resource="INVOICES"><InvoicesPage key="member-dues" category="MEMBER_DUE_ISSUED" /></ModuleAccess>} />
        <Route path="invoices/execution-payment" element={<ModuleAccess resource="INVOICES"><InvoicesPage key="execution-payment" category="EXECUTION_PAYMENT_RECEIVED" /></ModuleAccess>} />
        <Route path="invoices/expert-fee" element={<ModuleAccess resource="INVOICES"><InvoicesPage key="expert-fee" category="EXPERT_FEE_RECEIVED" /></ModuleAccess>} />
        <Route path="donation-receipts" element={<ModuleAccess resource="DONATION_RECEIPTS"><DonationReceiptsPage /></ModuleAccess>} />
        <Route path="supporters" element={<ModuleAccess resource="SUPPORTERS"><OrganizationsPage roleType="SUPPORTER" /></ModuleAccess>} />
        <Route path="executors" element={<ModuleAccess resource="EXECUTORS"><OrganizationsPage roleType="EXECUTOR" /></ModuleAccess>} />
        <Route path="experts" element={<ModuleAccess resource="EXPERTS"><ExpertsPage /></ModuleAccess>} />
        <Route path="members" element={<Navigate to="/members/committees" replace />} />
        <Route path="members/committees" element={<ModuleAccess resource="MEMBERS"><MembersPage key="committees" view="committees" /></ModuleAccess>} />
        <Route path="members/list" element={<ModuleAccess resource="MEMBERS"><MembersPage key="members" view="members" /></ModuleAccess>} />
        <Route path="project-managers" element={<SystemAdminOnly><ProjectManagersPage /></SystemAdminOnly>} />
        <Route path="accounts" element={<SystemAdminOnly><AccountsPage /></SystemAdminOnly>} />
        <Route path="audit-logs" element={<SystemAdminOnly><AuditLogsPage /></SystemAdminOnly>} />
        <Route path="no-access" element={<NoAccessPage />} />
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
