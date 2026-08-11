// Bootstrap data for a fresh database. Amounts here are whole currency units;
// the seeder converts them to the minor units the schema stores.
import { randomUUID } from 'node:crypto';
import { ALL_ACCESS } from '../../../src/data/options';
import type { Client, FollowUp, Invoice, Teammate } from '../../../src/data/types';

const uid = (_prefix: string) => randomUUID();

/** A seeded teammate, plus the login the seeder creates for them. */
export type SeedTeammate = Teammate & { email: string };

export const TEAM_SEED: SeedTeammate[] = [
  {
    id: 'tm1',
    name: 'Priya Shah',
    email: 'priya@phot.ai',
    role: 'Ops Lead',
    permission: 'Owner',
    access: { ...ALL_ACCESS },
  },
  {
    id: 'tm2',
    name: 'Daniel Cho',
    email: 'daniel@phot.ai',
    role: 'Account Manager',
    permission: 'Editor',
    access: { ...ALL_ACCESS, invoices: false },
  },
  {
    id: 'tm3',
    name: 'Maya Fernandes',
    email: 'maya@phot.ai',
    role: 'Customer Success Manager',
    permission: 'Editor',
    access: { ...ALL_ACCESS, documents: false, phonebook: false, followups: false },
  },
  {
    id: 'tm4',
    name: 'Tom Whitfield',
    email: 'tom@phot.ai',
    role: 'Delivery Lead',
    permission: 'Viewer',
    access: { ...ALL_ACCESS },
  },
];

export function seedFollowUps(): FollowUp[] {
  return [
    {
      id: 'fu1',
      name: 'Sofia Marchetti',
      companyName: 'Vantage Robotics',
      email: 'sofia@vantagerobotics.io',
      phone: '(415) 555-0231',
      relatedClientId: 'c2',
      reason: 'Discuss renewal budget concerns before contract lapses',
      owner: 'Daniel Cho',
      dueDate: '2026-08-10',
      status: 'Pending',
    },
    {
      id: 'fu2',
      name: 'Elena Vance',
      companyName: 'Northwind Logistics',
      email: 'elena.vance@northwindlogistics.com',
      phone: '(312) 555-0148',
      relatedClientId: 'c1',
      reason: 'Follow up on invoice INV-2026-0348 payment timeline',
      owner: 'Priya Shah',
      dueDate: '2026-08-08',
      status: 'Pending',
    },
    {
      id: 'fu3',
      name: 'Jordan Blake',
      companyName: 'Halo Fitness (prospect)',
      email: 'jordan@halofitness.com',
      phone: '(305) 555-0177',
      relatedClientId: '',
      reason: 'First outreach after inbound demo request',
      owner: 'Maya Fernandes',
      dueDate: '2026-08-12',
      status: 'Pending',
    },
  ];
}

/** A seed invoice, before the GST/payment fields are derived. */
type RawInvoice = {
  number: string;
  amount: number;
  issueDate: string;
  dueDate: string;
  /** Seed-only: `Paid` back-fills a single full payment. */
  status: 'Paid' | 'Pending';
};

type RawClient = Omit<Client, 'invoices' | 'currency' | 'tasks'> &
  Partial<Pick<Client, 'currency' | 'tasks'>> & { invoices: RawInvoice[] };

export function seedClients(): Client[] {
  const raw: RawClient[] = [
    {
      id: 'c1',
      name: 'Northwind Logistics',
      industry: 'Freight & Logistics',
      health: 'Active',
      owner: 'Priya Shah',
      stage: 'Live',
      contractValue: 96000,
      billingCycle: 'Quarterly',
      startDate: '2025-02-10',
      contacts: [
        {
          id: uid('ct'),
          name: 'Elena Vance',
          role: 'VP Operations',
          email: 'elena.vance@northwindlogistics.com',
          phone: '(312) 555-0148',
        },
        {
          id: uid('ct'),
          name: 'Marcus Diallo',
          role: 'Finance Manager',
          email: 'marcus.diallo@northwindlogistics.com',
          phone: '(312) 555-0192',
        },
      ],
      invoices: [
        { number: 'INV-2026-0301', amount: 24000, issueDate: '2026-04-01', dueDate: '2026-04-15', status: 'Paid' },
        { number: 'INV-2026-0312', amount: 24000, issueDate: '2026-07-01', dueDate: '2026-07-15', status: 'Paid' },
        { number: 'INV-2026-0348', amount: 24000, issueDate: '2026-07-20', dueDate: '2026-08-03', status: 'Pending' },
      ],
      deliverables: [
        {
          id: uid('del'),
          title: 'Onboarding kickoff deck',
          description: '',
          owner: 'Priya Shah',
          dueDate: '2025-02-20',
          status: 'Done',
        },
        {
          id: uid('del'),
          title: 'Warehouse API integration',
          description: 'Real-time inventory sync with client WMS',
          owner: 'Tom Whitfield',
          dueDate: '2026-07-30',
          status: 'In progress',
        },
        {
          id: uid('del'),
          title: 'Q3 network optimization report',
          description: 'Route efficiency analysis across 4 regional hubs',
          owner: 'Priya Shah',
          dueDate: '2026-08-20',
          status: 'In progress',
        },
      ],
      documents: [
        { id: uid('doc'), name: 'Master Service Agreement.pdf', type: 'Contract', date: '2025-02-05' },
        { id: uid('doc'), name: 'SOW - Phase 2.pdf', type: 'SOW', date: '2026-03-12' },
      ],
      activity: [
        {
          id: uid('act'),
          date: '2026-08-04',
          author: 'Priya Shah',
          note: 'Sent reminder on INV-2026-0348, client confirmed payment processing this week.',
        },
        {
          id: uid('act'),
          date: '2026-07-22',
          author: 'Priya Shah',
          note: 'Quarterly business review held — client renewed interest in expanding to 2 more regions.',
        },
        {
          id: uid('act'),
          date: '2026-06-10',
          author: 'Tom Whitfield',
          note: 'Kickoff call for warehouse API integration, scope confirmed.',
        },
      ],
      tasks: [
        {
          id: uid('tsk'),
          title: 'Confirm PO number for August invoice',
          assignee: 'Priya Shah',
          description: 'Finance needs it before releasing the wire.',
          status: 'Pending',
          priority: 'High',
          dueDate: '2026-08-14',
        },
        {
          id: uid('tsk'),
          title: 'Prep account plan slide for QBR',
          assignee: 'Tom Whitfield',
          description: '',
          status: 'Done',
          priority: 'Medium',
          dueDate: '2026-07-20',
        },
      ],
    },
    {
      id: 'c2',
      name: 'Vantage Robotics',
      industry: 'Industrial Automation',
      health: 'At Risk',
      owner: 'Daniel Cho',
      stage: 'Renewal',
      contractValue: 210000,
      billingCycle: 'Annual',
      startDate: '2024-05-01',
      contacts: [
        { id: uid('ct'), name: 'Sofia Marchetti', role: 'CTO', email: 'sofia@vantagerobotics.io', phone: '(415) 555-0231' },
      ],
      invoices: [
        { number: 'INV-2026-0290', amount: 52500, issueDate: '2026-05-01', dueDate: '2026-05-15', status: 'Paid' },
        { number: 'INV-2026-0330', amount: 52500, issueDate: '2026-07-01', dueDate: '2026-07-15', status: 'Pending' },
      ],
      deliverables: [
        {
          id: uid('del'),
          title: 'Firmware compliance audit',
          description: 'ISO 13849 safety audit for deployed arms',
          owner: 'Maya Fernandes',
          dueDate: '2026-07-25',
          status: 'Not started',
        },
        {
          id: uid('del'),
          title: 'Renewal proposal',
          description: 'Present 3-year renewal terms with volume discount',
          owner: 'Daniel Cho',
          dueDate: '2026-08-15',
          status: 'In progress',
        },
      ],
      documents: [
        { id: uid('doc'), name: 'Master Service Agreement.pdf', type: 'Contract', date: '2024-04-20' },
        { id: uid('doc'), name: 'Renewal Term Sheet - Draft.pdf', type: 'Contract', date: '2026-07-28' },
      ],
      activity: [
        {
          id: uid('act'),
          date: '2026-08-01',
          author: 'Daniel Cho',
          note: 'Client flagged budget concerns for renewal; escalated to leadership for discount approval.',
        },
        {
          id: uid('act'),
          date: '2026-07-10',
          author: 'Daniel Cho',
          note: 'Payment on INV-2026-0330 delayed — client cited internal approval bottleneck.',
        },
      ],
      tasks: [],
    },
    {
      id: 'c3',
      name: 'Solace Health',
      industry: 'Healthcare Services',
      health: 'Active',
      owner: 'Maya Fernandes',
      stage: 'Live',
      contractValue: 68000,
      billingCycle: 'Monthly',
      startDate: '2025-09-15',
      contacts: [
        {
          id: uid('ct'),
          name: 'Dr. Omar Nasser',
          role: 'Director of Ops',
          email: 'omar.nasser@solacehealth.org',
          phone: '(617) 555-0177',
        },
        {
          id: uid('ct'),
          name: 'Grace Lin',
          role: 'Procurement Lead',
          email: 'grace.lin@solacehealth.org',
          phone: '(617) 555-0183',
        },
      ],
      invoices: [
        { number: 'INV-2026-0410', amount: 5667, issueDate: '2026-07-01', dueDate: '2026-07-10', status: 'Paid' },
        { number: 'INV-2026-0421', amount: 5667, issueDate: '2026-08-01', dueDate: '2026-08-10', status: 'Pending' },
      ],
      deliverables: [
        {
          id: uid('del'),
          title: 'Staff training session',
          description: '12 new hires onboarded to platform',
          owner: 'Maya Fernandes',
          dueDate: '2026-06-30',
          status: 'Done',
        },
        {
          id: uid('del'),
          title: 'Monthly compliance report',
          description: 'HIPAA audit log summary',
          owner: 'Maya Fernandes',
          dueDate: '2026-08-12',
          status: 'Not started',
        },
      ],
      documents: [
        { id: uid('doc'), name: 'Master Service Agreement.pdf', type: 'Contract', date: '2025-09-01' },
        { id: uid('doc'), name: 'BAA - Business Associate Agreement.pdf', type: 'Legal', date: '2025-09-01' },
      ],
      activity: [
        {
          id: uid('act'),
          date: '2026-07-28',
          author: 'Maya Fernandes',
          note: 'Completed staff training for new intake team, positive feedback.',
        },
      ],
      tasks: [],
    },
    {
      id: 'c4',
      name: 'Cobalt Retail Group',
      industry: 'Retail & E-commerce',
      health: 'Active',
      owner: 'Tom Whitfield',
      stage: 'Live',
      contractValue: 134000,
      billingCycle: 'Quarterly',
      startDate: '2023-11-01',
      contacts: [
        { id: uid('ct'), name: 'Isabelle Renard', role: 'Head of Growth', email: 'isabelle@cobaltretail.com', phone: '(213) 555-0299' },
      ],
      invoices: [
        { number: 'INV-2026-0199', amount: 33500, issueDate: '2026-04-01', dueDate: '2026-04-15', status: 'Paid' },
        { number: 'INV-2026-0255', amount: 33500, issueDate: '2026-07-01', dueDate: '2026-07-15', status: 'Paid' },
      ],
      deliverables: [
        {
          id: uid('del'),
          title: 'Loyalty program integration',
          description: 'Sync points ledger with client CRM',
          owner: 'Daniel Cho',
          dueDate: '2026-08-01',
          status: 'In progress',
        },
        {
          id: uid('del'),
          title: 'Holiday campaign asset pack',
          description: '40 creative variants for Q4 push',
          owner: 'Tom Whitfield',
          dueDate: '2026-09-05',
          status: 'Not started',
        },
      ],
      documents: [
        { id: uid('doc'), name: 'Master Service Agreement.pdf', type: 'Contract', date: '2023-10-20' },
        { id: uid('doc'), name: 'SOW - Loyalty Integration.pdf', type: 'SOW', date: '2026-06-15' },
      ],
      activity: [
        {
          id: uid('act'),
          date: '2026-07-30',
          author: 'Tom Whitfield',
          note: 'Reviewed Q4 campaign brief with client marketing team.',
        },
      ],
      tasks: [],
    },
    {
      id: 'c5',
      name: 'Meridian Foods',
      industry: 'Consumer Packaged Goods',
      health: 'Active',
      owner: 'Priya Shah',
      stage: 'Onboarding',
      contractValue: 54000,
      billingCycle: 'Monthly',
      startDate: '2026-07-01',
      contacts: [
        { id: uid('ct'), name: 'Rachel Osei', role: 'Brand Manager', email: 'rachel.osei@meridianfoods.com', phone: '(206) 555-0122' },
      ],
      invoices: [
        { number: 'INV-2026-0455', amount: 4500, issueDate: '2026-07-01', dueDate: '2026-07-15', status: 'Paid' },
      ],
      deliverables: [
        {
          id: uid('del'),
          title: 'Onboarding kickoff deck',
          description: '',
          owner: 'Priya Shah',
          dueDate: '2026-07-10',
          status: 'Done',
        },
        {
          id: uid('del'),
          title: 'Brand guidelines intake',
          description: 'Collect logo files, tone-of-voice doc, product catalog',
          owner: 'Priya Shah',
          dueDate: '2026-08-10',
          status: 'In progress',
        },
      ],
      documents: [{ id: uid('doc'), name: 'Master Service Agreement.pdf', type: 'Contract', date: '2026-06-28' }],
      activity: [
        { id: uid('act'), date: '2026-07-01', author: 'Priya Shah', note: 'Contract signed, onboarding kicked off.' },
      ],
      tasks: [],
    },
    {
      id: 'c6',
      name: 'Arclight Manufacturing',
      industry: 'Industrial Manufacturing',
      health: 'Churned',
      owner: 'Daniel Cho',
      stage: 'Offboarding',
      contractValue: 88000,
      billingCycle: 'Annual',
      startDate: '2022-01-15',
      contacts: [
        { id: uid('ct'), name: 'Victor Kowalski', role: 'Plant Manager', email: 'victor.k@arclightmfg.com', phone: '(414) 555-0164' },
      ],
      invoices: [
        { number: 'INV-2026-0088', amount: 88000, issueDate: '2026-01-15', dueDate: '2026-01-30', status: 'Paid' },
      ],
      deliverables: [
        {
          id: uid('del'),
          title: 'Data export & account closeout',
          description: 'Transfer historical reports to client archive',
          owner: 'Daniel Cho',
          dueDate: '2026-08-18',
          status: 'In progress',
        },
      ],
      documents: [
        { id: uid('doc'), name: 'Master Service Agreement.pdf', type: 'Contract', date: '2022-01-05' },
        { id: uid('doc'), name: 'Termination Notice.pdf', type: 'Legal', date: '2026-07-15' },
      ],
      activity: [
        {
          id: uid('act'),
          date: '2026-07-15',
          author: 'Daniel Cho',
          note: 'Client issued termination notice effective end of contract year; offboarding plan initiated.',
        },
      ],
      tasks: [],
    },
  ];

  // Seed invoices carry only a gross amount and a paid flag. Derive the GST
  // split at 18% and back-fill a single full payment for the paid ones so the
  // payment-history views have something real to show.
  return raw.map((c) => {
    const invoices: Invoice[] = c.invoices.map((inv) => {
      const pct = 18;
      const base = Math.round(inv.amount / (1 + pct / 100));
      return {
        id: uid('inv'),
        number: inv.number,
        amount: inv.amount,
        baseAmount: base,
        gstPercent: pct,
        gstAmount: inv.amount - base,
        gstMode: 'excluded',
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        payments:
          inv.status === 'Paid'
            ? [{ id: uid('pay'), bankAmount: inv.amount, tds: 0, date: inv.issueDate }]
            : [],
      };
    });
    return { ...c, currency: c.currency ?? 'INR', tasks: c.tasks ?? [], invoices };
  });
}
