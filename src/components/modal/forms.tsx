import {
  ACCESS_SECTIONS,
  ALL_ACCESS,
  DELIVERABLE_STATUS_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  PERMISSION_OPTIONS,
  PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
} from '../../data/options';
import type { Client, CurrencyCode, Task } from '../../data/types';
import { Button } from '../../ds/Button';
import { Chip } from '../../ds/Chip';
import { attachmentLabel, isImageAttachment, thumbnailStyle } from '../../lib/attachments';
import { fmtDate, parseISO, TODAY } from '../../lib/dates';
import { CURRENCY_MAP, fmtMoney } from '../../lib/money';
import { priorityColor, taskStatusColor } from '../../lib/statusColors';
import { useApp } from '../../state/AppState';
import { AttachmentList, taskProjectKey } from '../TaskBits';
import { SegmentedControl } from '../ui';
import { GstFields } from './GstFields';
import {
  FieldRow,
  FormSection,
  SelectField,
  TextAreaField,
  TextField,
  useModalForm,
} from './fields';

const HALF = { flex: 1 } as const;

export function ContactForm({ showClientPicker }: { showClientPicker: boolean }) {
  const { state } = useApp();
  const { form } = useModalForm();
  return (
    <>
      {showClientPicker && (
        <>
          <SelectField
            label="Client"
            k="clientId"
            options={[
              { value: '', label: 'Select a client…' },
              ...state.clients.map((c) => ({ value: c.id, label: c.name })),
              { value: '__new__', label: '+ Add new client…' },
            ]}
          />
          {form.clientId === '__new__' && (
            <TextField label="New client name" k="newClientName" placeholder="Company name" />
          )}
        </>
      )}
      <TextField label="Name" k="name" />
      <TextField label="Role" k="role" />
      <TextField label="Email" k="email" />
      <TextField label="Phone" k="phone" />
    </>
  );
}

export function InvoiceForm({ currency }: { currency: CurrencyCode }) {
  return (
    <>
      <TextField label="Invoice number" k="number" />
      <GstFields
        layout="stack"
        currency={currency}
        basePlaceholder="24000"
        totalLabel="Total invoice amount"
      />
      <FieldRow>
        <TextField label="Issue date" k="issueDate" type="date" style={HALF} />
        <TextField label="Due date" k="dueDate" type="date" style={HALF} />
      </FieldRow>
      <FormSection>Invoice file (optional)</FormSection>
      <TextField label="Link" k="fileUrl" placeholder="https://drive.google.com/…" />
      <TextField label="Display name" k="fileName" placeholder="INV-2026-0455.pdf" />
    </>
  );
}

export function LogPaymentForm({ balance, currency }: { balance: number; currency: CurrencyCode }) {
  const symbol = (CURRENCY_MAP[currency] ?? CURRENCY_MAP.INR).symbol.trim();
  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 4 }}>
        Balance remaining: {fmtMoney(balance, currency)}
      </div>
      <FieldRow>
        <TextField
          label={`Bank amount received (${symbol})`}
          k="bankAmount"
          type="number"
          style={HALF}
        />
        <TextField
          label={`TDS deducted (${symbol})`}
          k="tds"
          type="number"
          placeholder="0"
          style={HALF}
        />
      </FieldRow>
      <TextField label="Date" k="date" type="date" />
    </>
  );
}

/** Shared by the deliverable and invoice attach-file modals. */
export function AttachFileForm({
  intro,
  namePlaceholder,
  hasExistingFile,
  onRemove,
}: {
  intro: string;
  namePlaceholder: string;
  hasExistingFile: boolean;
  onRemove: () => void;
}) {
  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 4 }}>{intro}</div>
      <TextField label="Link" k="fileUrl" placeholder="https://drive.google.com/…" />
      <TextField label="Display name" k="fileName" placeholder={namePlaceholder} />
      {hasExistingFile && (
        <div
          onClick={onRemove}
          style={{ fontSize: 13, color: 'var(--danger)', cursor: 'pointer', fontWeight: 500 }}
        >
          Remove attached file
        </div>
      )}
    </>
  );
}

export function DeliverableForm() {
  const { state } = useApp();
  return (
    <>
      <TextField label="Title" k="title" />
      <TextField label="Description" k="description" />
      <FieldRow>
        <SelectField label="Owner" k="owner" options={state.team.map((t) => t.name)} style={HALF} />
        <TextField label="Due date" k="dueDate" type="date" style={HALF} />
      </FieldRow>
      <SelectField label="Status" k="status" options={DELIVERABLE_STATUS_OPTIONS} />
      <FormSection>Delivered file (optional)</FormSection>
      <TextField label="Link" k="fileUrl" placeholder="https://drive.google.com/…" />
      <TextField label="Display name" k="fileName" placeholder="Q4_Holiday_Assets_v3.zip" />
    </>
  );
}

export function FollowUpForm() {
  const { state } = useApp();
  return (
    <>
      <TextField label="Contact person name" k="name" placeholder="e.g. Jordan Blake" />
      <FieldRow>
        <TextField label="Company name" k="companyName" placeholder="e.g. Halo Fitness" style={HALF} />
        <TextField label="Email" k="email" placeholder="jordan@halofitness.com" style={HALF} />
      </FieldRow>
      <TextField label="Contact number" k="phone" placeholder="(305) 555-0177" />
      <SelectField
        label="Related client (optional)"
        k="relatedClientId"
        options={[
          { value: '', label: 'None — new contact / prospect' },
          ...state.clients.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />
      <TextField label="Reason" k="reason" placeholder="e.g. First outreach after inbound request" />
      <FieldRow>
        <SelectField label="Owner" k="owner" options={state.team.map((t) => t.name)} style={HALF} />
        <TextField label="Due date" k="dueDate" type="date" style={HALF} />
      </FieldRow>
    </>
  );
}

export function CompleteFollowUpForm() {
  const { form, set } = useModalForm();
  const isSnooze = form.action !== 'done';
  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 4 }}>
        What did you hear back from them? This gets added to their call history.
      </div>
      <TextAreaField
        label="Comment from client"
        k="note"
        rows={4}
        placeholder="e.g. Asked to call back after 2 days."
      />
      <div>
        <div className="field">What next?</div>
        <SegmentedControl
          value={isSnooze ? 'snooze' : 'done'}
          onChange={(v) => set('action', v)}
          options={[
            { value: 'snooze', label: 'Call back later' },
            { value: 'done', label: 'Mark as done' },
          ]}
        />
      </div>
      {isSnooze && <TextField label="Call back on" k="nextDate" type="date" />}
    </>
  );
}

export function TeammateForm() {
  return (
    <>
      <TextField label="Name" k="name" />
      <TextField label="Work email" k="email" placeholder="name@phot.ai" />
      <TextField label="Role" k="role" placeholder="Account Manager" />
      <SelectField label="Permission" k="permission" options={PERMISSION_OPTIONS} />
      <div>
        <TextField label="Temporary password" k="password" type="password" />
        <div className="field-hint">
          At least 8 characters. Share it with them and have them change it after signing in.
        </div>
      </div>
      <div className="field-hint">
        Viewers can read everything they have access to but cannot make changes.
      </div>
    </>
  );
}

export function PermissionsForm() {
  const { actions } = useApp();
  const { form } = useModalForm();
  const access = { ...ALL_ACCESS, ...(form.access ?? {}) };
  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 4 }}>
        Choose exactly which sections this person can open.
      </div>
      {ACCESS_SECTIONS.map((sec) => {
        const on = !!access[sec.key];
        return (
          <div
            key={sec.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 0',
              borderBottom: '1px solid var(--border-2)',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 500 }}>{sec.label}</span>
            <div
              onClick={() => actions.toggleAccessSection(sec.key)}
              style={{
                width: 40,
                height: 22,
                borderRadius: 11,
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.15s',
                background: on ? 'var(--phot-purple)' : 'var(--border-1)',
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: 2,
                  left: on ? 20 : 2,
                  transition: 'left 0.15s',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                }}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

export function DocumentForm() {
  return (
    <>
      <TextField label="Document name" k="name" placeholder="Master Service Agreement.pdf" />
      <SelectField label="Type" k="type" options={DOCUMENT_TYPE_OPTIONS} />
      <TextField label="Link (optional)" k="fileUrl" placeholder="https://drive.google.com/…" />
      <SelectField
        label="Source"
        k="source"
        options={[
          { value: 'us', label: 'Provided by us' },
          { value: 'client', label: 'Provided by client' },
        ]}
      />
    </>
  );
}

export function ActivityForm() {
  const { state } = useApp();
  return (
    <>
      <SelectField label="Logged by" k="author" options={state.team.map((t) => t.name)} />
      <TextAreaField label="Note" k="note" rows={4} />
    </>
  );
}

export function TaskForm({ ticketKey }: { ticketKey: string }) {
  const { state, actions } = useApp();
  const { form, set } = useModalForm();
  const attachments = form.attachments ?? [];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: -2 }}>
        <Chip color="purple">Task</Chip>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--ink-3)',
            letterSpacing: '0.02em',
          }}
        >
          {ticketKey}
        </span>
      </div>
      <TextField label="Ticket title" k="title" placeholder="e.g. Chase down signed PO" />
      <TextAreaField
        label="Description"
        k="description"
        placeholder="Any detail the assignee needs"
      />
      <FieldRow>
        <SelectField label="Assignee" k="assignee" options={state.team.map((t) => t.name)} style={HALF} />
        <SelectField label="Priority" k="priority" options={PRIORITY_OPTIONS} style={HALF} />
      </FieldRow>
      <FieldRow>
        <SelectField label="Status" k="status" options={TASK_STATUS_OPTIONS} style={HALF} />
        <TextField label="Due date" k="dueDate" type="date" style={HALF} />
      </FieldRow>
      <div>
        <span
          style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'var(--ink-1)' }}
        >
          Attachments
        </span>
        <div style={{ marginTop: 10 }}>
          {attachments.map((url, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                border: '1px solid var(--border-1)',
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              {isImageAttachment(url) && <div style={thumbnailStyle(url, 32, 6)} />}
              <span
                style={{
                  flex: 1,
                  fontSize: 12.5,
                  color: 'var(--ink-2)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {attachmentLabel(url)}
              </span>
              <span
                onClick={() => actions.removeTaskAttachment(i)}
                style={{ fontSize: 12, color: 'var(--danger)', cursor: 'pointer', fontWeight: 600 }}
              >
                Remove
              </span>
            </div>
          ))}
          <label
            style={{
              border: '1.5px dashed var(--border-1)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 10,
              cursor: 'pointer',
              gap: 8,
              background: 'var(--surface-1)',
            }}
          >
            <span
              style={{ fontSize: 16, color: 'var(--phot-purple)', fontWeight: 600, lineHeight: 1 }}
            >
              +
            </span>
            <span style={{ fontSize: 13, color: 'var(--phot-purple)', fontWeight: 600 }}>
              Add attachment
            </span>
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xlsx,.csv"
              onChange={actions.handleTaskFileChange}
              style={{ display: 'none' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              className="field-input"
              style={{ flex: 1 }}
              value={form.linkInput ?? ''}
              onChange={(e) => set('linkInput', e.target.value)}
              placeholder="or paste a link and press Add"
            />
            <Button variant="secondary" size="md" onClick={actions.addTaskLink}>
              Add
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

export function TaskPreview({ task, client }: { task: Task; client: Client | undefined }) {
  const done = task.status === 'Done';
  const overdue = !done && !!task.dueDate && parseISO(task.dueDate) < TODAY;
  const index = client ? client.tasks.findIndex((t) => t.id === task.id) : -1;
  const ticketKey = taskProjectKey(client?.name ?? '') + '-' + (index + 1);
  const attachments = task.attachments ?? [];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Chip color="purple">Task</Chip>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--ink-3)',
            letterSpacing: '0.02em',
          }}
        >
          {ticketKey}
        </span>
      </div>
      <div
        style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 18, color: 'var(--ink-1)' }}
      >
        {task.title}
      </div>
      {task.description && (
        <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{task.description}</div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          paddingTop: 14,
          borderTop: '1px solid var(--border-2)',
        }}
      >
        <PreviewField label="Assignee">
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-1)' }}>{task.assignee}</div>
        </PreviewField>
        <PreviewField label="Priority">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13.5,
              fontWeight: 600,
              color: 'var(--ink-1)',
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: priorityColor(task.priority),
              }}
            />
            {task.priority}
          </div>
        </PreviewField>
        <PreviewField label="Status">
          <Chip color={taskStatusColor(task.status)}>{task.status}</Chip>
        </PreviewField>
        <PreviewField label="Due date">
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: overdue ? 'var(--danger)' : 'var(--ink-3)',
            }}
          >
            {task.dueDate ? fmtDate(task.dueDate) : 'No due date'}
          </div>
        </PreviewField>
      </div>
      {attachments.length > 0 && (
        <div style={{ paddingTop: 14, borderTop: '1px solid var(--border-2)' }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: 8,
            }}
          >
            Attachments
          </div>
          <AttachmentList attachments={attachments} />
        </div>
      )}
    </>
  );
}

function PreviewField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
