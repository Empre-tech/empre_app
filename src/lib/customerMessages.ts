// Mensajes uno a uno a los clientes (2026-11-22): se abren en el WhatsApp del dueño con el texto ya escrito; Empre no
// envía nada por su cuenta. Las ofertas solo a quien autorizó recibir mensajes (Ley 1581 de 2012). Sin imports de la
// app: corre con `node --test`.

/** El celular en formato internacional para WhatsApp (solo dígitos). Uno colombiano de 10 dígitos lleva el 57. */
export function waPhone(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10 && d.startsWith('3')) return `57${d}`;
  if (d.length === 12 && d.startsWith('573')) return d;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

/** Qué decir de un celular escrito: vacío, incompleto o que sirve para WhatsApp. */
export function phoneProblem(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (waPhone(raw)) return null;
  return d.length < 10 ? `Le faltan números: un celular tiene 10 (escribiste ${d.length}).` : 'Revisa el número: no parece un celular.';
}

/** Los últimos 4 dígitos de un celular («…4472»), para distinguir a dos clientes con el mismo nombre. */
export function phoneTail(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  return d.length >= 4 ? d.slice(-4) : null;
}

/** Encaja con lo buscado: por nombre o, con 3 dígitos o más, por su celular («4472»). */
export function partyMatches(p: { name: string; phone?: string | null }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (p.name.toLowerCase().includes(q)) return true;
  const digits = q.replace(/\D/g, '');
  return digits.length >= 3 && digits.length === q.replace(/\s/g, '').length && (p.phone ?? '').replace(/\D/g, '').includes(digits);
}

/** Cómo se muestra un cliente en una lista: con «· …4472» solo si hay otro con su mismo nombre. */
export function partyLabel(p: { name: string; phone?: string | null }, all: { name: string }[]): string {
  const key = p.name.trim().toLowerCase();
  const twins = all.filter((x) => x.name.trim().toLowerCase() === key).length > 1;
  const tail = phoneTail(p.phone);
  return twins && tail ? `${p.name} · …${tail}` : p.name;
}

/** El enlace que abre WhatsApp con el mensaje escrito (al número, o para elegir el chat si no hay número). */
export function waLink(phone: string | null, text: string): string {
  const t = encodeURIComponent(text);
  return phone ? `https://wa.me/${phone}?text=${t}` : `https://wa.me/?text=${t}`;
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CO').replace(/,/g, '.')}`;
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';
const hello = (name?: string | null) => (name && firstName(name) ? `Hola ${firstName(name)}` : 'Hola');

/** La dirección pública del ticket de una venta. */
export function ticketUrl(apiUrl: string, saleId: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/t/${saleId}`;
}

export function ticketMessage(i: { customer?: string | null; business: string; total: number; url: string }): string {
  return `${hello(i.customer)}, gracias por tu compra en ${i.business} (${pesos(i.total)}). Aquí está tu ticket: ${i.url}`;
}

export function debtMessage(i: { customer: string; business: string; balance: number }): string {
  return `${hello(i.customer)}, te escribimos de ${i.business}. Te recordamos que tienes un saldo pendiente de ${pesos(i.balance)}. Cuando puedas, nos avisas. ¡Gracias!`;
}

export function offerMessage(i: { customer: string; business: string; title: string; price?: number | null; endsText?: string | null }): string {
  const price = i.price ? ` a ${pesos(i.price)}` : '';
  const ends = i.endsText ? ` ${i.endsText}.` : '';
  return `${hello(i.customer)}, en ${i.business} tenemos «${i.title}»${price}.${ends} Si te interesa, respóndenos por aquí. Si no quieres recibir más ofertas, respóndenos «no más».`;
}

export function freeMessage(i: { customer: string; business: string }): string {
  return `${hello(i.customer)}, te escribimos de ${i.business}. `;
}
