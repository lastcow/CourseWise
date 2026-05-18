import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { BackOfficeLayout } from '@/components/BackOfficeLayout';
import { RoleAwareBackOfficeLayout } from '@/components/RoleAwareBackOfficeLayout';
import { RequireRole } from '@/components/RequireRole';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/toast';
import { DashboardPage } from '@/pages/DashboardPage';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { TeacherAcceptInvitePage } from '@/pages/TeacherAcceptInvitePage';
import { SettingsApiTokensPage } from '@/pages/SettingsApiTokensPage';
import { AdminCoursesPage } from '@/pages/admin/AdminCoursesPage';
import { AdminInvitationCodesPage } from '@/pages/admin/AdminInvitationCodesPage';
import { AdminTeachersPage } from '@/pages/admin/AdminTeachersPage';
import { TeacherCoursesPage } from '@/pages/teacher/TeacherCoursesPage';
import { TeacherNewCoursePage } from '@/pages/teacher/TeacherNewCoursePage';
import { TeacherCourseSettings } from '@/pages/teacher/TeacherCourseSettings';
import { TeacherModulesPage } from '@/pages/teacher/TeacherModulesPage';
import { TeacherMaterialsPage } from '@/pages/teacher/TeacherMaterialsPage';
import { TeacherPresentationsPage } from '@/pages/teacher/TeacherPresentationsPage';
import { TeacherPresentationEditorPage } from '@/pages/teacher/TeacherPresentationEditorPage';
import { TeacherAssignmentsPage } from '@/pages/teacher/TeacherAssignmentsPage';
import { TeacherAssignmentFormPage } from '@/pages/teacher/TeacherAssignmentFormPage';
import { TeacherSubmissionsInboxPage } from '@/pages/teacher/TeacherSubmissionsInboxPage';
import { TeacherDiscussionPage } from '@/pages/teacher/TeacherDiscussionPage';
import { TeacherDiscussionTopicPage } from '@/pages/teacher/TeacherDiscussionTopicPage';
import { TeacherQuizzesPage } from '@/pages/teacher/TeacherQuizzesPage';
import { TeacherQuizEditorPage } from '@/pages/teacher/TeacherQuizEditorPage';
import { TeacherQuizAttemptsPage } from '@/pages/teacher/TeacherQuizAttemptsPage';
import { TeacherAttendancePage } from '@/pages/teacher/TeacherAttendancePage';
import { TeacherGradebookPage } from '@/pages/teacher/TeacherGradebookPage';
import { TeacherGradingPolicyPage } from '@/pages/teacher/TeacherGradingPolicyPage';
import { TeacherAlertsPage } from '@/pages/teacher/TeacherAlertsPage';
import { AdminAlertsPage } from '@/pages/admin/AdminAlertsPage';
import { StudentGradePage } from '@/pages/student/StudentGradePage';
import { StudentCoursesPage } from '@/pages/student/StudentCoursesPage';
import { StudentCourseOverviewPage } from '@/pages/student/StudentCourseOverviewPage';
import { StudentMaterialsPage } from '@/pages/student/StudentMaterialsPage';
import { StudentPresentationsPage } from '@/pages/student/StudentPresentationsPage';
import { StudentPresentationViewerPage } from '@/pages/student/StudentPresentationViewerPage';
import { StudentAssignmentsPage } from '@/pages/student/StudentAssignmentsPage';
import { StudentAssignmentDetailPage } from '@/pages/student/StudentAssignmentDetailPage';
import { StudentDiscussionPage } from '@/pages/student/StudentDiscussionPage';
import { StudentDiscussionTopicPage } from '@/pages/student/StudentDiscussionTopicPage';
import { StudentQuizzesPage } from '@/pages/student/StudentQuizzesPage';
import { StudentQuizRunnerPage } from '@/pages/student/StudentQuizRunnerPage';
import { StudentAttendancePage } from '@/pages/student/StudentAttendancePage';

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
              <Route path="/teacher/accept-invite" element={<TeacherAcceptInvitePage />} />
            </Route>
            <Route element={<RoleAwareBackOfficeLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/settings/api-tokens" element={<SettingsApiTokensPage />} />
            </Route>
            <Route element={<BackOfficeLayout role="student" />}>
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
                    <Outlet />
                  </RequireRole>
                }
              >
                <Route index element={<StudentCourseOverviewPage />} />
                <Route path="materials" element={<StudentMaterialsPage />} />
                <Route path="presentations" element={<StudentPresentationsPage />} />
                <Route path="assignments" element={<StudentAssignmentsPage />} />
                <Route path="assignments/:assignmentId" element={<StudentAssignmentDetailPage />} />
                <Route path="discussion" element={<StudentDiscussionPage />} />
                <Route path="discussion/:topicId" element={<StudentDiscussionTopicPage />} />
                <Route path="quizzes" element={<StudentQuizzesPage />} />
                <Route path="quizzes/:quizId" element={<StudentQuizRunnerPage />} />
                <Route path="attendance" element={<StudentAttendancePage />} />
                <Route path="grade" element={<StudentGradePage />} />
              </Route>
            </Route>
            <Route element={<BackOfficeLayout role="admin" />}>
              <Route
                path="/admin/alerts"
                element={
                  <RequireRole roles={['admin']}>
                    <AdminAlertsPage />
                  </RequireRole>
                }
              />
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
                path="/admin/teachers"
                element={
                  <RequireRole roles={['admin']}>
                    <AdminTeachersPage />
                  </RequireRole>
                }
              />
            </Route>
            <Route element={<BackOfficeLayout role="teacher" />}>
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
                    <Outlet />
                  </RequireRole>
                }
              >
                <Route index element={<TeacherCourseSettings />} />
                <Route path="settings" element={<TeacherCourseSettings />} />
                <Route path="modules" element={<TeacherModulesPage />} />
                <Route path="materials" element={<TeacherMaterialsPage />} />
                <Route path="presentations" element={<TeacherPresentationsPage />} />
                <Route path="assignments" element={<TeacherAssignmentsPage />} />
                <Route path="assignments/new" element={<TeacherAssignmentFormPage />} />
                <Route path="assignments/:assignmentId" element={<TeacherAssignmentFormPage />} />
                <Route
                  path="assignments/:assignmentId/submissions"
                  element={<TeacherSubmissionsInboxPage />}
                />
                <Route path="discussion" element={<TeacherDiscussionPage />} />
                <Route path="discussion/:topicId" element={<TeacherDiscussionTopicPage />} />
                <Route path="quizzes" element={<TeacherQuizzesPage />} />
                <Route path="quizzes/:quizId/attempts" element={<TeacherQuizAttemptsPage />} />
                <Route path="attendance" element={<TeacherAttendancePage />} />
                <Route path="gradebook" element={<TeacherGradebookPage />} />
                <Route path="grading-policy" element={<TeacherGradingPolicyPage />} />
                <Route path="alerts" element={<TeacherAlertsPage />} />
              </Route>
              <Route
                path="/teacher/courses/:courseId/quizzes/:quizId"
                element={
                  <RequireRole roles={['admin', 'teacher']}>
                    <TeacherQuizEditorPage />
                  </RequireRole>
                }
              />
              <Route
                path="/teacher/courses/:courseId/presentations/:presentationId"
                element={
                  <RequireRole roles={['admin', 'teacher']}>
                    <TeacherPresentationEditorPage />
                  </RequireRole>
                }
              />
            </Route>
            <Route
              path="/student/courses/:courseId/presentations/:presentationId"
              element={
                <RequireRole roles={['student']}>
                  <StudentPresentationViewerPage />
                </RequireRole>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
