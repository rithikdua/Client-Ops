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
import { OverviewView } from './views/OverviewView';
import { TeamView } from './views/TeamView';

export function App() {
  const { state } = useApp();
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
