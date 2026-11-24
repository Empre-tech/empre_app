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

test('phoneProblem: dice qué le falta al número', async () => {
  const { phoneProblem } = await import('./customerMessages.ts');
  assert.equal(phoneProblem(''), null);
  assert.equal(phoneProblem('300 123 4567'), null);
  assert.match(phoneProblem('300310472') ?? '', /escribiste 9/);
});

test('partyLabel: los últimos dígitos solo cuando hay otro con el mismo nombre', async () => {
  const { partyLabel, phoneTail } = await import('./customerMessages.ts');
  const all = [{ name: 'David Montes' }, { name: 'david montes' }, { name: 'Ana' }];
  assert.equal(phoneTail('300 111 4472'), '4472');
  assert.equal(partyLabel({ name: 'David Montes', phone: '300 111 4472' }, all), 'David Montes · …4472');
  assert.equal(partyLabel({ name: 'Ana', phone: '300 111 9999' }, all), 'Ana');
});

test('partyMatches: por nombre o por los dígitos del celular', async () => {
  const { partyMatches } = await import('./customerMessages.ts');
  const p = { name: 'David Montes', phone: '300 111 4472' };
  assert.equal(partyMatches(p, 'davi'), true);
  assert.equal(partyMatches(p, '4472'), true);
  assert.equal(partyMatches(p, '44'), false, 'con menos de 3 dígitos no busca por celular');
  assert.equal(partyMatches(p, '9999'), false);
});
