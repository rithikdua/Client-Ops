import type { ReactNode } from 'react';
import type { CurrencyCode } from '../../data/types';
import { Button } from '../../ds/Button';
import { invoiceBalance } from '../../lib/invoices';
import { useApp } from '../../state/AppState';
import { taskProjectKey } from '../TaskBits';
import { ClientForm } from './ClientForm';
import {
  ActivityForm,
  AttachFileForm,
  ChangePasswordForm,
  CompleteFollowUpForm,
  ContactForm,
  DeliverableForm,
  DocumentForm,
  FollowUpForm,
  InvoiceForm,
  LogPaymentForm,
  PermissionsForm,
  ResetLinkForm,
  TaskForm,
  TaskPreview,
  TeammateForm,
} from './forms';

export function ModalHost() {
  const { state, actions } = useApp();
  const modal = state.modal;
  if (!modal) return null;

  const client = state.clients.find((c) => c.id === modal.clientId);
  const currency: CurrencyCode = client?.currency ?? 'INR';
  const invoice = client?.invoices.find((i) => i.id === modal.invId);

  let title = 'Log activity';
  let body: ReactNode = null;

  switch (modal.type) {
    case 'client':
      title = modal.editing ? 'Edit client' : 'Add client';
      body = <ClientForm isNew={!modal.editing} />;
      break;
    case 'contact':
      title = 'Add contact';
      body = <ContactForm showClientPicker={!modal.clientId} />;
      break;
    case 'invoice':
      title = 'Add invoice';
      body = <InvoiceForm currency={currency} />;
      break;
    case 'logPayment':
      title = 'Log payment';
      body = (
        <LogPaymentForm balance={invoice ? invoiceBalance(invoice) : 0} currency={currency} />
      );
      break;
    case 'attachInvoiceFile':
      title = 'Attach invoice file';
      body = (
        <AttachFileForm
          intro="Link the invoice file — everyone on this account can see it here."
          namePlaceholder="INV-2026-0455.pdf"
          hasExistingFile={!!modal.hasExistingFile}
          onRemove={() => actions.removeInvoiceFile(modal.clientId!, modal.invId!)}
        />
      );
      break;
    case 'deliverable':
      title = 'Add deliverable';
      body = <DeliverableForm />;
      break;
    case 'attachFile':
      title = 'Attach delivered file';
      body = (
        <AttachFileForm
          intro="Link the file your team delivered — everyone on this account can see it here."
          namePlaceholder="Q4_Holiday_Assets_v3.zip"
          hasExistingFile={!!modal.hasExistingFile}
          onRemove={() => actions.removeDeliverableFile(modal.clientId!, modal.delId!)}
        />
      );
      break;
    case 'document':
      title = 'Add document';
      body = <DocumentForm />;
      break;
    case 'activity':
      title = 'Log activity';
      body = <ActivityForm />;
      break;
    case 'teammate':
      title = 'Add teammate';
      body = <TeammateForm />;
      break;
    case 'permissions':
      title =
        'Manage access — ' + (state.team.find((t) => t.id === modal.teammateId)?.name ?? '');
      body = <PermissionsForm />;
      break;
    case 'followup':
      title = modal.editing ? 'Edit follow-up' : 'Add follow-up';
      body = <FollowUpForm />;
      break;
    case 'completeFollowUp':
      title = modal.form.action === 'done' ? 'Mark follow-up as done' : 'Log a call';
      body = <CompleteFollowUpForm />;
      break;
    case 'task': {
      title = modal.editing ? 'Edit task' : 'New task';
      // Ticket keys follow row position, so an edit keeps its existing number.
      const list = client?.tasks ?? [];
      const idx = modal.editing ? list.findIndex((t) => t.id === modal.taskId) : list.length;
      body = <TaskForm ticketKey={taskProjectKey(client?.name ?? '') + '-' + (idx + 1)} />;
      break;
    }
    case 'taskPreview':
      title = 'Ticket';
      body = modal.task ? <TaskPreview task={modal.task} client={client} /> : null;
      break;
    case 'resetLink':
      title = 'One-time reset link';
      body = <ResetLinkForm />;
      break;
    case 'changePassword':
      title = state.me?.hasPassword === false ? 'Set a password' : 'Change your password';
      body = <ChangePasswordForm />;
      break;
  }

  const isPreview = modal.type === 'taskPreview';
  // Nothing to submit: the link already exists.
  const isInformational = modal.type === 'resetLink';

  return (
    <div className="modal-backdrop" onClick={actions.closeModal}>
      <div
        className="modal"
        style={{ width: modal.type === 'client' ? 680 : 460 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <div className="modal-close" onClick={actions.closeModal}>
            ×
          </div>
        </div>

        <div className="modal-body">{body}</div>

        <div className="modal-foot">
          {modal.type === 'permissions' && (
            <Button
              variant="secondary"
              size="md"
              style={{ marginRight: 'auto' }}
              onClick={() => actions.startPreview(modal.teammateId!)}
            >
              Preview as this user
            </Button>
          )}
          {isInformational ? (
            <Button variant="primary" size="md" onClick={actions.closeModal}>
              Done
            </Button>
          ) : isPreview ? (
            <>
              <Button variant="secondary" size="md" onClick={actions.closeModal}>
                Close
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => actions.openEditTask(modal.clientId!, modal.task!)}
              >
                Edit ticket
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="md" onClick={actions.closeModal}>
                Cancel
              </Button>
              <Button variant="primary" size="md" onClick={actions.submitModal}>
                Save
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
