import { type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useAuth } from './lib/auth';
import { AccountsPage } from './pages/AccountsPage';
import { BankingPage } from './pages/BankingPage';
import { ContractsPage } from './pages/ContractsPage';
import { ExpertsPage } from './pages/ExpertsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { LoginPage } from './pages/LoginPage';
import { MembersPage } from './pages/MembersPage';
import { OrganizationsPage } from './pages/OrganizationsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectManagersPage } from './pages/ProjectManagersPage';

function ProtectedLayout() {
  const { user } = useAuth();
  return user ? <AppShell /> : <Navigate to="/login" replace />;
}

function BusinessAdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === 'SYSTEM_ADMIN' || user?.role === 'ADMIN' ? children : <Navigate to="/projects" replace />;
}

function SystemAdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === 'SYSTEM_ADMIN' ? children : <Navigate to="/projects" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Navigate to="/projects" replace />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="contracts" element={<ContractsPage />} />
        <Route path="banking" element={<BankingPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="supporters" element={<OrganizationsPage roleType="SUPPORTER" />} />
        <Route path="executors" element={<OrganizationsPage roleType="EXECUTOR" />} />
        <Route path="experts" element={<ExpertsPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="project-managers" element={<BusinessAdminOnly><ProjectManagersPage /></BusinessAdminOnly>} />
        <Route path="accounts" element={<SystemAdminOnly><AccountsPage /></SystemAdminOnly>} />
      </Route>
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
