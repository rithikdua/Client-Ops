import type { ReactNode } from 'react';
import type { CurrencyCode } from '../../data/types';
import { Button } from '../../ds/Button';
import { invoiceBalance } from '../../lib/invoices';
import { useApp } from '../../state/AppState';
import { taskProjectKey } from '../TaskBits';
import { ClientForm } from './ClientForm';
import { FocusTrap } from './FocusTrap';
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
  const canSubmit = !isPreview && !isInformational;

  return (
    <div
      className="modal-backdrop"
      // `mousedown` on the backdrop itself, not any click that bubbles up to it:
      // a click that starts inside the dialog and finishes on the backdrop —
      // dragging to select text in a field, most often — used to discard
      // everything the person had typed.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) actions.closeModal();
      }}
    >
      <FocusTrap onEscape={actions.closeModal}>
        {/*
          The dialog role sits on the container and the form nests inside it:
          a `form` cannot carry `role="dialog"` — its own implicit role does not
          allow the swap, and assistive technology is entitled to ignore it.
        */}
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          style={{ width: modal.type === 'client' ? 680 : 460 }}
        >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) actions.submitModal();
            else actions.closeModal();
          }}
        >
          <div className="modal-head">
            <h2 className="modal-title" id="modal-title">
              {title}
            </h2>
            <button
              type="button"
              className="modal-close"
              onClick={actions.closeModal}
              aria-label={`Close ${title}`}
            >
              <span aria-hidden="true">×</span>
            </button>
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
                {/* A submit button, so Enter in any field saves the form — the
                    thing every keyboard user tries first, and which previously
                    did nothing at all. */}
                <Button variant="primary" size="md" type="submit">
                  Save
                </Button>
              </>
            )}
          </div>
        </form>
        </div>
      </FocusTrap>
    </div>
  );
}
