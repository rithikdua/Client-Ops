/**
 * Accessibility audit: drives the real app in a real browser.
 *
 * Two halves, because they catch different things and neither is enough alone:
 *
 *   axe        every screen, plus a dialog, against the WCAG rules axe can
 *              decide automatically — missing names, contrast, landmarks.
 *   keyboard   the parts no static rule can check: that Escape closes a
 *              dialog, that focus comes back afterwards, that arrow keys move
 *              between tabs, that Enter submits a form.
 *
 * The second half exists because the first half passes on markup that is
 * unusable. A tab strip with `role="tab"` and no key handling scores clean and
 * cannot be operated.
 *
 * Not part of `npm test`: it needs a browser and a running server, and the
 * dependencies are deliberately not in package.json — installing Chromium is a
 * large cost for a check most commits do not need.
 *
 *   npm run build && npm start          # in one terminal (SERVE_STATIC=1)
 *   npm i --no-save playwright axe-core
 *   node tools/a11y/audit.mjs           # BASE=http://localhost:8787 to override
 *
 * Exits non-zero on any violation or failed check, so CI can run it as-is.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

let chromium, axeSource;
try {
  ({ chromium } = require('playwright'));
  axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
} catch {
  console.error(
    'This audit needs playwright and axe-core, which are not project dependencies:\n' +
      '  npm i --no-save playwright axe-core\n',
  );
  process.exit(2);
}

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const EMAIL = process.env.A11Y_EMAIL ?? 'priya@phot.ai';
const PASSWORD = process.env.A11Y_PASSWORD ?? 'demo-pass-2026!';

const failures = [];
const note = (ok, label, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch();
// The app's own CSP blocks injected scripts — correct in production, and
// verified by the fact that this had to be turned off to inject axe at all.
const context = await browser.newContext({
  viewport: { width: 1400, height: 950 },
  bypassCSP: true,
});
let page = await context.newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  // The pre-sign-in session probe is expected to 401.
  if (m.type() === 'error' && !m.text().includes('401')) pageErrors.push(m.text());
});

async function scan(name) {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () =>
    window.axe.run(document, { resultTypes: ['violations'] }),
  );
  const nodes = result.violations.reduce((a, v) => a + v.nodes.length, 0);
  note(result.violations.length === 0, `axe · ${name}`, nodes ? `${nodes} node(s)` : '');
  for (const v of result.violations) {
    console.log(`      [${v.impact}] ${v.id} ×${v.nodes.length}`);
    for (const n of v.nodes.slice(0, 4)) {
      console.log(`        ${(n.any[0]?.message ?? '').slice(0, 120)}`);
      console.log(`        ${n.html.slice(0, 120)}`);
    }
  }
}

const focused = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    return {
      tag: el.tagName,
      role: el.getAttribute('role'),
      label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 60),
      outline: getComputedStyle(el).outlineWidth,
    };
  });

/* -- axe over every screen ----------------------------------------------- */

console.log('\nRules axe can decide on its own\n');

await page.goto(BASE);
await scan('sign-in');

await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
// Enter, not a click: a sign-in form that needs the mouse is already broken.
await page.keyboard.press('Enter');
await page.waitForSelector('text=Client Ops overview', { timeout: 20000 });
await scan('overview');

const SECTIONS = ['Clients', 'Invoices & Payments', 'Deliverables', 'Documents', 'Team', 'Follow-ups'];
for (const section of SECTIONS) {
  await page.locator('nav').getByText(section, { exact: true }).first().click();
  await page.waitForTimeout(400);
  await scan(section);
}

await page.locator('nav').getByText('Clients', { exact: true }).first().click();
await page.waitForTimeout(400);
const firstClient = await page.locator('[aria-label^="Open "]').first().getAttribute('aria-label');
await page.getByRole('button', { name: firstClient }).click();
await page.waitForTimeout(500);
await scan('client detail');

for (const tab of ['Invoices & Payments', 'Tasks', 'Activity', 'Contacts']) {
  await page.getByRole('tab', { name: tab }).click();
  await page.waitForTimeout(400);
  await scan(`client · ${tab}`);
}

await page.getByRole('button', { name: 'Edit client' }).click();
await page.waitForTimeout(400);
await scan('edit client dialog');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

/* -- the parts only a keyboard can prove --------------------------------- */

console.log('\nBehaviour no static rule can check\n');

// A fresh context, because the session above is still signed in and the point
// of the first check is that a signed-out person can get in from the keyboard.
const keyboard = await browser.newContext({ viewport: { width: 1400, height: 950 } });
page = await keyboard.newPage();
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('401')) pageErrors.push(m.text());
});

await page.goto(BASE);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.keyboard.press('Enter');
await page.waitForSelector('text=Client Ops overview', { timeout: 20000 });
note(true, 'Enter submits the sign-in form');

await page.keyboard.press('Tab');
let f = await focused();
note(f?.label === 'Skip to content', 'the first Tab reaches the skip link', JSON.stringify(f));
note(
  await page.evaluate(() => document.querySelector('.skip-link').getBoundingClientRect().left >= 0),
  'the skip link becomes visible when focused',
);

await page.keyboard.press('Tab');
f = await focused();
note(f?.outline !== '0px', 'focused controls draw a ring', JSON.stringify(f));

const nav = page.getByRole('navigation', { name: 'Workspace sections' });
await nav.getByRole('button', { name: 'Clients' }).focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
note(
  await page.getByRole('heading', { level: 1, name: 'Clients' }).count() > 0,
  'Enter on a nav button navigates',
);
note(
  (await page.locator('nav [aria-current="page"]').textContent()).includes('Clients'),
  'the current section is marked',
);

await page.getByRole('button', { name: firstClient }).focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
note(
  await page.getByRole('tablist').count() > 0,
  'Enter on a row action opens the client',
);

await page.getByRole('tab', { name: 'Overview' }).focus();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(300);
f = await focused();
note(f?.label === 'Contacts', 'ArrowRight moves to the next tab', JSON.stringify(f));
note(
  await page.getByRole('tab', { name: 'Contacts', selected: true }).count() === 1,
  'and selects it',
);
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(300);
note(
  await page.getByRole('tab', { name: 'Overview', selected: true }).count() === 1,
  'ArrowLeft goes back',
);
note(
  await page.locator('[role="tab"][tabindex="0"]').count() === 1,
  'the tab strip is one tab stop, not seven',
);

await page.getByRole('button', { name: 'Edit client' }).focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
note(await page.getByRole('dialog', { name: 'Edit client' }).count() === 1, 'the dialog has a name');
f = await focused();
note(f?.tag === 'INPUT', 'focus moves into the dialog, onto a field', JSON.stringify(f));

let escaped = false;
for (let i = 0; i < 80; i++) {
  await page.keyboard.press('Tab');
  const inside = await page.evaluate(() =>
    document.querySelector('[role="dialog"]').contains(document.activeElement),
  );
  if (!inside) {
    escaped = true;
    break;
  }
}
note(!escaped, 'Tab never leaves the open dialog');

await page.keyboard.press('Escape');
await page.waitForTimeout(300);
note(await page.getByRole('dialog').count() === 0, 'Escape closes the dialog');
f = await focused();
note(f?.label === 'Edit client', 'focus returns to whatever opened it', JSON.stringify(f));

await page.getByRole('button', { name: 'Edit client' }).click();
await page.waitForTimeout(400);
await page.getByRole('dialog').locator('input').first().press('Enter');
await page.waitForTimeout(1000);
note(await page.getByRole('dialog').count() === 0, 'Enter in a field saves the dialog');

// A drag that starts in a field and ends on the backdrop must not throw the
// form away — the reason the backdrop listens for mousedown on itself.
await page.getByRole('button', { name: 'Edit client' }).click();
await page.waitForTimeout(400);
const box = await page.getByRole('dialog').locator('input').first().boundingBox();
await page.mouse.move(box.x + 20, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(30, 30, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
note(
  await page.getByRole('dialog').count() === 1,
  'selecting text out of a field does not discard the dialog',
);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

await page.getByRole('tab', { name: 'Invoices & Payments' }).click();
await page.waitForTimeout(500);
const trigger = page.getByRole('button', { name: /^Actions for / }).first();
const triggerName = await trigger.getAttribute('aria-label');
await trigger.focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
note(await trigger.getAttribute('aria-expanded') === 'true', 'the row menu reports itself expanded');
f = await focused();
note(f?.role === 'menuitem', 'focus lands on the first menu item', JSON.stringify(f));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
note(await page.locator('[role="menu"]').count() === 0, 'Escape closes the menu');
f = await focused();
note(f?.label === triggerName, 'and focus goes back to the trigger', JSON.stringify(f));

await page.getByRole('button', { name: 'Edit client' }).click();
await page.waitForTimeout(400);
const gst = page.getByRole('radiogroup', { name: 'GST treatment' });
note(await gst.count() === 1, 'the GST toggle is a named radio group');
note(await gst.locator('[tabindex="0"]').count() === 1, 'and is a single tab stop');
await gst.getByRole('radio', { name: 'GST excluded' }).focus();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(300);
note(
  await gst.getByRole('radio', { name: 'GST included', checked: true }).count() === 1,
  'arrows change the GST choice',
);
f = await focused();
note(f?.label === 'GST included', 'and focus follows the choice', JSON.stringify(f));

/* -- result -------------------------------------------------------------- */

note(pageErrors.length === 0, 'no console or page errors', pageErrors.join(' | '));

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll accessibility checks passed.');
