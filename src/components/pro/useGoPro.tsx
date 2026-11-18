import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { entitiesApi } from '@/api/endpoints';
import { GoProSheet } from '@/components/pro/GoProSheet';

/** «Pásate a Empre Pro» para este negocio, listo para abrir desde lo que esté en gris con la corona. */
export function useGoPro(entityId: string) {
  const [open, setOpen] = useState(false);
  const entity = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const sheet = <GoProSheet visible={open} onClose={() => setOpen(false)} businesses={[{ id: entityId, name: entity.data?.name ?? '' }]} />;
  return { open: () => setOpen(true), sheet };
}
