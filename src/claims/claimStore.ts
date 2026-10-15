import * as FileSystem from 'expo-file-system/legacy';
import type { OfferClaim } from '@/api/types';

// Guarda los reclamos en el teléfono para poder mostrar el QR sin conexión.
// Un archivo por usuario: otra cuenta en el mismo teléfono no ve estos QR.
const MAX_SAVED = 20;

function fileFor(userId: string): string | null {
  const dir = FileSystem.documentDirectory;
  return dir ? `${dir}claims-${userId}.json` : null;
}

function isClaim(value: unknown): value is OfferClaim {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.offer_id === 'string' &&
    typeof c.status === 'string' &&
    typeof c.short_code === 'string' &&
    typeof c.claimed_at === 'string' &&
    typeof c.expires_at === 'string'
  );
}

/** Reclamos guardados de este usuario. Cualquier fallo (sin archivo, JSON dañado) da una lista vacía. */
export async function loadSavedClaims(userId: string): Promise<OfferClaim[]> {
  const path = fileFor(userId);
  if (!path) return [];
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return [];
    const parsed: unknown = JSON.parse(await FileSystem.readAsStringAsync(path));
    return Array.isArray(parsed) ? parsed.filter(isClaim) : [];
  } catch {
    return [];
  }
}

/** Devuelve si se pudo guardar; guardar es una comodidad (QR sin conexión) y nunca debe romper nada. */
async function write(userId: string, claims: OfferClaim[]): Promise<boolean> {
  const path = fileFor(userId);
  if (!path) return false;
  try {
    await FileSystem.writeAsStringAsync(path, JSON.stringify(claims.slice(0, MAX_SAVED)));
    return true;
  } catch {
    return false;
  }
}

/** Guarda o actualiza un reclamo (por id), con los más nuevos primero. Devuelve si quedó guardado. */
export async function saveClaim(userId: string, claim: OfferClaim): Promise<boolean> {
  const current = await loadSavedClaims(userId);
  const next = [claim, ...current.filter((c) => c.id !== claim.id)].sort(
    (a, b) => Date.parse(b.claimed_at) - Date.parse(a.claimed_at),
  );
  return write(userId, next);
}

export async function removeSavedClaim(userId: string, claimId: string): Promise<void> {
  const current = await loadSavedClaims(userId);
  await write(userId, current.filter((c) => c.id !== claimId));
}
