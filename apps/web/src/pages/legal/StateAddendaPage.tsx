import { Link } from 'react-router-dom';
import { LegalPageHeader } from '@/components/legal/LegalPageHeader';

export function StateAddendaPage(): JSX.Element {
  return (
    <>
      <LegalPageHeader
        title="State Addenda"
        summary="State-specific student-privacy commitments that supplement the master agreement between CourseWise LLC and your institution."
        lastUpdated="2026-05-29"
        version="v1.0"
      />

      <p>
        The base CourseWise agreement is written against FERPA and our
        general security and privacy commitments. Several states impose
        additional duties on vendors who handle K-12 student data. This
        page summarizes how those duties apply to CourseWise. The
        controlling text in any conflict is the executed agreement with
        your institution, not this summary.
      </p>

      <nav className="not-prose my-6 flex flex-wrap gap-2 text-sm">
        <a href="#california" className="rounded-md border border-ink/15 px-3 py-1 font-medium text-ink/80 hover:border-evergreen/40 hover:bg-evergreen-100 hover:text-evergreen">California</a>
        <a href="#new-york" className="rounded-md border border-ink/15 px-3 py-1 font-medium text-ink/80 hover:border-evergreen/40 hover:bg-evergreen-100 hover:text-evergreen">New York</a>
        <a href="#illinois" className="rounded-md border border-ink/15 px-3 py-1 font-medium text-ink/80 hover:border-evergreen/40 hover:bg-evergreen-100 hover:text-evergreen">Illinois</a>
        <a href="#colorado" className="rounded-md border border-ink/15 px-3 py-1 font-medium text-ink/80 hover:border-evergreen/40 hover:bg-evergreen-100 hover:text-evergreen">Colorado</a>
        <a href="#connecticut" className="rounded-md border border-ink/15 px-3 py-1 font-medium text-ink/80 hover:border-evergreen/40 hover:bg-evergreen-100 hover:text-evergreen">Connecticut</a>
      </nav>

      <h2 id="california">California</h2>
      <p>
        For California local educational agencies, CourseWise is operated
        consistent with the Student Online Personal Information
        Protection Act (SOPIPA, Cal. Bus. & Prof. Code §§ 22584 et seq.)
        and the disclosure and contract requirements of Cal. Ed. Code §
        49073.1. We do not use covered student information to target
        advertising, do not build non-educational profiles of students,
        and do not sell or rent student information. We use student
        information only for the K-12 purposes authorized by
        your institution, maintain administrative, physical, and
        technical safeguards described in our <Link to="/legal/security">Security</Link>{' '}
        statement, and on the institution's request will delete student
        records that the institution has the authority to remove.
      </p>

      <h2 id="new-york">New York</h2>
      <p>
        For New York public school districts and BOCES, CourseWise is
        operated consistent with New York Education Law § 2-d and 8
        NYCRR Part 121 ("Ed Law 2-d"). We confirm that personally
        identifiable information from student records will not be sold or
        released for commercial or marketing purposes; that parents,
        eligible students, teachers, and principals may request
        information about how data is stored and protected; that data is
        encrypted in transit and at rest using industry-standard methods;
        and that we will notify the district of any unauthorized release
        without unreasonable delay. The district's Parents' Bill of
        Rights and CourseWise-specific supplemental information are
        published by your institution as required by the statute.
      </p>

      <h2 id="illinois">Illinois</h2>
      <p>
        For Illinois K-12 school districts, CourseWise is operated
        consistent with the Student Online Personal Protection Act
        (SOPPA, 105 ILCS 85). We act on the school district's
        instructions, treat covered information as belonging to the
        district, and use it only to provide the contracted Service. We
        do not sell covered information, do not use it for targeted
        advertising, and do not create non-educational profiles. On
        termination, or at the district's request, we delete or return
        covered information within the timeframe agreed in the contract,
        and we list the categories of covered information and the
        subprocessors that touch it at{' '}
        <Link to="/legal/subprocessors">/legal/subprocessors</Link>, as
        SOPPA contemplates the district publishing.
      </p>

      <h2 id="colorado">Colorado</h2>
      <p>
        For Colorado school districts, CourseWise is operated consistent
        with the Student Data Transparency and Security Act (C.R.S. §§
        22-16-101 et seq., commonly "HB 16-1423"). We are a "School
        Service Contract Provider": we use Student Personally
        Identifiable Information only for the purposes authorized by
        your institution, maintain a comprehensive information
        security program, do not knowingly retain Student PII beyond the
        contract term except as required by law, and do not sell Student
        PII or use it to engage in targeted advertising. We make our
        data-use, security, and subprocessor information available so
        that the district can satisfy its own transparency-posting
        obligations under the statute.
      </p>

      <h2 id="connecticut">Connecticut</h2>
      <p>
        For Connecticut local and regional boards of education,
        CourseWise is operated consistent with Conn. Gen. Stat. § 10-234aa
        through § 10-234dd. We will enter into the form of student-data
        privacy agreement required by the board, will not use student
        information beyond the purposes authorized by the board, will
        maintain reasonable security procedures appropriate to the
        sensitivity of the information, and will notify the board of a
        security breach affecting student information without
        unreasonable delay. We support the board's public-posting and
        parent-notification obligations by providing the contract
        information the statute requires it to disclose.
      </p>

      <h2>Contact</h2>
      <p>
        To request a state-specific addendum, to ask how a given
        commitment applies in your jurisdiction, or to submit a records
        request, please use our{' '}
        <Link to="/legal/data-requests">Data Requests page</Link>.
      </p>
    </>
  );
}
