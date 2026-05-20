import { useLocation } from 'react-router-dom';

const PUBLISHED_PATHS = new Set<string>([
  '/legal/privacy',
]);

export function DraftBanner(): JSX.Element | null {
  const { pathname } = useLocation();
  if (PUBLISHED_PATHS.has(pathname)) return null;
  return (
    <div className="border-b border-amber-300 bg-amber-50 text-amber-900">
      <div className="mx-auto max-w-[1280px] px-6 py-2 text-xs md:px-10">
        <strong>Template — not legal advice.</strong> Edit before publishing. Have legal counsel review.
      </div>
    </div>
  );
}
