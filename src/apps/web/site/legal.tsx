// Grievance Officer details are configuration (IT Rules 2021 Rule 3(2) [INFERRED]); never invented.
export function GrievanceOfficer() {
  const name = process.env['GRIEVANCE_OFFICER_NAME'];
  const email = process.env['GRIEVANCE_OFFICER_EMAIL'];
  if (!name || !email) return <p className="notice notice-warn">The Grievance Officer&apos;s name and contact details will be published here before launch.</p>;
  return (
    <p>
      Grievance Officer: <strong>{name}</strong>, <a href={`mailto:${email}`}>{email}</a>. Complaints are acknowledged within 24 hours and resolved within 15 days; court and government orders within 36 hours.
    </p>
  );
}

export const UPDATED = '3 October 2026';
