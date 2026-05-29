import { Link } from 'react-router-dom';
import { LegalPageHeader } from '@/components/legal/LegalPageHeader';

export function AccessibilityPage(): JSX.Element {
  return (
    <>
      <LegalPageHeader
        title="Accessibility Statement"
        summary="How CourseWise LLC designs and tests CourseWise for users of assistive technology."
        lastUpdated="2026-05-29"
        version="v1.0"
      />

      <h2>Target standard</h2>
      <p>
        CourseWise targets conformance with the Web Content Accessibility
        Guidelines (WCAG) 2.1 at Level AA, which we treat as the working
        baseline for both K-12 and postsecondary deployments in the United
        States. This standard is the one referenced in Section 504 program
        access guidance, in Title II of the ADA, and in most state
        procurement requirements that apply to institutional buyers of
        educational software.
      </p>

      <h2>Current status</h2>
      <p>
        We have built the public marketing site, the authenticated student
        and teacher experiences, and the institutional administration views
        with semantic HTML, visible focus states, keyboard operability, and
        adjustable color and typography. The product runs on a current set
        of design primitives that produce consistent labels, headings, and
        landmarks. We test with screen readers (NVDA on Windows and
        VoiceOver on macOS and iOS) on each significant release and we
        verify color contrast against the 4.5:1 (normal text) and 3:1
        (large text) thresholds as part of our visual review.
      </p>

      <h2>Known gaps</h2>
      <p>
        CourseWise is in active development and we are honest about the
        items still on the list. Known gaps as of the date above include:
        (i) rich-text editing in some discussion contexts does not yet
        expose a full toolbar to screen readers; (ii) a small number of
        complex data tables in the teacher analytics views are operable but
        do not yet emit row and column headers in the ideal pattern; and
        (iii) certain AI-generated learning materials are produced by a
        model that may not always honor reading-level or alt-text hints in
        source documents — teachers can review and edit those outputs
        before publishing. We track these in our internal accessibility
        backlog and prioritize them alongside other quality work.
      </p>

      <h2>Feedback</h2>
      <p>
        If you encounter a barrier using CourseWise — a control you cannot
        reach with the keyboard, content your screen reader cannot read, a
        contrast or sizing issue, or anything else — please tell us. Use
        our <Link to="/legal/data-requests">Data Requests page</Link> or
        write directly through the general{' '}
        <Link to="/contact">contact form</Link>; either route is monitored
        and we will respond. Where reasonable we will provide an
        alternative means of access while we work on a fix.
      </p>
    </>
  );
}
