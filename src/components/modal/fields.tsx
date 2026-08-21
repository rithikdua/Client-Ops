import type { CSSProperties, ReactNode } from 'react';
import type { FormKey } from '../../state/modal';
import { useApp } from '../../state/AppState';

/** Reads/writes the open modal's form. */
export function useModalForm() {
  const { state, actions } = useApp();
  return { form: state.modal?.form ?? {}, set: actions.updateForm };
}

export function Field({
  label,
  children,
  style,
}: {
  label: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <label className="field" style={style}>
      {label}
      {children}
    </label>
  );
}

export function TextField({
  label,
  k,
  placeholder,
  type = 'text',
  style,
}: {
  label: string;
  k: FormKey;
  placeholder?: string;
  type?: 'text' | 'number' | 'date' | 'password';
  style?: CSSProperties;
}) {
  const { form, set } = useModalForm();
  return (
    <Field label={label} style={style}>
      <input
        className="field-input"
        type={type}
        value={form[k] ?? ''}
        placeholder={placeholder}
        onChange={(e) => set(k, e.target.value)}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  k,
  rows = 3,
  placeholder,
  style,
}: {
  label: string;
  k: FormKey;
  rows?: number;
  placeholder?: string;
  style?: CSSProperties;
}) {
  const { form, set } = useModalForm();
  return (
    <Field label={label} style={style}>
      <textarea
        className="field-input"
        rows={rows}
        value={form[k] ?? ''}
        placeholder={placeholder}
        onChange={(e) => set(k, e.target.value)}
      />
    </Field>
  );
}

/**
 * Teammates as an assignment dropdown: the account is the value, the name is
 * only what gets shown. Storing the label was the whole problem — a rename left
 * every past assignment pointing at a string nobody maintains.
 */
export function teamOptions(team: { id: string; name: string }[]) {
  return [
    { value: '', label: 'Unassigned' },
    ...team.map((t) => ({ value: t.id, label: t.name })),
  ];
}

export function SelectField({
  label,
  k,
  options,
  style,
}: {
  label: string;
  k: FormKey;
  /** Plain values, or explicit value/label pairs. */
  options: readonly (string | { value: string; label: string })[];
  style?: CSSProperties;
}) {
  const { form, set } = useModalForm();
  return (
    <Field label={label} style={style}>
      <select className="field-input" value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)}>
        {options.map((opt) => {
          const v = typeof opt === 'string' ? opt : opt.value;
          const l = typeof opt === 'string' ? opt : opt.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </Field>
  );
}

/** Full-width heading that splits a form into labelled sections. */
export function FormSection({ children, span = false }: { children: ReactNode; span?: boolean }) {
  return (
    <div className="form-section" style={span ? { gridColumn: '1/-1' } : undefined}>
      {children}
    </div>
  );
}

export function ReadonlyTotal({ label, value }: { label: string; value: string }) {
  return (
    <div className="field">
      {label}
      <div className="field-readonly">{value}</div>
    </div>
  );
}

export function FieldRow({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 12 }}>{children}</div>;
}
