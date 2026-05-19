import { Routes, Route } from 'react-router-dom';
import { PageHeader } from '@/components/public/PageHeader';
import { SectionBand } from '@/components/public/SectionBand';

export function LegalRoutes(): JSX.Element {
  return (
    <Routes>
      <Route
        path="*"
        element={
          <SectionBand>
            <PageHeader title="Legal" subtitle="Coming soon." />
          </SectionBand>
        }
      />
    </Routes>
  );
}
