import { Link } from 'react-router-dom';
import { LegalPageHeader } from '@/components/legal/LegalPageHeader';

export function ResponsibleDisclosurePage(): JSX.Element {
  return (
    <>
      <LegalPageHeader
        title="Responsible Disclosure"
        summary="How security researchers can report vulnerabilities in CourseWise and what [COMPANY LEGAL NAME] commits in return."
        lastUpdated="2026-05-19"
        version="v0.1-draft"
      />

      <p>
        We appreciate the work of security researchers and treat
        good-faith reports as a gift. This page explains what is in
        scope, how to report, and the commitments we make to researchers
        who follow the policy.
      </p>

      <h2>Scope</h2>
      <p>
        In scope: the production CourseWise application at our primary
        domains, the public marketing site, our public API endpoints,
        and the authentication flow. Out of scope: third-party services
        we use as subprocessors (please report those directly to the
        service in question — our list is at{' '}
        <Link to="/legal/subprocessors">/legal/subprocessors</Link>),
        social-engineering attacks against [COMPANY LEGAL NAME] staff or
        customer staff, denial-of-service testing at any volume that
        would degrade service for real users, and physical security of
        any facility. Findings that are theoretical only — for example
        missing headers with no demonstrated impact — are welcome but
        will generally be triaged at a lower severity.
      </p>

      <h2>Reporting</h2>
      <p>
        Send reports to <code>security@[COMPANY LEGAL NAME]</code> (the
        live address is published on the Security page and in our
        security.txt file). Include a clear description of the
        vulnerability, the steps to reproduce it, the systems and
        accounts you touched, the impact you believe it has, and any
        proof-of-concept artifacts. PGP encryption is welcome but not
        required. Please use test accounts you create yourself; do not
        access, modify, or delete data belonging to other users or
        institutions beyond what is necessary to demonstrate the issue,
        and do not retain copies of any data you encountered. We will
        acknowledge receipt within two business days.
      </p>

      <h2>Safe harbor</h2>
      <p>
        If you make a good-faith effort to follow this policy — you
        report promptly, you do not access more data than necessary to
        demonstrate the issue, you do not exfiltrate or publish data,
        you do not use the vulnerability to harm any user or
        institution, and you give us a reasonable opportunity to fix the
        issue before public disclosure — [COMPANY LEGAL NAME] will not
        pursue or support a civil or criminal action against you for
        your research, will consider the research to be authorized
        access under the Computer Fraud and Abuse Act and analogous
        state laws, will not pursue claims under the Digital Millennium
        Copyright Act for your good-faith research, and will let any
        third party know your conduct was authorized if asked. This safe
        harbor does not cover actions that affect privacy or service for
        anyone other than yourself.
      </p>

      <h2>Response timeline</h2>
      <p>
        Our targets, once we have triaged a report: acknowledgement
        within two business days, an initial severity assessment within
        five business days, and a status update at least every two
        weeks. We aim to resolve critical issues within seven days, high
        severity within thirty days, and lower severity within ninety
        days. We will agree with the reporter on a public-disclosure
        timeline; the default is ninety days from acknowledgement, or
        sooner if the fix ships first and we agree the issue is safe to
        discuss.
      </p>

      <h2>Hall of fame</h2>
      <p>
        Researchers who report a confirmed vulnerability that we
        resolve are eligible, with their consent, to be listed here.
        We currently do not run a paid bug-bounty program, but we are
        glad to send swag, a written commendation, and a real
        thank-you. (Hall of fame entries will be added here once
        researchers have given us things to thank them for. Placeholder
        until then.)
      </p>

      <h2>Contact</h2>
      <p>
        Non-security questions belong on the{' '}
        <Link to="/contact">general contact form</Link>; FERPA records
        requests belong on the{' '}
        <Link to="/legal/data-requests">Data Requests page</Link>.
      </p>
    </>
  );
}
