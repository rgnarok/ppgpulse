import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './lib/auth';
import { can, visibleNav } from './lib/permissions';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import InterviewsPage from './pages/InterviewsPage';
import HdisPage from './pages/HdisPage';
import MyTeamPage from './pages/MyTeamPage';
import ProfilePage from './pages/ProfilePage';
import UsersPage from './pages/admin/UsersPage';
import RolesPage from './pages/admin/RolesPage';
import HierarchyPage from './pages/admin/HierarchyPage';
import ClientsPage from './pages/admin/ClientsPage';

function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>{children}</div>
  );
}

function Protected({
  section,
  capability = 'view',
  children,
}: {
  section?: string;
  capability?: string;
  children: ReactNode;
}) {
  const { me, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();
  if (isLoading) return <FullPageMessage>Loading…</FullPageMessage>;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  if (section && !can(me, section, capability)) {
    const fallback = visibleNav(me ?? null)[0];
    return <Navigate to={fallback ? fallback.path : '/profile'} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated } = useAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          <Protected section="home">
            <HomePage />
          </Protected>
        }
      />
      <Route
        path="/interviews"
        element={
          <Protected section="interviews">
            <InterviewsPage />
          </Protected>
        }
      />
      <Route
        path="/hdis"
        element={
          <Protected section="hdis">
            <HdisPage />
          </Protected>
        }
      />
      <Route
        path="/hdis/:jdId"
        element={
          <Protected section="hdis">
            <HdisPage />
          </Protected>
        }
      />
      <Route
        path="/team"
        element={
          <Protected section="myteam">
            <MyTeamPage />
          </Protected>
        }
      />
      <Route
        path="/profile"
        element={
          <Protected section="profile">
            <ProfilePage />
          </Protected>
        }
      />
      <Route
        path="/admin/users"
        element={
          <Protected section="users">
            <UsersPage />
          </Protected>
        }
      />
      <Route
        path="/admin/roles"
        element={
          <Protected section="roles">
            <RolesPage />
          </Protected>
        }
      />
      <Route
        path="/admin/hierarchy"
        element={
          <Protected section="hierarchy">
            <HierarchyPage />
          </Protected>
        }
      />
      <Route
        path="/admin/clients"
        element={
          <Protected section="hdis" capability="add">
            <ClientsPage />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
