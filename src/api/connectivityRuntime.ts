import { API_URL } from '@/config';
import { probeConnectivity, type Connectivity } from '@/lib/connectivity';

let inflight: Promise<Connectivity> | null = null;

/** Comprueba la conexión ya (una sola prueba a la vez): la llama el cliente de la API cuando un fetch no sale. */
export function checkConnectivityNow(): Promise<Connectivity> {
  if (!inflight) {
    inflight = probeConnectivity(`${API_URL}/health`).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}
