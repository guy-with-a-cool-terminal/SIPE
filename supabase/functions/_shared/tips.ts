// Rotating money-management tips for the weekly email.

export interface Tip {
  title: string;
  body: string;
}

export const TIPS: Tip[] = [
  { title: "Pay yourself first", body: "Move your savings and investment split out of your spending account the moment income lands — before it can be spent." },
  { title: "Name every shilling", body: "Give each bucket a job. Money without a purpose drifts toward expenses." },
  { title: "Keep a one-month buffer", body: "Aim to hold at least one month of expenses in cash before chasing bigger investment returns." },
  { title: "Review weekly, adjust monthly", body: "Check your numbers every week, but only change your split percentages once a month so you can see real trends." },
  { title: "Separate business and personal", body: "Route client payments through their own account. Mixing the two hides how much you actually earn." },
  { title: "Invoice the day the work ships", body: "The faster you invoice, the faster you get paid. Late invoices are interest-free loans to your clients." },
  { title: "Track the platform float", body: "Money sitting in a platform's ops wallet is still your money — withdraw it on a schedule so it does not get stranded." },
  { title: "Automate the boring transfers", body: "Standing orders for savings beat willpower every time." },
  { title: "Set a spending limit per bucket", body: "A cap on the Expenses bucket turns 'can I afford this?' into a quick yes or no." },
  { title: "Round up your goal target", body: "If you need 95,000, save toward 100,000. The cushion absorbs surprises." },
  { title: "Keep three months for tax", body: "As a freelancer no one withholds tax for you. Park a slice of every payment for it." },
  { title: "Kill one subscription", body: "Once a quarter, cancel the least-used recurring charge. It compounds." },
  { title: "Price for the gaps", body: "Your rate has to cover unpaid time — admin, sick days, dry months. Bill accordingly." },
  { title: "Batch your bill payments", body: "Pay all fixed bills on one day each month so the rest of your balance is genuinely spendable." },
  { title: "Watch your effective hourly rate", body: "Divide monthly take-home by hours actually worked. Cheap clients show up fast." },
  { title: "Grow the Invest bucket slowly", body: "Increase your investment percentage by one or two points after every good month, not all at once." },
  { title: "Reconcile accounts monthly", body: "Match what SIPE says each account holds against the real balance. Small gaps become big ones." },
  { title: "Have a 'no' number", body: "Decide the project size below which you simply decline. It protects your best hours." },
  { title: "Celebrate a hit goal", body: "When a goal completes, mark it achieved and start the next one. Momentum is the point." },
  { title: "Keep an opportunity fund", body: "A little cash set aside for tools, courses or a bulk discount pays for itself." },
];

/**
 * Deterministic weekly rotation — the same tip for every user in a given
 * ISO week, advancing by one each week.
 */
export function tipForWeek(date: Date = new Date()): Tip {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const week = Math.floor(date.getTime() / weekMs);
  const idx = ((week % TIPS.length) + TIPS.length) % TIPS.length;
  return TIPS[idx];
}
