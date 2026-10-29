export interface UsageTotals {
  images: number;
  requests: number;
  /** Relay usage has no Anlas price. */
  anlas: number | null;
  quota: number | null;
  estimated: boolean;
}
export interface UsageBreakdown extends UsageTotals {
  byOperation: Record<string, UsageTotals>;
  byModel: Record<string, UsageTotals>;
  agent: UsageTotals;
}
export interface UsageSummary extends UsageBreakdown {
  range: 'today' | 'week' | 'month';
  from: string;
  to: string;
  connection: 'official' | 'relay' | 'all';
}
export interface UsageDaily {
  days: number;
  connection: 'official' | 'relay' | 'all';
  items: (UsageBreakdown & { date: string })[];
}
