import { cleanup, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { CourseSummary } from '@coursewise/shared';
import { CourseCard } from './CourseCard';

afterEach(cleanup);

const base: CourseSummary = {
  id: 'c1',
  code: 'TEST-101',
  title: 'Test Course',
  description: 'A short description.',
  termLabel: 'Spring 2026',
  startDate: null,
  endDate: null,
  disableSubmissionsAfterEnd: false,
  meetingSlots: null,
  moduleCadence: null,
  status: 'active',
  gradingPolicy: null,
  archivedAt: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  bannerFileAssetId: null,
  bannerUrl: null,
  syllabusMd: null,
  syllabusFileAssetId: null,
  syllabusFileUrl: null,
  counts: { modules: 3, assignments: 5, presentations: 2, students: 18 },
};

function wrap(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('CourseCard', () => {
  it('renders title and all four count values', () => {
    wrap(<CourseCard course={base} hrefBase="/teacher/courses" />);
    expect(screen.getByText('Test Course')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('renders an img when bannerUrl is set', () => {
    wrap(
      <CourseCard
        course={{ ...base, bannerUrl: 'https://r2/banner.png' }}
        hrefBase="/teacher/courses"
      />,
    );
    const img = screen.getByRole('img', { name: /test course/i });
    expect(img).toHaveAttribute('src', 'https://r2/banner.png');
  });

  it('does not render an img when bannerUrl is null', () => {
    wrap(<CourseCard course={base} hrefBase="/teacher/courses" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders a link to hrefBase/:id', () => {
    wrap(<CourseCard course={base} hrefBase="/student/courses" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/student/courses/c1');
  });
});
