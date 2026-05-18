import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/authContext';
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { TeacherDashboardPage } from '@/pages/teacher/TeacherDashboardPage';
import { StudentDashboardPage } from '@/pages/student/StudentDashboardPage';

export function DashboardPage(): JSX.Element {
  const { auth } = useAuth();
  if (!auth) {
    return <Navigate to="/login" replace />;
  }
  if (auth.user.role === 'admin') return <AdminDashboardPage />;
  if (auth.user.role === 'teacher') return <TeacherDashboardPage />;
  return <StudentDashboardPage />;
}
