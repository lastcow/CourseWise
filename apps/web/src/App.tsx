import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { RequireRole } from '@/components/RequireRole';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/toast';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { AdminCoursesPage } from '@/pages/admin/AdminCoursesPage';
import { AdminInvitationCodesPage } from '@/pages/admin/AdminInvitationCodesPage';
import { TeacherCoursesPage } from '@/pages/teacher/TeacherCoursesPage';
import { TeacherNewCoursePage } from '@/pages/teacher/TeacherNewCoursePage';
import { TeacherCourseShell } from '@/pages/teacher/TeacherCourseShell';
import { TeacherCourseSettings } from '@/pages/teacher/TeacherCourseSettings';
import { TeacherModulesPage } from '@/pages/teacher/TeacherModulesPage';
import { TeacherMaterialsPage } from '@/pages/teacher/TeacherMaterialsPage';
import { StudentCoursesPage } from '@/pages/student/StudentCoursesPage';
import { StudentCourseOverviewPage } from '@/pages/student/StudentCourseOverviewPage';
import { StudentMaterialsPage } from '@/pages/student/StudentMaterialsPage';

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route
                path="/admin/courses"
                element={
                  <RequireRole roles={['admin']}>
                    <AdminCoursesPage />
                  </RequireRole>
                }
              />
              <Route
                path="/admin/invitation-codes"
                element={
                  <RequireRole roles={['admin']}>
                    <AdminInvitationCodesPage />
                  </RequireRole>
                }
              />
              <Route
                path="/teacher/courses"
                element={
                  <RequireRole roles={['admin', 'teacher']}>
                    <TeacherCoursesPage />
                  </RequireRole>
                }
              />
              <Route
                path="/teacher/courses/new"
                element={
                  <RequireRole roles={['admin', 'teacher']}>
                    <TeacherNewCoursePage />
                  </RequireRole>
                }
              />
              <Route
                path="/teacher/courses/:courseId"
                element={
                  <RequireRole roles={['admin', 'teacher']}>
                    <TeacherCourseShell />
                  </RequireRole>
                }
              >
                <Route index element={<TeacherCourseSettings />} />
                <Route path="settings" element={<TeacherCourseSettings />} />
                <Route path="modules" element={<TeacherModulesPage />} />
                <Route path="materials" element={<TeacherMaterialsPage />} />
              </Route>
              <Route
                path="/student/courses"
                element={
                  <RequireRole roles={['student']}>
                    <StudentCoursesPage />
                  </RequireRole>
                }
              />
              <Route
                path="/student/courses/:courseId"
                element={
                  <RequireRole roles={['student']}>
                    <StudentCourseOverviewPage />
                  </RequireRole>
                }
              />
              <Route
                path="/student/courses/:courseId/materials"
                element={
                  <RequireRole roles={['student']}>
                    <StudentMaterialsPage />
                  </RequireRole>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
