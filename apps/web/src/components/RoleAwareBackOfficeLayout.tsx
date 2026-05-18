import { Navigate, useLocation } from 'react-router-dom';
import { BackOfficeLayout } from '@/components/BackOfficeLayout';
import { useAuth } from '@/lib/authContext';

export function RoleAwareBackOfficeLayout(): JSX.Element {
  const { auth } = useAuth();
  const location = useLocation();
  if (!auth) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <BackOfficeLayout role={auth.user.role} />;
}
