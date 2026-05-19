import { Routes, Route, Navigate } from 'react-router-dom';
import { LegalLayout } from '@/components/legal/LegalLayout';
import { PrivacyPage } from './PrivacyPage';
import { TermsPage } from './TermsPage';
import { FerpaPage } from './FerpaPage';
import { SubprocessorsPage } from './SubprocessorsPage';
import { CoppaPage } from './CoppaPage';
import { SecurityPage } from './SecurityPage';
import { DataRequestsPage } from './DataRequestsPage';
import { AccessibilityPage } from './AccessibilityPage';
import { CookiesPage } from './CookiesPage';
import { StateAddendaPage } from './StateAddendaPage';
import { DpaPage } from './DpaPage';
import { ResponsibleDisclosurePage } from './ResponsibleDisclosurePage';

export function LegalRoutes(): JSX.Element {
  return (
    <Routes>
      <Route element={<LegalLayout />}>
        <Route index element={<Navigate to="/legal/privacy" replace />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="ferpa" element={<FerpaPage />} />
        <Route path="subprocessors" element={<SubprocessorsPage />} />
        <Route path="coppa" element={<CoppaPage />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="data-requests" element={<DataRequestsPage />} />
        <Route path="accessibility" element={<AccessibilityPage />} />
        <Route path="cookies" element={<CookiesPage />} />
        <Route path="state-addenda" element={<StateAddendaPage />} />
        <Route path="dpa" element={<DpaPage />} />
        <Route path="responsible-disclosure" element={<ResponsibleDisclosurePage />} />
      </Route>
    </Routes>
  );
}
