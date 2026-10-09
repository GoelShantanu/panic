// PRD-007 tier limits, with D-077 history windows. Must match plan_entitlement
// after migration 0019 (verified by the db integration test).

export type Tier = 'free' | 'paid';
export type HistoryAccess = 'free' | 'trial' | 'paid';
export const HISTORY_DAYS: Readonly<Record<HistoryAccess, number>> = { free: 3, trial: 10, paid: 30 };

export interface Entitlements {
  readonly watchlistLimit: number;
  readonly alertBudgetCeiling: number;
  readonly defaultAlertBudget: number;
  readonly historyDays: number;
  readonly alertHistoryDays: number;
  readonly multiEventFilter: boolean;
  readonly streamFilingsOnly: boolean;
  readonly savedViews: number;
}

export const ENTITLEMENTS: Readonly<Record<Tier, Entitlements>> = {
  free: {
    watchlistLimit: 20,
    alertBudgetCeiling: 5,
    defaultAlertBudget: 5,
    historyDays: 3,
    alertHistoryDays: 30,
    multiEventFilter: false,
    streamFilingsOnly: false,
    savedViews: 0,
  },
  paid: {
    watchlistLimit: 200,
    alertBudgetCeiling: 30,
    defaultAlertBudget: 10,
    historyDays: 30,
    alertHistoryDays: 365,
    multiEventFilter: true,
    streamFilingsOnly: true,
    savedViews: 10,
  },
};

// PRD-007 §4.2 wire shape.
export interface EntitlementsPayload {
  watchlist_limit: number;
  alert_budget_ceiling: number;
  history_days: number;
  alert_history_days: number;
  multi_event_filter: boolean;
  saved_views: number;
}

export function entitlementsPayload(tier: Tier, historyAccess: HistoryAccess = tier): EntitlementsPayload {
  const e = ENTITLEMENTS[tier];
  return {
    watchlist_limit: e.watchlistLimit,
    alert_budget_ceiling: e.alertBudgetCeiling,
    history_days: HISTORY_DAYS[historyAccess],
    alert_history_days: e.alertHistoryDays,
    multi_event_filter: e.multiEventFilter,
    saved_views: e.savedViews,
  };
}

// PRD-007 §4.2: every 402 across PRDs uses this body.
export type EntitlementKey = keyof EntitlementsPayload;

export function upgradeRequired(feature: EntitlementKey): {
  error: 'upgrade_required';
  feature: EntitlementKey;
  limit: number | boolean | null;
  paid_value: number | boolean | null;
} {
  return {
    error: 'upgrade_required',
    feature,
    limit: entitlementsPayload('free')[feature],
    paid_value: entitlementsPayload('paid')[feature],
  };
}
