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
  return `${hello(i.customer)}, en ${i.business} tenemos «${i.title}»${price}.${ends} Si te interesa, respóndenos por aquí.`;
}

export function freeMessage(i: { customer: string; business: string }): string {
  return `${hello(i.customer)}, te escribimos de ${i.business}. `;
}
