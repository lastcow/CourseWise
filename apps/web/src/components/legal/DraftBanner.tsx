const LEGAL_DRAFT = true; // flip to false when counsel signs off

export function DraftBanner(): JSX.Element | null {
  if (!LEGAL_DRAFT) return null;
  return (
    <div className="border-b border-amber-300 bg-amber-50 text-amber-900">
      <div className="mx-auto max-w-[1280px] px-6 py-2 text-xs md:px-10">
        <strong>Template — not legal advice.</strong> Edit before publishing. Have legal counsel review.
      </div>
    </div>
  );
}
