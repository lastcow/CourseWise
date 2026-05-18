import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/authContext';

export function RequireRole({
  roles,
  children,
}: {
  roles: Array<'admin' | 'teacher' | 'student'>;
  children: ReactNode;
}): JSX.Element {
  const { auth } = useAuth();
  const location = useLocation();
  if (!auth) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!roles.includes(auth.user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
