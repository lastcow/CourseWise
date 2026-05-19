import { Outlet } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';
import { FooterMega } from './FooterMega';

export function PublicLayout(): JSX.Element {
  return (
    <div className="min-h-screen bg-white text-[#0a0a0a]">
      <PublicHeader />
      <main>
        <Outlet />
      </main>
      <FooterMega />
    </div>
  );
}
