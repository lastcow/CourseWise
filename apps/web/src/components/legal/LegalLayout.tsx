import { Outlet } from 'react-router-dom';
import { Container } from '@/components/public/Container';
import { SectionBand } from '@/components/public/SectionBand';
import { LegalSidebar } from './LegalSidebar';

export function LegalLayout(): JSX.Element {
  return (
    <>
      <SectionBand>
        <Container>
          <div className="grid gap-12 md:grid-cols-[220px_1fr]">
            <aside className="md:sticky md:top-24 md:self-start">
              <LegalSidebar />
            </aside>
            <article className="prose prose-zinc max-w-3xl prose-headings:scroll-mt-28 prose-h2:mt-12 prose-h2:text-2xl prose-h3:text-xl prose-a:text-violet-700">
              <Outlet />
            </article>
          </div>
        </Container>
      </SectionBand>
    </>
  );
}
