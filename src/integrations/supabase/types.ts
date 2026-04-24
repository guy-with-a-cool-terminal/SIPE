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
  occurred_at: string;
  created_at: string;
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
