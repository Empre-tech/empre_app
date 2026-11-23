import assert from 'node:assert/strict';
import { test } from 'node:test';
import { debtMessage, offerMessage, ticketMessage, ticketUrl, waLink, waPhone } from './customerMessages.ts';

test('waPhone: celulares colombianos con 57 y lo que no sirve, null', () => {
  assert.equal(waPhone('300 123 4567'), '573001234567');
  assert.equal(waPhone('+57 300-123-4567'), '573001234567');
  assert.equal(waPhone('6051234'), null);
  assert.equal(waPhone(''), null);
  assert.equal(waPhone('+1 415 555 0100'), '14155550100');
});

test('waLink y ticket', () => {
  assert.equal(waLink('573001234567', 'Hola Ana'), 'https://wa.me/573001234567?text=Hola%20Ana');
  assert.equal(waLink(null, 'Hola'), 'https://wa.me/?text=Hola');
  const url = ticketUrl('https://api.empre.com.co/', 'abc');
  assert.equal(url, 'https://api.empre.com.co/t/abc');
  assert.equal(ticketMessage({ customer: 'Ana María', business: 'Moda Barrio', total: 24000, url }), 'Hola Ana, gracias por tu compra en Moda Barrio ($24.000). Aquí está tu ticket: https://api.empre.com.co/t/abc');
  assert.match(ticketMessage({ business: 'Moda Barrio', total: 1000, url }), /^Hola, gracias/);
});

test('fiado y oferta', () => {
  assert.match(debtMessage({ customer: 'Luis', business: 'Tienda', balance: 15000 }), /saldo pendiente de \$15\.000/);
  assert.equal(offerMessage({ customer: 'Ana', business: 'Moda Barrio', title: 'Camiseta', price: 84000, endsText: 'Termina hoy' }), 'Hola Ana, en Moda Barrio tenemos «Camiseta» a $84.000. Termina hoy. Si te interesa, respóndenos por aquí.');
});
