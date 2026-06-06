import { cn } from '@/lib/utils';

/** The CourseWise monogram — an ink tile with a paper "C" and an evergreen tick.
 *  Matches the favicon so the mark reads the same in-app and in the browser tab. */
export function BrandMark({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('h-7 w-7', className)}
      role="img"
      aria-label="CourseWise"
    >
      <rect width="32" height="32" rx="7" fill="#15140F" />
      <path
        d="M21 10.2 A 8.2 8.2 0 1 0 21 21.8"
        fill="none"
        stroke="#FBFAF7"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="22.4" cy="16" r="1.9" fill="#2F5D50" />
    </svg>
  );
}
