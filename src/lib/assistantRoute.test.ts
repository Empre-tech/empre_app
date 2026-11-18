import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerFor, askWhichReading, destinationLabel, numberQuestions, otherJob, serverModule } from './assistantRoute.ts';

test('buscar otros negocios es de otro trabajo; lo del negocio no', () => {
  assert.deepEqual(otherJob('¿Dónde venden pollo más barato cerca?'), { job: 'search', query: 'pollo mas barato cerca' });
  assert.equal(otherJob('quién vende cilindros de gas')?.job, 'search');
  assert.equal(otherJob('búscame una barbería abierta ahora')?.job, 'search');
  assert.equal(otherJob('vendí 3 almuerzos, cerca de 20 mil'), null);
  assert.equal(otherJob('¿Hay harina?'), null);
  assert.equal(otherJob('se acabó el café'), null);
  assert.equal(otherJob('Vendí 2 por 12 mil en Nequi'), null);
});

test('escribir textos va a Redactar', () => {
  assert.deepEqual(otherJob('Escríbeme la descripción de la oferta'), { job: 'draft' });
  assert.deepEqual(otherJob('hazme un título para la promo'), { job: 'draft' });
  assert.equal(otherJob('pagué el gas'), null);
});

test('preguntas sobre tus números, en el orden dicho y con su periodo', () => {
  assert.deepEqual(numberQuestions('¿Cuánto vendí hoy y quién me debe?'), [
    { topic: 'sales', period: 'day' },
    { topic: 'owed_to_me', period: 'day' },
  ]);
  assert.deepEqual(numberQuestions('cuánto he gastado este mes'), [{ topic: 'expenses', period: 'month' }]);
  assert.deepEqual(numberQuestions('¿cómo voy esta semana?'), [{ topic: 'sales', period: 'week' }]);
  assert.deepEqual(numberQuestions('a quién le debo'), [{ topic: 'i_owe', period: 'day' }]);
  assert.deepEqual(numberQuestions('vendí 3 almuerzos'), []);
  assert.deepEqual(numberQuestions('¿hay harina?'), []);
});

test('la respuesta sale de tus datos; sin datos lo dice, sin inventar un cero', () => {
  const sales = answerFor({ topic: 'sales', period: 'day' }, { sales_total: 280000, sales_count: 14 });
  assert.equal(sales.title, 'Hoy vendiste');
  assert.equal(sales.big, '$280.000');
  assert.equal(sales.sub, '14 ventas');
  const none = answerFor({ topic: 'sales', period: 'week' }, { sales_total: 0, sales_count: 0 });
  assert.equal(none.big, null);
  assert.equal(none.sub, 'Esta semana no has anotado ventas.');
  const owed = answerFor({ topic: 'owed_to_me', period: 'day' }, { owing: [{ name: 'Don Jorge', balance: 60000 }, { name: 'Ana', balance: 40000 }, { name: 'Luis', balance: 20000 }] });
  assert.equal(owed.big, '$120.000');
  assert.equal(owed.sub, '3 personas · Don Jorge, $60.000, el que más');
  assert.equal(answerFor({ topic: 'i_owe', period: 'day' }, { owed: [] }).sub, 'No le debes a nadie ahora.');
});

test('lo dudoso se pregunta solo fuera de Inventario, Finance y las cuentas', () => {
  assert.equal(askWhichReading('none', 'count', false), true);
  assert.equal(askWhichReading('debts', 'count', false), true);
  assert.equal(askWhichReading('inventory', 'count', false), false);
  assert.equal(askWhichReading('finance', 'count', false), false);
  assert.equal(askWhichReading('none', 'count', true), false);
  assert.equal(askWhichReading('none', 'add', false), false);
});

test('el destino de cada línea y el módulo que entiende el servidor', () => {
  assert.equal(destinationLabel('sale'), 'Va a Finance');
  assert.equal(destinationLabel('stock'), 'Va a Inventario');
  assert.equal(destinationLabel('tab_add', 'Mesa 3'), 'Va a Mesa 3');
  assert.equal(destinationLabel('payment'), 'Va a Cuentas');
  assert.equal(serverModule('inventory'), 'inventory');
  assert.equal(serverModule('tab'), undefined);
  assert.equal(serverModule('none'), undefined);
});
