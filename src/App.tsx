import { ModalHost } from './components/modal/ModalHost';
import { PreviewBanner } from './components/PreviewBanner';
import { Sidebar } from './components/Sidebar';
import { APP_SETTINGS } from './state/settings';
import { useApp } from './state/AppState';
import { ClientsView } from './views/ClientsView';
import { ClientDetailView } from './views/client/ClientDetailView';
import { DeliverablesView } from './views/DeliverablesView';
import { DocumentsView } from './views/DocumentsView';
import { FollowUpsView } from './views/FollowUpsView';
import { InvoicesView } from './views/InvoicesView';
import { LoginView } from './views/LoginView';
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

  if (state.status === 'setup') return <SetupView />;
  if (state.status === 'signed-out') return <LoginView />;

  const selectedClient = state.clients.find((c) => c.id === state.selectedId);

  return (
    <div
      className="app"
      data-density={APP_SETTINGS.density}
      data-nav={APP_SETTINGS.navStyle}
      data-glow={APP_SETTINGS.headerGlow}
    >
      <Sidebar />
      <div className="content">
        <PreviewBanner />
        {state.error && (
          <div
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
            <span
              onClick={actions.dismissError}
              style={{ cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              Dismiss
            </span>
          </div>
        )}
        {state.view === 'overview' && <OverviewView />}
        {state.view === 'clients' && <ClientsView />}
        {state.view === 'invoices' && <InvoicesView />}
        {state.view === 'deliverables' && <DeliverablesView />}
        {state.view === 'documents' && <DocumentsView />}
        {state.view === 'team' && <TeamView />}
        {state.view === 'followups' && <FollowUpsView />}
        {state.view === 'client' && selectedClient && <ClientDetailView client={selectedClient} />}
      </div>
      <ModalHost />
    </div>
  );
}
