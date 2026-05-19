import { Link } from 'react-router-dom';
import { LegalPageHeader } from '@/components/legal/LegalPageHeader';

export function FerpaPage(): JSX.Element {
  return (
    <>
      <LegalPageHeader
        title="FERPA Statement"
        summary="How [COMPANY LEGAL NAME] operates as a school official under FERPA on behalf of [INSTITUTION NAME]."
        lastUpdated="2026-05-19"
        version="v0.1-draft"
      />

      <h2>School-official designation</h2>
      <p>
        CourseWise is sold to educational institutions in the United States
        that are subject to the Family Educational Rights and Privacy Act, 20
        U.S.C. § 1232g, and its implementing regulations at 34 C.F.R. Part 99
        ("FERPA"). [INSTITUTION NAME] designates [COMPANY LEGAL NAME] as a
        "school official" with a "legitimate educational interest" in the
        education records it makes available through the Service, under the
        exception at 34 C.F.R. § 99.31(a)(1)(i)(B). The institution retains
        direct control over the access, use, retention, and disclosure of
        those records.
      </p>

      <h2>Categories of records</h2>
      <p>
        The categories of education records that may pass through CourseWise
        depend on what the institution configures. They typically include:
      </p>
      <ul>
        <li>
          Roster information (student name, the institution's student ID,
          institution-assigned email, course or section enrollment).
        </li>
        <li>
          Coursework: reading assignments, AI-graded responses, discussion
          posts, attempts, scores, and progress indicators.
        </li>
        <li>
          Teacher-generated material (questions, rubrics, source documents)
          that may incidentally reference identifiable student work.
        </li>
        <li>Activity logs needed to operate, secure, and support the Service.</li>
      </ul>
      <p>
        We ask schools not to send sensitive categories that the Service does
        not need, such as Social Security numbers, government identifiers,
        health information, or financial information.
      </p>

      <h2>Use restrictions</h2>
      <p>
        We use education records only to provide the Service to [INSTITUTION
        NAME] under its instructions. We do not use education records for
        advertising, do not sell them, and do not use them to train
        third-party AI models. We may use information internally to monitor
        and improve the Service, but only in aggregated or de-identified form
        that does not reasonably identify any student. We do not redisclose
        education records except as permitted by FERPA, by the institution's
        written instructions, or by valid legal process.
      </p>

      <h2>Disclosure</h2>
      <p>
        When the institution authorizes a disclosure (for example, exporting a
        gradebook to the institution's student information system), we follow
        that instruction. When we are compelled by valid legal process to
        disclose records and the law permits, we notify the institution
        promptly so it can respond, object, or seek a protective order.
      </p>
      <p>
        We share education records with a small set of subprocessors that
        provide the infrastructure CourseWise runs on (hosting, database, AI
        provider). Each subprocessor is bound by a written agreement that
        restricts use of the data to the services it performs for us and
        prohibits further disclosure. The list is published at{' '}
        <Link to="/legal/subprocessors">/legal/subprocessors</Link>.
      </p>

      <h2>Retention and destruction</h2>
      <p>
        The institution sets the retention schedule for its education records.
        On termination of the agreement, or on the institution's written
        instruction during the term, we delete or return the records within
        the period agreed in the contract (typically thirty to ninety days),
        excluding backups that age out on their own schedule and information
        we are required by law to retain. Destruction follows our internal
        data-destruction procedure for both primary storage and managed
        backups.
      </p>

      <h2>Audits</h2>
      <p>
        On reasonable advance notice and subject to confidentiality,
        [INSTITUTION NAME] may audit our compliance with the FERPA
        commitments in our agreement, either by reviewing the documentation
        we maintain about our security and privacy program or by a third-party
        audit at the institution's cost. We respond to documented questions
        from school officials about specific records, access events, or
        subprocessor activity within a reasonable time.
      </p>

      <h2>Contact</h2>
      <p>
        Students and parents should direct FERPA-related requests (access,
        correction, hearing, or restriction of disclosure) to the
        institution's registrar or privacy officer, who is the appropriate
        party under FERPA. For questions about our role as a school official,
        or to file a request on behalf of an institution, please use our{' '}
        <Link to="/legal/data-requests">Data Requests page</Link>.
      </p>
    </>
  );
}
