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
  /** Autorizó guardar su celular y recibir mensajes del negocio (Ley 1581). */
  accepts_messages?: boolean;
  consent_at?: string;
  /** Nota opcional del dueño para reconocerlo («el del taller de la esquina»). */
  note?: string;
}

export interface PartyBalance extends Party {
  /** Cliente: lo que debe. Proveedor: lo que le debemos. */
  balance: number;
  /** Desde cuándo está pendiente. */
  oldest_at?: string;
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
  /** La parte que no se pagó con method. Con «credit» es lo que quedó en «Te deben». */
  method2?: PayMethod;
  amount2?: number;
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
  /** Dos formas de pago: lo que no fue con method. Con «credit», el resto queda en «Te deben» y pide party_id. */
  method2?: PayMethod;
  amount2?: number;
  party_id?: string;
  note?: string;
  lines?: { item_id?: string; name: string; qty: number; unit_price?: number }[];
}

export interface PurchaseLineInput {
  item_id?: string;
  stock_item_id?: string;
  name?: string;
  /** Siempre en unidades (la app convierte pacas y bultos). */
  qty: number;
  unit_cost: number;
}

export interface ExpenseInput {
  client_id: string;
  occurred_at?: string;
  /** 0 con renglones: el servidor suma el total. */
  amount: number;
  category: string;
  method: PayMethod;
  party_id?: string;
  note?: string;
  lines?: PurchaseLineInput[];
}

export interface CashMoveInput {
  client_id: string;
  occurred_at?: string;
  direction: 'in' | 'out';
  amount: number;
  reason: string;
}

export interface CashMove {
  id: string;
  occurred_at: string;
  direction: 'in' | 'out';
  amount: number;
  reason: string;
  status: 'active' | 'voided';
}

export interface CashCloseInput {
  day: string;
  /** Con cuánto abrió: solo cuando no hay un cierre anterior del que sacarlo. */
  opening?: number;
  counted: number;
  base_next: number;
}

export interface CashClose {
  day: string;
  opening?: number;
  counted: number;
  expected: number;
  base_next: number;
}

/** La cuenta de la caja de un día. */
export interface CashDay {
  day: string;
  base: number;
  base_known: boolean;
  /** Lo que cambió la caja en los días sin cerrar; ya va sumado en base. */
  carried: number;
  flow: { sales: number; sales_count: number; expenses: number; expenses_count: number; debts_in: number; debts_out: number; moves_in: number; moves_out: number };
  expected: number;
  moves: CashMove[] | null;
  close: CashClose | null;
}

export interface PartyInput {
  client_id: string;
  kind: PartyKind;
  name: string;
  phone?: string;
  accepts_messages?: boolean;
  note?: string;
}

export interface PartyUpdate {
  name?: string;
  phone?: string;
  accepts_messages?: boolean;
  note?: string;
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

/** Cifras de un rango (Empre Finance). */
export interface PeriodTotals {
  sales_total: number;
  sales_count: number;
  expenses_total: number;
  profit: number;
  /** «Te quedó»: lo que entró menos los gastos, sin lo fiado. Un backend viejo no lo manda. */
  left?: number;
  /** Ventas sin lo fiado, más abonos de clientes. Un backend viejo no lo manda. */
  entered?: number;
  /** Gastos pagados, más pagos a proveedores. Un backend viejo no lo manda. */
  out?: number;
  debts_collected?: number;
  debts_paid?: number;
  /** Comprado a crédito en el rango: aún no sale. */
  expenses_credit?: number;
  out_by_category?: Record<string, number>;
  avg_ticket: number;
  by_method: { cash: number; transfer: number; card: number; credit: number };
  /** De dónde vinieron las ventas. Un backend viejo no lo manda. */
  by_source?: { manual: number; offers: number; agenda: number };
  expenses_by_category: Record<string, number>;
  gross_margin: number;
  margin_coverage_pct: number;
  costed_revenue: number;
}

export interface ProductStat {
  ref: string;
  name: string;
  qty: number;
  revenue: number;
  costed_revenue: number;
  profit: number | null;
  margin_pct: number | null;
}

export interface InvLine {
  ref: string;
  name: string;
  text: string;
  tone: 'out' | 'low' | 'muted';
  value?: number;
}

export interface InventoryMoney {
  value_cost: number;
  value_price: number;
  valued: number;
  products: number;
  by_section: { name: string; value: number }[];
  soon_count: number;
  soon: InvLine[];
  lost_total: number;
  lost: InvLine[];
  idle_total: number;
  idle: InvLine[];
}

export interface Analytics {
  from: string;
  to: string;
  days: number;
  compare: 'prev' | 'month' | 'year';
  compare_from: string;
  compare_to: string;
  current: PeriodTotals;
  previous: PeriodTotals;
  bucket: 'day' | 'week' | 'month';
  series: { start: string; sales: number; expenses: number; in?: number; out?: number; left?: number }[];
  /** Las ventas del periodo con que se compara, barra por barra. */
  previous_series?: number[];
  /** Por día: lo que se suele vender ese día de la semana. No viene sin historia suficiente. */
  normal?: number[];
  /** heat[día][franja]: lunes = 0; mañana, mediodía, tarde, noche. */
  heat: number[][];
  products: ProductStat[];
  uncosted_count: number;
  uncosted_revenue: number;
  receivable: number;
  payable: number;
  inventory: InventoryMoney;
}

export interface ItemCost {
  id: string;
  name: string;
  price: number | null;
  cost: number | null;
}

// ---- voz ----

export type VoiceActionType = 'sale' | 'expense' | 'payment' | 'stock' | 'tab_add' | 'tab_pay';

// ---- inventario ----

export type StockMode = 'none' | 'light' | 'exact';
export type StockLevel = 'ok' | 'low' | 'out';
export type StockStatus = 'ok' | 'low' | 'out' | 'unknown' | 'none';
export type SetupChoice = 'recommended' | 'simple' | 'none';
export type AdjustReason = 'conteo' | 'danado' | 'vencido' | 'consumo' | 'perdida' | 'otro';

export interface InventoryItem {
  /** Producto: su id de catálogo. Insumo: su id propio. Sirve de referencia en todas las llamadas. */
  ref: string;
  item_id?: string;
  kind: 'product' | 'supply';
  name: string;
  section?: string;
  price: number | null;
  cost: number | null;
  /** 'unset' = nadie ha decidido el control de este producto todavía. */
  mode: StockMode | 'unset';
  suggested_mode: StockMode;
  qty: number;
  level: StockLevel;
  status: StockStatus;
  /** Ya se contó alguna vez (sin conteo, la cantidad exacta no se descuenta). */
  counted: boolean;
  unit: string;
  pack_size: number | null;
  low_at: number | null;
  days_left: number | null;
  /** Unidades vendidas en 28 días. */
  sold_28: number;
  is_service: boolean;
  /** Los insumos que usa este plato o producto. */
  ingredients: NameStatus[];
  /** Los platos que usan este insumo. */
  used_in: NameStatus[];
  /** Id de su existencia, si la tiene. */
  stock_id?: string;
  /** Producto que además se usa como insumo («también lo uso»). */
  also_supply?: boolean;
  /** Sección del insumo (Carnes y pollo, Desechables y empaques…): su nombre y su id. Un producto que también se usa trae
   * su sección del catálogo (solo el nombre). */
  group?: string;
  section_id?: string;
  /** Para cuántas unidades alcanzan sus insumos (si todos tienen cantidad y se cuentan) y cuál limita. */
  servings?: number | null;
  limit?: string;
  /** Variante: el producto al que pertenece y su parte corta. */
  parent_id?: string;
  variant_label?: string;
  /** Cuántas variantes tiene (si tiene, agrupa: no se cuenta ni se vende). */
  variants?: number;
  /** Cuántos llegaron en la última compra registrada («como la última vez»). */
  last_purchase?: number;
  /** Id de la foto de portada (la variante sin fotos usa la del producto). */
  photo?: string;
}

/** Las pestañas del inventario (tablero «Inventario», 2026-11-16). */
export type InventoryTab = 'product' | 'service' | 'supply';
export type InventoryState = 'low' | 'out' | 'nophoto';
export type InventorySort = 'az' | 'stock' | 'sales';

export interface InventoryPageQuery {
  tab: InventoryTab;
  q?: string;
  section?: string;
  state?: InventoryState;
  sort?: InventorySort;
  /** El next_cursor de la página anterior. */
  cursor?: string;
  limit?: number;
}

/** Una página: las filas de arriba, las variantes de esos productos (para plegarlas), el total con ese filtro y el
 * cursor de la siguiente (sin cursor, no hay más). */
export interface InventoryPage {
  items: InventoryItem[];
  variants: InventoryItem[];
  total: number;
  next_cursor?: string;
}

export interface InventoryTabCounts {
  total: number;
  low: number;
  out: number;
  no_photo: number;
  /** Cada sección con cuántas filas tiene y cuántas se acaban o se acabaron (el punto rojo de la fila de secciones). */
  sections: { name: string; count: number; low?: number; out?: number; counted_at?: string | null }[];
}

/**
 * Lo de arriba de Inventario ya contado en el servidor (avisos, empezar a llevar inventario, revisar qué es cada cosa y la
 * nota de precios), para no bajar todas las filas ni el catálogo entero.
 */
export interface InventorySummary {
  kind: string;
  category: string;
  unset: number;
  tracked: number;
  alerts: { out: number; soon: number; risk: number; total: number };
  unchecked: { id: string; name: string; kind: 'service' | 'product' }[];
  unchecked_total: number;
  prices: { priced: number; stale: number; oldest_at?: string | null };
}

/** Los números de las tres pestañas y del filtro, sin las filas. */
export interface InventoryCounts {
  products: InventoryTabCounts;
  services: InventoryTabCounts;
  supplies: InventoryTabCounts;
}

export interface NameStatus {
  ref: string;
  name: string;
  status: StockStatus;
  /** Cuánto gasta cada unidad vendida (receta), en la unidad del insumo. */
  qty?: number | null;
  unit?: string;
}

// ---- cuentas abiertas ----

export interface OpenTabLine {
  id: string;
  tab_id?: string;
  item_id?: string | null;
  name: string;
  qty: number;
  unit_price: number;
  removed: boolean;
}

/** Una cuenta que se va llenando y se cobra al final (la mesa 3, el cliente de la silla 2). */
export interface OpenTab {
  id: string;
  name: string;
  status: 'open' | 'paid' | 'cancelled' | string;
  opened_at: string;
  closed_at?: string | null;
  sale_id?: string | null;
  tip?: number;
  appointment_id?: string | null;
  lines: OpenTabLine[];
  total: number;
  /** Solo en el teléfono: cambios sin enviar. */
  pending?: boolean;
}

/** id lo genera la app: así la cuenta se puede llenar sin señal antes de enviarse. */
export interface OpenTabInput {
  id: string;
  name: string;
  appointment_id?: string;
}

export interface TabLineInput {
  id: string;
  item_id?: string;
  name: string;
  qty: number;
  unit_price?: number;
}

/** sale_id es el client_id de la venta que se crea al cobrar. Fiado (credit) necesita el cliente. */
export interface PayTabInput {
  sale_id: string;
  method: PayMethod;
  party_id?: string;
  tip?: number;
}

/** Un insumo de una receta: su referencia y, opcional, cuánto gasta cada unidad vendida. */
export interface RecipeLine {
  ref: string;
  qty?: number | null;
}

export interface InventoryOverview {
  kind: string;
  category: string;
  mode: StockMode;
  /** Negocio de platos o preparados: se vende tocando fichas, sin existencias de cada plato. */
  quick_sale: boolean;
  /** Productos que aún no tienen control. */
  unset: number;
  explain: string;
  items: InventoryItem[];
}

export interface Insight {
  kind: 'soon' | 'out' | 'low' | 'idle' | 'margin' | 'loss' | 'setup' | string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  body: string;
  ref?: string;
}

export interface ItemSettings {
  mode?: StockMode;
  unit?: string;
  pack_size?: number;
  low_at?: number;
  clear_pack?: boolean;
  clear_low_at?: boolean;
  /** «También lo uso en mis servicios o platos» (solo productos). */
  also_supply?: boolean;
  /** Cambia la sección de un insumo (solo insumos). */
  section_id?: string;
}

export interface VoiceLine {
  name: string;
  qty: number;
  unit_price?: number | null;
  item_id?: string;
  from_catalog?: boolean;
  /** Solo en el teléfono: el producto tiene variantes y falta elegir cuál se vendió. */
  choose?: { ref: string; label: string; name: string; price: number | null; out: boolean }[];
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
  /** Cliente nuevo: su celular y si autorizó recibir mensajes, puestos en la hoja antes de confirmar. */
  party_phone?: string;
  accepts_messages?: boolean;
  candidates?: { id: string; name: string; phone_tail?: string; note?: string }[];
  /** El dueño eligió «Ninguno de estos»: se guarda sin cliente a propósito. */
  no_party?: boolean;
  warnings?: string[];
  /** Solo en el teléfono: sumar, descontar o contar lo que dijo. `from` es lo que hay contado; null si no se lleva la cuenta. */
  stock_move?: { kind: 'add' | 'remove' | 'count'; qty: number; from: number | null; reason: AdjustReason; counted?: number };
  /** Solo en el teléfono: dijo cuánto vale un producto que ya existe. Se cambia si el dueño lo confirma. */
  price_ask?: { item_id: string; from: number | null; to: number };
  price_ok?: boolean;
  /** type = stock: de qué producto o insumo habla y qué dijo (nivel o cantidad contada). */
  item_ref?: string;
  item_name?: string;
  level?: StockLevel;
  counted?: number;
  /** Cuentas abiertas: a qué cuenta va o, si no existe, con qué nombre se abre. */
  tab_id?: string;
  tab_name?: string;
  new_tab?: boolean;
}

export interface VoiceResult {
  draft_id: string;
  text: string;
  actions: VoiceAction[];
  message?: string;
  /** Si fue una pregunta (no algo que registrar): la respuesta de Empre AI con los datos del negocio. */
  answer?: string;
}

export interface VoiceConfirmResult {
  already: boolean;
  created: { type: VoiceActionType; id: string; amount: number }[];
}

const base = (id: string) => `/api/entities/${id}/ledger`;

export const ledgerApi = {
  summary: (entityId: string, period: Period, date?: string) =>
    request<LedgerSummary>(`${base(entityId)}/summary`, { query: { period, date } }),

  /** Análisis de un rango libre (fechas AAAA-MM-DD, ambas incluidas). */
  analytics: (entityId: string, q: { from: string; to: string; compare: 'prev' | 'month' | 'year' }) =>
    request<Analytics>(`${base(entityId)}/analytics`, { query: q }),

  sales: async (entityId: string, query?: { limit?: number; from?: string; to?: string; before?: string; party_id?: string }) =>
    (await request<{ sales: Sale[] | null }>(`${base(entityId)}/sales`, { query })).sales ?? [],
  createSale: (entityId: string, input: SaleInput) =>
    request<Sale>(`${base(entityId)}/sales`, { method: 'POST', body: input }),
  setSaleMethod: (entityId: string, saleId: string, method: PayMethod) =>
    request<Sale>(`${base(entityId)}/sales/${saleId}/method`, { method: 'PUT', body: { method } }),
  /** Lo cobrado en un canje cuya oferta no decía el precio en pesos: queda como venta de Empre Offers. */
  recordClaimSale: (entityId: string, claimId: string, total: number, method: PayMethod) =>
    request<Sale>(`${base(entityId)}/claims/${claimId}/sale`, { method: 'POST', body: { total, method } }),
  voidSale: (entityId: string, saleId: string, reason: string) =>
    request<Sale>(`${base(entityId)}/sales/${saleId}/void`, { method: 'POST', body: { reason } }),

  expenses: async (entityId: string, query?: { limit?: number; from?: string; to?: string; before?: string }) =>
    (await request<{ expenses: Expense[] | null }>(`${base(entityId)}/expenses`, { query })).expenses ?? [],
  cash: (entityId: string) => request<CashDay>(`${base(entityId)}/cash`),
  createCashMove: (entityId: string, input: CashMoveInput) =>
    request<CashMove>(`${base(entityId)}/cash/moves`, { method: 'POST', body: input }),
  voidCashMove: (entityId: string, moveId: string) =>
    request<CashMove>(`${base(entityId)}/cash/moves/${moveId}/void`, { method: 'POST' }),
  closeCash: (entityId: string, input: CashCloseInput) =>
    request<CashClose>(`${base(entityId)}/cash/close`, { method: 'POST', body: input }),
  createExpense: (entityId: string, input: ExpenseInput) =>
    request<Expense>(`${base(entityId)}/expenses`, { method: 'POST', body: input }),
  voidExpense: (entityId: string, expenseId: string, reason: string) =>
    request<Expense>(`${base(entityId)}/expenses/${expenseId}/void`, { method: 'POST', body: { reason } }),

  parties: async (entityId: string, query?: { kind?: PartyKind; owing?: '1' }) =>
    (await request<{ parties: PartyBalance[] | null }>(`${base(entityId)}/parties`, { query })).parties ?? [],
  createParty: (entityId: string, input: PartyInput) =>
    request<Party>(`${base(entityId)}/parties`, { method: 'POST', body: input }),
  updateParty: (entityId: string, partyId: string, input: PartyUpdate) =>
    request<Party>(`${base(entityId)}/parties/${partyId}`, { method: 'PATCH', body: input }),
  payments: async (entityId: string, partyId: string) =>
    (await request<{ payments: DebtPayment[] | null }>(`${base(entityId)}/parties/${partyId}/payments`)).payments ?? [],
  createPayment: (entityId: string, input: PaymentInput) =>
    request<DebtPayment>(`${base(entityId)}/payments`, { method: 'POST', body: input }),

  items: async (entityId: string) =>
    (await request<{ items: ItemCost[] | null }>(`${base(entityId)}/items`)).items ?? [],
  setItemCost: (entityId: string, itemId: string, cost: number | null) =>
    request<{ ok: boolean }>(`${base(entityId)}/items/${itemId}/cost`, { method: 'PUT', body: { cost } }),

  inventory: (entityId: string) => request<InventoryOverview>(`${base(entityId)}/inventory`),
  /** Una página de una pestaña del inventario: se busca y se filtra en el servidor. */
  inventoryPage: (entityId: string, q: InventoryPageQuery) =>
    request<InventoryPage>(`${base(entityId)}/inventory/page`, {
      query: { tab: q.tab, q: q.q || undefined, section: q.section || undefined, state: q.state, sort: q.sort, cursor: q.cursor, limit: q.limit },
    }),
  /** Los números de las pestañas y del filtro. */
  inventoryCounts: (entityId: string) => request<InventoryCounts>(`${base(entityId)}/inventory/counts`),
  /** Guarda el conteo de una sección de una vez (reenviar el mismo client_id no lo aplica dos veces). */
  countSection: (
    entityId: string,
    input: { client_id: string; tab: 'product' | 'supply'; section: string; lines: { ref: string; expected?: number; counted?: number; level?: StockLevel; reason?: string }[] },
  ) => request<{ counted: number; changed: number; counted_at: string }>(`${base(entityId)}/inventory/count`, { method: 'POST', body: input }),
  /** Cuántos dictados de Empre AI lleva el negocio este mes y su tope (0 = sin tope). */
  voiceUsage: (entityId: string) => request<{ used: number; limit: number; pro: boolean }>(`${base(entityId)}/voice/usage`),
  /** Lo de arriba de Inventario, ya contado. */
  inventorySummary: (entityId: string) => request<InventorySummary>(`${base(entityId)}/inventory/summary`),
  /** Solo las filas pedidas (por id de la fila o de su ítem del catálogo; hasta 100). */
  inventoryItems: async (entityId: string, ids: string[]): Promise<InventoryItem[]> =>
    (await request<{ items: InventoryItem[] | null }>(`${base(entityId)}/inventory/items`, { query: { ids: ids.slice(0, 100).join(',') } })).items ?? [],
  /** Los nombres de todas las filas (para Empre AI y para no repetir un insumo). Se piden al abrir esas hojas. */
  inventoryNames: async (entityId: string): Promise<{ name: string; kind: 'product' | 'supply' }[]> =>
    (await request<{ names: { name: string; kind: 'product' | 'supply' }[] | null }>(`${base(entityId)}/inventory/names`)).names ?? [],
  setupInventory: (entityId: string, choice: SetupChoice) =>
    request<InventoryOverview>(`${base(entityId)}/inventory/setup`, { method: 'POST', body: { choice } }),
  stockSettings: (entityId: string, ref: string, input: ItemSettings) =>
    request<InventoryOverview>(`${base(entityId)}/inventory/${ref}/settings`, { method: 'PUT', body: input }),
  setIngredients: (entityId: string, ref: string, supplies: string[]) =>
    request<InventoryOverview>(`${base(entityId)}/inventory/${ref}/ingredients`, { method: 'PUT', body: { supplies } }),
  /** Insumos de un ítem con cantidades opcionales (receta). */
  setRecipe: (entityId: string, ref: string, items: RecipeLine[]) =>
    request<InventoryOverview>(`${base(entityId)}/inventory/${ref}/ingredients`, { method: 'PUT', body: { items } }),
  setLevel: (entityId: string, ref: string, clientId: string, level: StockLevel) =>
    request<{ ok: boolean }>(`${base(entityId)}/inventory/${ref}/level`, { method: 'PUT', body: { client_id: clientId, level } }),
  adjust: (
    entityId: string,
    input: { client_id: string; ref: string; counted?: number; delta?: number; reason?: AdjustReason },
  ) => request<InventoryItem>(`${base(entityId)}/inventory/adjust`, { method: 'POST', body: input }),
  createSupply: (entityId: string, input: { client_id: string; name: string; unit?: string; mode?: StockMode; qty?: number; section_id?: string }) =>
    request<{ id: string; name: string }>(`${base(entityId)}/supplies`, { method: 'POST', body: input }),
  /** «Ya llegó»: suma lo que llegó y, con `paid`, registra la compra como gasto de mercancía. */
  arrived: (entityId: string, ref: string, input: { client_id: string; qty: number; paid?: number; method?: 'cash' | 'transfer' | 'card' }) =>
    request<InventoryOverview>(`${base(entityId)}/inventory/${ref}/arrived`, { method: 'POST', body: input }),
  archiveSupply: (entityId: string, ref: string) =>
    request<{ ok: boolean }>(`${base(entityId)}/supplies/${ref}`, { method: 'DELETE' }),
  insights: async (entityId: string) =>
    (await request<{ insights: Insight[] | null }>(`${base(entityId)}/insights`)).insights ?? [],

  /** tabId: se dicta desde dentro de una cuenta abierta (lo pedido va a esa cuenta). */
  voiceParse: (entityId: string, text: string, tabId?: string, module?: 'finance' | 'inventory' | 'debts') =>
    request<VoiceResult>(`${base(entityId)}/voice/parse`, { method: 'POST', body: { text, tab_id: tabId, module } }),

  // ---- cuentas abiertas ----
  tabs: async (entityId: string) => (await request<{ items: OpenTab[] | null }>(`${base(entityId)}/tabs`)).items ?? [],
  openTab: (entityId: string, input: OpenTabInput) => request<OpenTab>(`${base(entityId)}/tabs`, { method: 'POST', body: input }),
  addToTab: (entityId: string, tabId: string, lines: TabLineInput[]) =>
    request<OpenTab>(`${base(entityId)}/tabs/${tabId}/lines`, { method: 'POST', body: { lines } }),
  removeFromTab: (entityId: string, tabId: string, lineId: string) =>
    request<OpenTab>(`${base(entityId)}/tabs/${tabId}/lines/${lineId}`, { method: 'DELETE' }),
  payTab: (entityId: string, tabId: string, input: PayTabInput) => request<OpenTab>(`${base(entityId)}/tabs/${tabId}/pay`, { method: 'POST', body: input }),
  cancelTab: (entityId: string, tabId: string, reason: string) =>
    request<OpenTab>(`${base(entityId)}/tabs/${tabId}/cancel`, { method: 'POST', body: { reason } }),
  voiceConfirm: (entityId: string, draftId: string, actions: VoiceAction[]) =>
    request<VoiceConfirmResult>(`${base(entityId)}/voice/${draftId}/confirm`, { method: 'POST', body: { actions } }),
  voiceDiscard: (entityId: string, draftId: string) =>
    request<{ ok: boolean }>(`${base(entityId)}/voice/${draftId}/discard`, { method: 'POST' }),
};
