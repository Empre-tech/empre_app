import { sameNameItem } from './voiceNewItem.ts';

/** Lo mínimo de un producto del inventario para saber si tiene tallas (o sabores) y cuáles. */
export interface VariantSource {
  ref: string;
  name: string;
  kind: 'product' | 'supply';
  price: number | null;
  status?: string;
  parent_id?: string;
  variant_label?: string;
  variants?: number;
}

export interface VariantOption {
  ref: string;
  label: string;
  name: string;
  price: number | null;
  out: boolean;
}

export interface LineWithChoice {
  name: string;
  qty: number;
  unit_price?: number | null;
  item_id?: string;
  from_catalog?: boolean;
  /** Solo en el teléfono: el producto tiene variantes y hay que elegir cuál se vendió. */
  choose?: VariantOption[];
}

/**
 * «Vendí un top» cuando «Top» tiene tallas (2026-11-24): un producto con variantes no se vende solo (el servidor lo
 * rechaza), así que el renglón queda con sus opciones para que el dueño toque la talla. Si ya dijo una, no se pregunta.
 */
export function withVariantChoices<L extends LineWithChoice>(lines: L[], items: VariantSource[]): L[] {
  return lines.map((l) => {
    const byId = l.item_id ? items.find((i) => i.ref === l.item_id) : undefined;
    if (byId?.parent_id) return l;
    const parent: VariantSource | null = byId ?? sameNameItem(l.name, items.filter((i) => i.kind === 'product' && !i.parent_id));
    if (!parent) return l;
    const kids = items.filter((i) => i.parent_id === parent.ref);
    if (kids.length === 0) return l;
    const choose = kids.map((k) => ({
      ref: k.ref,
      label: k.variant_label || k.name,
      name: k.name,
      price: k.price ?? parent.price,
      out: k.status === 'out',
    }));
    return { ...l, choose };
  });
}

/** El renglón con la variante elegida: su nombre, su id y su precio (o el del producto). */
export function pickVariant<L extends LineWithChoice>(line: L, opt: VariantOption): L {
  const { choose: _drop, ...rest } = line;
  void _drop;
  return { ...(rest as L), name: opt.name, item_id: opt.ref, unit_price: opt.price ?? line.unit_price ?? null, from_catalog: opt.price != null || line.from_catalog };
}
