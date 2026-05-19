import { Link } from 'react-router-dom';
import { LegalPageHeader } from '@/components/legal/LegalPageHeader';

export function CoppaPage(): JSX.Element {
  return (
    <>
      <LegalPageHeader
        title="COPPA Notice"
        summary="How [COMPANY LEGAL NAME] handles information from students under thirteen, in support of [INSTITUTION NAME]."
        lastUpdated="2026-05-19"
        version="v0.1-draft"
      />

      <h2>Operator role</h2>
      <p>
        Where CourseWise is used with students under the age of thirteen,
        [COMPANY LEGAL NAME] acts as an "operator" of an online service
        directed in part to children under the Children's Online Privacy
        Protection Act, 15 U.S.C. §§ 6501–6506, and its implementing rule at
        16 C.F.R. Part 312 ("COPPA"). CourseWise is designed for use in a
        school setting and is not directed to children for general consumer
        use.
      </p>

      <h2>Information collected from children</h2>
      <p>
        The information collected from a student under thirteen who uses
        CourseWise is limited to what is necessary to provide the educational
        service the school has configured. In practice this is the student's
        roster record (name, institution-assigned identifier and email, course
        section) and the work the student produces in the product (responses
        to AI-graded prompts, discussion posts, scores). We also collect basic
        technical information such as IP address and browser type to deliver
        and secure the service. We do not request home address, telephone
        number, geolocation, or persistent device identifiers used for
        cross-context behavioral advertising.
      </p>

      <h2>Behavioral advertising prohibition</h2>
      <p>
        We do not use information collected from any user, and in particular
        information collected from students under thirteen, for targeted or
        behavioral advertising. We do not allow advertising of any kind inside
        the product. We do not sell or rent student information. Our
        subprocessors are contractually prohibited from using student
        information for advertising, profiling outside the service, or model
        training.
      </p>

      <h2>Parental consent (delegated to the school)</h2>
      <p>
        Consistent with FTC guidance on the "school authorization" approach to
        COPPA, [INSTITUTION NAME] consents on the parent's behalf to our
        collection of personal information from students under thirteen for
        the educational purpose the school has authorized. The school is
        responsible for providing notice to parents about the third-party
        services it uses in the classroom, and for honoring parental requests
        consistent with FERPA and state law. We support the school in doing
        so, and we limit our use of children's information to the educational
        purpose authorized by the school.
      </p>
      <p>
        If you are a parent and would prefer to give consent directly rather
        than through the school, contact the school's administrator or
        registrar. They can coordinate with us through our{' '}
        <Link to="/legal/data-requests">Data Requests page</Link>.
      </p>

      <h2>Deletion</h2>
      <p>
        A parent may request that the school direct us to delete their child's
        information held in CourseWise. On receipt of an instruction from the
        school we will delete or de-identify the child's information within
        the period set in the agreement, excluding backups that age out on
        their own schedule and information we are required by law to retain.
      </p>

      <h2>Contact</h2>
      <p>
        For COPPA-related questions, including parental access and deletion
        requests, please contact the student's school in the first instance.
        For questions about our practices as an operator, please use our{' '}
        <Link to="/legal/data-requests">Data Requests page</Link>.
      </p>
    </>
  );
}
