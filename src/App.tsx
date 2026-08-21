import { ModalHost } from './components/modal/ModalHost';
import { PreviewBanner } from './components/PreviewBanner';
import { Sidebar } from './components/Sidebar';
import { NAV_ORDER } from './data/options';
import { APP_SETTINGS } from './state/settings';
import { useApp } from './state/AppState';
import { ClientsView } from './views/ClientsView';
import { ClientDetailView } from './views/client/ClientDetailView';
import { DeliverablesView } from './views/DeliverablesView';
import { DocumentsView } from './views/DocumentsView';
import { FollowUpsView } from './views/FollowUpsView';
import { InvoicesView } from './views/InvoicesView';
import { ForcePasswordView } from './views/ForcePasswordView';
import { LoginView } from './views/LoginView';
import { NoAccessView } from './views/NoAccessView';
import { ResetPasswordView } from './views/ResetPasswordView';
import { OverviewView } from './views/OverviewView';
import { SetupView } from './views/SetupView';
import { TeamView } from './views/TeamView';

export function App() {
  const { state, actions } = useApp();

  if (state.status === 'loading') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-ui)',
          fontSize: 14,
        }}
      >
        Loading workspace…
      </div>
    );
  }

  if (state.status === 'reset' && state.resetToken) {
    return <ResetPasswordView token={state.resetToken} />;
  }
  if (state.status === 'setup') return <SetupView />;
  if (state.status === 'signed-out') return <LoginView />;
  // A temporary password blocks the workspace until it is replaced.
  if (state.me?.mustChangePassword) return <ForcePasswordView />;

  const selectedClient = state.clients.find((c) => c.id === state.selectedId);
  const noSections = NAV_ORDER.every((key) => !state.me?.access?.[key]);

  return (
    <div
      className="app"
      data-density={APP_SETTINGS.density}
      data-nav={APP_SETTINGS.navStyle}
      data-glow={APP_SETTINGS.headerGlow}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Sidebar />
      <main className="content" id="main">
        <PreviewBanner />
        {/*
          `role="alert"` because a failed save is announced nowhere else: the
          banner appears above the fold, focus stays in the form, and a
          screen-reader user would otherwise re-submit into silence.
        */}
        {state.error && (
          <div
            role="alert"
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '10px 20px',
              background: '#FEE4E0',
              borderBottom: '1px solid var(--danger)',
              color: '#B3200B',
              fontSize: 13,
            }}
          >
            <span>{state.error}</span>
            <button
              type="button"
              className="link-button"
              onClick={actions.dismissError}
              style={{ color: '#B3200B', fontSize: 13, whiteSpace: 'nowrap' }}
            >
              Dismiss
            </button>
          </div>
        )}
        {/* An account can exist with every section revoked. Say so, rather than
            drawing a dashboard of zeros over data that was correctly withheld. */}
        {noSections ? <NoAccessView /> : state.view === 'overview' && <OverviewView />}
        {state.view === 'clients' && <ClientsView />}
        {state.view === 'invoices' && <InvoicesView />}
        {state.view === 'deliverables' && <DeliverablesView />}
        {state.view === 'documents' && <DocumentsView />}
        {state.view === 'team' && <TeamView />}
        {state.view === 'followups' && <FollowUpsView />}
        {state.view === 'client' && selectedClient && <ClientDetailView client={selectedClient} />}
      </main>
      <ModalHost />
    </div>
  );
}
