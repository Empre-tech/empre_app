import { contactProblem, dayCO } from '@/lib/contactRules';
import { getPhoneFlag, setPhoneFlag } from '@/lib/phoneFlags';

// Lleva en el teléfono el día del último cobro u oferta a cada cliente (Ley 2300: máximo una vez al día por persona).
const keyOf = (entityId: string, partyId: string) => `contact:${entityId}:${partyId}`;

/** Por qué no se puede mandar ahora un cobro o una oferta a ese cliente, o null si se puede. */
export async function contactBlock(entityId: string, partyId: string): Promise<string | null> {
  const last = await getPhoneFlag(keyOf(entityId, partyId)).catch(() => null);
  return contactProblem(new Date(), last);
}

/** Anota que hoy se le mandó un cobro o una oferta. */
export async function noteContact(entityId: string, partyId: string): Promise<void> {
  await setPhoneFlag(keyOf(entityId, partyId), dayCO(new Date())).catch(() => undefined);
}
