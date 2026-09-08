export type Bucket = "S" | "I" | "P" | "E";
export type TxnType = "income" | "expense";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  currency: string;
  created_at: string;
}

export interface AllocationSettings {
  user_id: string;
  savings_pct: number;
  invest_pct: number;
  pay_pct: number;
  expenses_pct: number;
  updated_at: string;
  savings_limit:  number | null;
  invest_limit:   number | null;
  pay_limit:      number | null;
  expenses_limit: number | null;
}

export interface ExpenseTemplate {
  id: string;
  user_id: string;
  name: string;
  category: string | null;
  bucket: Bucket;
  amount: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TxnType;
  bucket: Bucket | null;
  amount: number;
  category: string | null;
  description: string | null;
  paystack_ref: string | null;
  parent_id: string | null;
  account_id: string | null;
  template_id: string | null;
  source: string | null;
  payment_link_id: string | null;
  occurred_at: string;
  created_at: string;
}

export interface Debt {
  id: string;
  user_id: string;
  direction: "owe" | "owed";
  party: string;
  description: string | null;
  amount: number;
  due_date: string | null;
  settled: boolean;
  settled_at: string | null;
  created_at: string;
}

export interface DebtPayment {
  id: string;
  debt_id: string;
  user_id: string;
  amount: number;
  note: string | null;
  paid_at: string;
}

export interface BucketBalance {
  user_id: string;
  bucket: Bucket;
  allocated: number;
  spent: number;
  balance: number;
}

export const BUCKET_META: Record<Bucket, { name: string; color: string }> = {
  S: { name: "Savings", color: "var(--bucket-s)" },
  I: { name: "Invest", color: "var(--bucket-i)" },
  P: { name: "Pay yourself", color: "var(--bucket-p)" },
  E: { name: "Expenses", color: "var(--bucket-e)" },
};

export const formatKES = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 }).format(n);

// ─── Accounts ──────────────────────────────────────────────────────────────

export type AccountKind = "platform" | "bank" | "mpesa" | "cash" | "other";

export interface Account {
  id: string;
  user_id: string;
  name: string;
  kind: AccountKind;
  institution: string | null;
  provider_slug: string | null;
  route_kind: "ops" | "costs" | null;
  opening_balance: number;
  opening_balance_at: string;
  is_default: boolean;
  archived: boolean;
  color: string | null;
  notes: string | null;
  sync_config: Record<string, unknown>;
  last_synced_at: string | null;
  created_at: string;
}

export interface AccountTransfer {
  id: string;
  user_id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  fee: number;
  note: string | null;
  occurred_at: string;
  created_at: string;
}

export interface AccountAdjustment {
  id: string;
  user_id: string;
  account_id: string;
  amount: number;
  reason: string | null;
  occurred_at: string;
  created_at: string;
}

export interface AccountBalance {
  account_id: string;
  user_id: string;
  balance: number;
  inflow: number;
  outflow: number;
  last_synced_at: string | null;
}

// ─── Goals ─────────────────────────────────────────────────────────────────

export type GoalStatus = "active" | "achieved" | "paused" | "archived";
export type GoalFunding = "bucket" | "account" | "manual" | "deposit_pct";

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  target_amount: number;
  target_date: string | null;
  status: GoalStatus;
  funding: GoalFunding;
  bucket: Bucket | null;
  account_id: string | null;
  deposit_pct: number | null;
  sort_order: number;
  notes: string | null;
  created_at: string;
  achieved_at: string | null;
}

export interface GoalContribution {
  id: string;
  goal_id: string;
  user_id: string;
  amount: number;
  note: string | null;
  auto: boolean;
  transaction_id: string | null;
  occurred_at: string;
  created_at: string;
}

export interface GoalProgress {
  goal_id: string;
  user_id: string;
  current_amount: number;
  target_amount: number;
  contribution_count: number;
  last_contribution_at: string | null;
}

// ─── Email & notifications ─────────────────────────────────────────────────

export interface EmailPreferences {
  user_id: string;
  weekly_review: boolean;
  tips: boolean;
  announcements: boolean;
  goal_updates: boolean;
  unsubscribe_token: string;
  updated_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body_md: string;
  cta_label: string | null;
  cta_url: string | null;
  published_at: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  ref_id: string | null;
  read_at: string | null;
  created_at: string;
}
