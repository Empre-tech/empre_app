/**
 * Base y Empre Pro (tablero «Base y Empre Pro», 2026-11-17). Empre Pro va por negocio y se paga con Wompi en Mi negocio >
 * Suscripción. Lo de Pro no desaparece en Base: queda en gris con la corona, y al tocarlo sale «Pásate a Empre Pro».
 * El servidor cierra lo mismo (responde 402 «pro_required»), así que esto solo decide cómo se ve.
 */

export const PRO_PRICE_AMOUNT = '$39.900';
export const PRO_PRICE_UNIT = 'COP / mes';

/**
 * El precio de Pro para un negocio (2026-11-22): $39.900; si el dueño ya tiene Pro en otro de sus negocios, la mitad.
 * Lo dice el servidor (price_cop); mientras no llega, el precio completo.
 */
export function proPriceFor(s?: { price_cop?: number; extra_business?: boolean } | null): { amount: string; extra: boolean } {
  if (!s?.price_cop) return { amount: PRO_PRICE_AMOUNT, extra: false };
  return { amount: `$${s.price_cop.toLocaleString('es-CO').replace(/,/g, '.')}`, extra: Boolean(s.extra_business) };
}

export interface ProSubscription {
  status: string;
  current_period_end?: string;
}

/** Igual que el servidor: activa y sin vencer. Sin suscripción, el negocio está en Base. */
export function isProSubscription(sub: ProSubscription | null | undefined, now: number = Date.now()): boolean {
  if (!sub || sub.status !== 'active') return false;
  if (!sub.current_period_end) return false;
  const end = Date.parse(sub.current_period_end);
  return Number.isFinite(end) && end > now;
}

/**
 * Lo que suma Empre Pro, por área (tablero «Base y Empre Pro»; el usuario pidió el 2026-11-17 ordenarlo por categorías,
 * con Empre Finance y su análisis con Empre AI primero, y decir qué tiene Base en cada una). Cada línea describe algo
 * que ya existe en la app. Ojo: Finance solo Hoy y el inventario en semáforo todavía no están cerrados en Base.
 */
export interface ProGroup {
  key: 'finance' | 'ai' | 'inventory' | 'agenda';
  title: string;
  /** En una línea, para la hoja «Pásate a Empre Pro». */
  short: string;
  /** Lo que tiene Base en esta área; null si nada. */
  base: string | null;
  /** Lo que suma Pro, con su detalle (pantalla Tu plan). */
  items: { title: string; sub: string }[];
}

export function proGroups({ agenda }: { agenda: boolean }): ProGroup[] {
  return [
    {
      key: 'finance',
      title: 'Empre Finance',
      short: 'Plata, Cuentas, Rentabilidad y el análisis con Empre AI',
      base: 'En Base: Hoy, con lo que vendiste, gastaste y lo que te deben.',
      items: [
        { title: 'Plata', sub: 'Lo que entra y sale: de dónde entró, en qué salió, cuándo vendes más y quién te trajo las ventas.' },
        { title: 'Cuentas', sub: 'Quién te debe y a quién le debes, cuánto llevan y un mensaje listo para cobrar por WhatsApp.' },
        { title: 'Rentabilidad', sub: 'Qué te deja plata de verdad: lo que cobras contra lo que te cuesta, y lo que tienes en mercancía.' },
        { title: 'Análisis con Empre AI', sub: 'Lo que dice tu plata, tu semana día por día, qué cobrar primero, qué precios revisar, qué comprar pronto, lo que perdiste y la plata quieta.' },
      ],
    },
    {
      key: 'ai',
      title: 'Empre AI',
      short: 'Habla con Empre AI y Redactar con Empre AI',
      base: null,
      items: [
        { title: 'Habla con Empre AI', sub: 'Dices lo que pasó y entiende si es venta, gasto o inventario; te muestra todo antes de guardar. Con un tope al mes: siempre ves cuánto te queda.' },
        { title: 'Redactar con Empre AI', sub: 'Títulos de ofertas, publicaciones y la descripción de tu negocio, en 3 opciones; tú eliges. Usa el mismo tope. La descripción al crear tu negocio va gratis.' },
      ],
    },
    {
      key: 'inventory',
      title: 'Inventario',
      short: 'Cantidades exactas y conteo por sección',
      base: 'En Base: el semáforo (hay, hay más o menos, se acabó).',
      items: [
        { title: 'Cantidades exactas', sub: 'Cuántas unidades te quedan de cada producto e insumo.' },
        { title: 'Conteo por sección', sub: 'Cuentas una sección y Empre ajusta lo que no cuadra.' },
      ],
    },
    ...(agenda
      ? [
          {
            key: 'agenda' as const,
            title: 'Agenda',
            short: 'Citas que se apartan solas',
            base: 'En Base no hay agenda.',
            items: [{ title: 'Citas que se apartan solas', sub: 'Tus clientes piden hora en tus horas libres y Empre te avisa.' }],
          },
        ]
      : []),
  ];
}

/** El 402 del servidor: eso es de Empre Pro y el negocio está en Base. */
export function isProRequired(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const status = (e as { status?: unknown }).status;
  return status === 402;
}
