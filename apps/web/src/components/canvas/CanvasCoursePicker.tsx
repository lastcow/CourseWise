import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { CanvasRemoteCourse } from '@coursewise/shared';
import { Label } from '@/components/ui/input';

function courseOptionLabel(c: CanvasRemoteCourse, t: TFunction): string {
  const parts = [c.name ?? c.courseCode ?? c.id];
  if (c.courseCode && c.courseCode !== c.name) parts.push(c.courseCode);
  if (c.term) parts.push(c.term);
  if (c.totalStudents != null) parts.push(t('canvas.pickerStudents', { count: c.totalStudents }));
  return parts.join(' · ');
}

interface CanvasCoursePickerProps {
  courses: CanvasRemoteCourse[];
  value: string;
  onChange: (id: string) => void;
  /** Keeps element ids unique when two pickers could coexist. */
  idPrefix?: string;
}

// Term-filtered Canvas course <select>, shared by the settings-page import
// flow and the per-course link flow.
export function CanvasCoursePicker({
  courses,
  value,
  onChange,
  idPrefix = 'canvas',
}: CanvasCoursePickerProps): JSX.Element {
  const { t } = useTranslation();
  const [termFilter, setTermFilter] = useState('all');

  // Distinct Canvas terms, newest-looking first (term names usually embed the
  // year, so a descending sort puts the current semester on top).
  const terms = useMemo(
    () =>
      [...new Set(courses.map((c) => c.term).filter((x): x is string => !!x))].sort((a, b) =>
        b.localeCompare(a),
      ),
    [courses],
  );
  const filteredCourses = useMemo(
    () => (termFilter === 'all' ? courses : courses.filter((c) => c.term === termFilter)),
    [courses, termFilter],
  );
  const onTermFilterChange = (next: string): void => {
    setTermFilter(next);
    const stillVisible = next === 'all' || courses.some((c) => c.id === value && c.term === next);
    if (!stillVisible) onChange('');
  };

  return (
    <>
      {terms.length > 1 ? (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-term`}>{t('canvas.termFilterLabel')}</Label>
          <select
            id={`${idPrefix}-term`}
            value={termFilter}
            onChange={(e) => onTermFilterChange(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">{t('canvas.termFilterAll')}</option>
            {terms.map((term) => (
              <option key={term} value={term}>
                {term}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-course`}>{t('canvas.pickerLabel')}</Label>
        <select
          id={`${idPrefix}-course`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">{t('canvas.pickerPlaceholder')}</option>
          {filteredCourses.map((c) => (
            <option key={c.id} value={c.id}>
              {courseOptionLabel(c, t)}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
