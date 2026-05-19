import { Link } from 'react-router-dom';
import { LegalPageHeader } from '@/components/legal/LegalPageHeader';

export function DpaPage(): JSX.Element {
  return (
    <>
      <LegalPageHeader
        title="Data Processing Addendum"
        summary="The standard agreement [COMPANY LEGAL NAME] signs with institutions that need a written DPA for CourseWise."
        lastUpdated="2026-05-19"
        version="v0.1-draft"
      />

      <h2>Plain-language summary</h2>
      <p>
        When an institution buys CourseWise, the master services agreement
        sets the commercial terms and the Data Processing Addendum
        ("DPA") sets the privacy and security commitments that apply to
        information about students, staff, and other end users. The DPA
        is written as a single document: it covers our role as a FERPA
        school official, the security program in our{' '}
        <Link to="/legal/security">Security</Link> statement, the
        institution's instructions on use, the list of subprocessors at{' '}
        <Link to="/legal/subprocessors">/legal/subprocessors</Link>, and
        the breach-notification, audit, and termination terms most
        education buyers expect. State-specific provisions live in the{' '}
        <Link to="/legal/state-addenda">State Addenda</Link>.
      </p>

      <h2>What's in our standard DPA</h2>
      <p>
        The standard DPA contains the following sections, in roughly this
        order. (i) Definitions and scope, including the categories of
        personal information processed (education records, account
        information, AI generations, activity logs) and the role of each
        party. (ii) Authorization to process, limited to the documented
        purposes of providing the Service and the institution's written
        instructions, with explicit prohibitions on advertising, on
        selling or renting personal information, and on training
        third-party AI models on covered data. (iii) Confidentiality
        obligations on personnel with access to covered data.
        (iv) Security program commitments, by reference to the published
        Security statement, including encryption in transit and at rest,
        role-based access control, audit logging, vulnerability
        management, and an incident-response plan. (v) Subprocessor
        management, including the published list, prior-notice rights
        for material changes, and flow-down obligations.
        (vi) Data-subject rights support, including procedures for
        access, amendment, and deletion requests routed through the
        institution. (vii) Incident notification on a defined timeline.
        (viii) Audit rights, including documentation review and, on
        notice, third-party audit. (ix) Return or deletion of covered
        data on termination, within the contract-specified window.
        (x) Survival, governing law, and integration with the master
        agreement.
      </p>

      <h2>Customizations we support</h2>
      <p>
        Most institutions can sign our standard DPA as-is. We routinely
        accommodate, on request: a state-specific rider where the
        institution operates in a jurisdiction listed on the State
        Addenda page; a parents' bill of rights or similar transparency
        attachment for K-12 customers; a redline to incorporate the
        district's own student-data privacy agreement form (for example
        the National Data Privacy Agreement, NY Ed Law 2-d Supplemental
        Information, or a state SDPC exhibit); shorter retention windows
        on termination; and additional notification or reporting cadences
        for institutions with internal compliance reporting obligations.
        We do not customize the core security commitments downward — if
        a customization would weaken the program described in the
        Security statement we will say so and propose an alternative.
      </p>

      <h2>Request an executable copy</h2>
      <p>
        To receive the current standard DPA in editable form, or to
        propose redlines against your institution's preferred template,
        please contact us through the{' '}
        <Link to="/legal/data-requests">Data Requests page</Link> and
        choose "Other" as the requester type, or send a note via the
        general <Link to="/contact">contact form</Link>. Include the
        institution name and the buyer of record so we can route the
        document to the right counterparty. We aim to return a draft
        within five business days during the school year.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy or records questions outside the DPA process, please
        use our <Link to="/legal/data-requests">Data Requests page</Link>.
      </p>
    </>
  );
}
