import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { claimsApi } from '@/api/offers';
import type { OfferClaim } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { getClaimPosition } from '@/claims/claimPosition';
import { saveClaim } from '@/claims/claimStore';
import { hapticError, hapticSuccess } from '@/lib/haptics';

/**
 * Reclamar una oferta: el mismo paso desde la pantalla del reclamo y desde la hoja de la oferta de la pestaña Ofertas
 * (3.48). El servidor comprueba que estés cerca del negocio (sin permiso o sin señal, reclama igual), el reclamo se
 * guarda en el teléfono para que el QR siga ahí sin conexión y se avisa con una vibración corta.
 */
export function useClaimOffer() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const claim = async (offerId: string): Promise<{ claim: OfferClaim; saved: boolean } | null> => {
    setBusy(true);
    setMessage(null);
    try {
      const where = await getClaimPosition();
      const created = await claimsApi.claim(offerId, where?.latitude, where?.longitude);
      queryClient.setQueryData(['claim', created.id], created);
      void queryClient.invalidateQueries({ queryKey: ['claims', 'mine'] });
      const saved = user?.id ? await saveClaim(user.id, created) : false;
      hapticSuccess();
      return { claim: created, saved };
    } catch (e) {
      hapticError();
      setMessage(e instanceof Error ? e.message : 'No pudimos reclamar la oferta');
      return null;
    } finally {
      setBusy(false);
    }
  };

  return { claim, busy, message, setMessage };
}
