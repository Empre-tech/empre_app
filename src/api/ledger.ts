import { request } from './client';

// ---------------------------------------------------------------------------
// Administración del negocio (backend: /api/entities/:id/ledger/...). Solo el dueño.
// Todo lo que se escribe lleva un client_id generado en el teléfono: reenviar no duplica.
// ---------------------------------------------------------------------------

export type PayMethod = 'cash' | 'transfer' | 'card' | 'credit';
export type LedgerStatus = 'active' | 'voided';
export type PartyKind = 'customer' | 'supplier';

export interface Party {
  id: string;
  client_id: string;
  kind: PartyKind;
  name: string;
  phone: string;
  credit_limit: number | null;
}

export interface PartyBalance extends Party {
  /** Cliente: lo que debe. Proveedor: lo que le debemos. */
  balance: number;
}

export interface SaleLine {
  id?: string;
  item_id?: string;
  name: string;
  qty: number;
  unit_price: number;
  unit_cost?: number;
}

export interface Sale {
  id: string;
  client_id: string;
  occurred_at: string;
  total: number;
  method: PayMethod;
  party_id?: string;
  party?: Party;
  source: 'manual' | 'voice' | 'appointment' | 'offer_claim';
  status: LedgerStatus;
  void_reason?: string;
  note: string;
  lines: SaleLine[];
}

export interface Expense {
  id: string;
  client_id: string;
  occurred_at: string;
  amount: number;
  category: string;
  method: PayMethod;
  party_id?: string;
  party?: Party;
  source: string;
  status: LedgerStatus;
  void_reason?: string;
  note: string;
}

export interface DebtPayment {
  id: string;
  party_id: string;
  direction: 'receivable' | 'payable';
  amount: number;
  method: PayMethod;
  occurred_at: string;
  note: string;
}

export interface SaleInput {
  client_id: string;
  occurred_at?: string;
  total?: number;
  method: PayMethod;
  party_id?: string;
  note?: string;
  lines?: { item_id?: string; name: string; qty: number; unit_price?: number }[];
}

export interface ExpenseInput {
  client_id: string;
  occurred_at?: string;
  amount: number;
  category: string;
  method: PayMethod;
  party_id?: string;
  note?: string;
}

export interface PartyInput {
  client_id: string;
  kind: PartyKind;
  name: string;
  phone?: string;
}

export interface PaymentInput {
  client_id: string;
  party_id: string;
  amount: number;
  method: PayMethod;
  note?: string;
}

export interface TopItem {
  name: string;
  qty: number;
  revenue: number;
}

export type Period = 'day' | 'week' | 'month';

export interface LedgerSummary {
  from: string;
  to: string;
  period: Period;
  sales_total: number;
  sales_count: number;
  expenses_total: number;
  profit: number;
  by_method: { cash: number; transfer: number; card: number; credit: number };
  expenses_by_category: Record<string, number>;
  gross_margin: number;
  margin_coverage_pct: number;
  top_items: TopItem[] | null;
  debts_collected: number;
  debts_paid: number;
  receivable: number;
  payable: number;
  cash_in: number;
  cash_out: number;
  prev_sales_total: number;
  prev_expenses_total: number;
}

export interface ItemCost {
  id: string;
  name: string;
  price: number | null;
  cost: number | null;
}

// ---- voz ----

export type VoiceActionType = 'sale' | 'expense' | 'payment';

export interface VoiceLine {
  name: string;
  qty: number;
  unit_price?: number | null;
  item_id?: string;
  from_catalog?: boolean;
}

export interface VoiceAction {
  client_id: string;
  type: VoiceActionType;
  amount: number;
  words: string;
  method: PayMethod;
  category?: string;
  note?: string;
  lines?: VoiceLine[];
  days_ago: number;
  party_id?: string;
  party_name?: string;
  new_party?: boolean;
  candidates?: { id: string; name: string }[];
  warnings?: string[];
}

export interface VoiceResult {
  draft_id: string;
  text: string;
  actions: VoiceAction[];
  message?: string;
}

export interface VoiceConfirmResult {
  already: boolean;
  created: { type: VoiceActionType; id: string; amount: number }[];
}

const base = (id: string) => `/api/entities/${id}/ledger`;

export const ledgerApi = {
  summary: (entityId: string, period: Period, date?: string) =>
    request<LedgerSummary>(`${base(entityId)}/summary`, { query: { period, date } }),

  sales: async (entityId: string, query?: { limit?: number; from?: string; to?: string; before?: string }) =>
    (await request<{ sales: Sale[] | null }>(`${base(entityId)}/sales`, { query })).sales ?? [],
  createSale: (entityId: string, input: SaleInput) =>
    request<Sale>(`${base(entityId)}/sales`, { method: 'POST', body: input }),
  voidSale: (entityId: string, saleId: string, reason: string) =>
    request<Sale>(`${base(entityId)}/sales/${saleId}/void`, { method: 'POST', body: { reason } }),

  expenses: async (entityId: string, query?: { limit?: number; from?: string; to?: string; before?: string }) =>
    (await request<{ expenses: Expense[] | null }>(`${base(entityId)}/expenses`, { query })).expenses ?? [],
  createExpense: (entityId: string, input: ExpenseInput) =>
    request<Expense>(`${base(entityId)}/expenses`, { method: 'POST', body: input }),
  voidExpense: (entityId: string, expenseId: string, reason: string) =>
    request<Expense>(`${base(entityId)}/expenses/${expenseId}/void`, { method: 'POST', body: { reason } }),

  parties: async (entityId: string, query?: { kind?: PartyKind; owing?: '1' }) =>
    (await request<{ parties: PartyBalance[] | null }>(`${base(entityId)}/parties`, { query })).parties ?? [],
  createParty: (entityId: string, input: PartyInput) =>
    request<Party>(`${base(entityId)}/parties`, { method: 'POST', body: input }),
  payments: async (entityId: string, partyId: string) =>
    (await request<{ payments: DebtPayment[] | null }>(`${base(entityId)}/parties/${partyId}/payments`)).payments ?? [],
  createPayment: (entityId: string, input: PaymentInput) =>
    request<DebtPayment>(`${base(entityId)}/payments`, { method: 'POST', body: input }),

  items: async (entityId: string) =>
    (await request<{ items: ItemCost[] | null }>(`${base(entityId)}/items`)).items ?? [],
  setItemCost: (entityId: string, itemId: string, cost: number | null) =>
    request<{ ok: boolean }>(`${base(entityId)}/items/${itemId}/cost`, { method: 'PUT', body: { cost } }),

  voiceParse: (entityId: string, text: string) =>
    request<VoiceResult>(`${base(entityId)}/voice/parse`, { method: 'POST', body: { text } }),
  voiceConfirm: (entityId: string, draftId: string, actions: VoiceAction[]) =>
    request<VoiceConfirmResult>(`${base(entityId)}/voice/${draftId}/confirm`, { method: 'POST', body: { actions } }),
  voiceDiscard: (entityId: string, draftId: string) =>
    request<{ ok: boolean }>(`${base(entityId)}/voice/${draftId}/discard`, { method: 'POST' }),
};
