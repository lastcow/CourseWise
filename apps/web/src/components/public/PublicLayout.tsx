import { Outlet } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';
import { FooterMega } from './FooterMega';

export function PublicLayout(): JSX.Element {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <PublicHeader />
      <main>
        <Outlet />
      </main>
      <FooterMega />
    </div>
  );
}
