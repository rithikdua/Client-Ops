import { EmptyRow, PageHeader } from '../components/ui';

/**
 * Shown to an account with every section revoked. Rare, but reachable: an Owner
 * can clear the last checkbox on the permissions dialog. The honest answer is to
 * say so — drawing the dashboard would show a wall of zeros that looks like an
 * empty workspace rather than a missing grant.
 */
export function NoAccessView() {
  return (
    <div className="page">
      <PageHeader
        title="Nothing to show yet"
        subtitle="Your account is signed in, but no sections have been enabled for it."
      />
      <div className="card card--clip">
        <EmptyRow>
          Ask a workspace Owner to grant you access from the Team screen.
        </EmptyRow>
      </div>
    </div>
  );
}
