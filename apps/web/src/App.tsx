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
              <Route
                path="/student/courses/:courseId/presentations"
                element={
                  <RequireRole roles={['student']}>
                    <StudentPresentationsPage />
                  </RequireRole>
                }
              />
              <Route
                path="/student/courses/:courseId/assignments"
                element={
                  <RequireRole roles={['student']}>
                    <StudentAssignmentsPage />
                  </RequireRole>
                }
              />
              <Route
                path="/student/courses/:courseId/assignments/:assignmentId"
                element={
                  <RequireRole roles={['student']}>
                    <StudentAssignmentDetailPage />
                  </RequireRole>
                }
              />
              <Route
                path="/student/courses/:courseId/discussion"
                element={
                  <RequireRole roles={['student']}>
                    <StudentDiscussionPage />
                  </RequireRole>
                }
              />
              <Route
                path="/student/courses/:courseId/discussion/:topicId"
                element={
                  <RequireRole roles={['student']}>
                    <StudentDiscussionTopicPage />
                  </RequireRole>
                }
              />
              <Route
                path="/student/courses/:courseId/quizzes"
                element={
                  <RequireRole roles={['student']}>
                    <StudentQuizzesPage />
                  </RequireRole>
                }
              />
              <Route
                path="/student/courses/:courseId/quizzes/:quizId"
                element={
                  <RequireRole roles={['student']}>
                    <StudentQuizRunnerPage />
                  </RequireRole>
                }
              />
              <Route
                path="/student/courses/:courseId/attendance"
                element={
                  <RequireRole roles={['student']}>
                    <StudentAttendancePage />
                  </RequireRole>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
            <Route
              path="/student/courses/:courseId/presentations/:presentationId"
              element={
                <RequireRole roles={['student']}>
                  <StudentPresentationViewerPage />
                </RequireRole>
              }
            />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
