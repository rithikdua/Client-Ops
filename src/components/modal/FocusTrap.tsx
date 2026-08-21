import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Keeps keyboard focus inside a dialog while it is open, and gives it back
 * when it closes.
 *
 * Without this, an open modal is a decoration: focus stays wherever it was on
 * the page behind, so Tab walks through the sidebar and the table *underneath*
 * the overlay — controls a sighted user can see are covered, and a screen
 * reader reads out a page the person cannot act on. Escape did nothing either,
 * so the only exit was finding and clicking Cancel.
 *
 * Three things happen here, and all three matter on their own:
 *
 *   entering   focus moves to the first field, so typing starts where the
 *              person expects rather than in the page behind.
 *   while open Tab cycles within the dialog, and Escape closes it.
 *   leaving    focus returns to whatever opened the dialog, so a keyboard user
 *              is put back where they were rather than at the top of the page.
 */

/**
 * Focusable descendants, in document order.
 *
 * `disabled` and `tabindex="-1"` are excluded because neither takes Tab focus;
 * elements inside a `hidden` ancestor are excluded by the offsetParent check,
 * which is how a collapsed section's fields stay out of the cycle.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export function FocusTrap({ children, onEscape }: { children: ReactNode; onEscape: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = wrap.current;
    if (!root) return;

    // Whatever had focus when the dialog opened — usually the button that
    // opened it. Captured before we move focus anywhere.
    const opener = document.activeElement as HTMLElement | null;

    // The first field, rather than the first focusable thing: the close button
    // comes first in the markup, and landing there means every dialog opens
    // with "close" as the highlighted action.
    const items = focusable(root);
    const firstField = items.find((el) => el.tagName !== 'BUTTON') ?? items[0];
    firstField?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;

      const list = focusable(root);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;

      // Only the two ends need handling; everything between them is the
      // browser's own Tab order, which is already correct.
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Only if the opener is still on the page: a dialog that deleted the row
      // it was opened from has nothing to go back to, and focusing a detached
      // node silently sends focus to the body instead.
      if (opener?.isConnected) opener.focus();
    };
  }, [onEscape]);

  return <div ref={wrap}>{children}</div>;
}
