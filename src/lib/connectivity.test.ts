import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  INTERNET_PROBE_URL,
  getConnectivity,
  offlineCopy,
  probeConnectivity,
  reportNetworkFailure,
  reportReachable,
  setConnectivity,
  subscribeConnectivity,
  worksOffline,
} from './connectivity.ts';

const API = 'https://api.empre.com.co/health';

function fakeFetch(up: Record<string, boolean>) {
  return async (url: string) => {
    if (up[url]) return { ok: true, status: url === INTERNET_PROBE_URL ? 204 : 200 };
    throw new TypeError('Network request failed');
  };
}

test('un fallo de red pasa a sin conexión y una respuesta lo devuelve a en línea', () => {
  setConnectivity('online');
  const seen: string[] = [];
  const off = subscribeConnectivity((c) => seen.push(c));
  reportNetworkFailure();
  assert.equal(getConnectivity(), 'offline');
  reportNetworkFailure(); // no repite el aviso
  reportReachable();
  assert.equal(getConnectivity(), 'online');
  assert.deepEqual(seen, ['offline', 'online']);
  off();
});

test('la prueba distingue el internet del celular de Empre caído', async () => {
  setConnectivity('offline');
  assert.equal(await probeConnectivity(API, fakeFetch({ [API]: true })), 'online');
  assert.equal(await probeConnectivity(API, fakeFetch({ [INTERNET_PROBE_URL]: true })), 'server');
  assert.equal(await probeConnectivity(API, fakeFetch({})), 'offline');
  assert.equal(getConnectivity(), 'offline');
});

test('un error HTTP del servidor cuenta como conexión', async () => {
  const fetcher = async () => ({ ok: false, status: 503 });
  assert.equal(await probeConnectivity(API, fetcher), 'online');
});

test('las pantallas que sirven sin conexión no se tapan', () => {
  assert.equal(worksOffline('/business/ledger/sale/123'), true);
  assert.equal(worksOffline('/claims'), true);
  assert.equal(worksOffline('/offer/claim'), true);
  assert.equal(worksOffline('/map'), false);
  assert.equal(worksOffline('/business/123'), false);
  assert.equal(worksOffline('/'), false);
});

test('textos', () => {
  assert.equal(offlineCopy('online'), null);
  assert.match(offlineCopy('offline')!.title, /Sin conexión a internet/);
  assert.match(offlineCopy('server')!.title, /Empre/);
});
