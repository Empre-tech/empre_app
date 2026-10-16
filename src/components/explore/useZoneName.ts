import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';

import { zonesApi } from '@/api/offers';
import { distanceKm, type Coords } from '@/lib/geo';
import { NEAR_ME_M, pickCityZones, resolveZoneName, type GeoName, type ZoneName } from '@/lib/zoneName';

const NO_ZONES: never[] = [];
const keyOf = (p: Coords) => `${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`;

/**
 * Nombre de la zona que muestra el panel: «Centro Histórico · Santa Marta», «Cerca de ti».
 * Las zonas se descargan una vez (son pocas); el geocodificador del teléfono solo se consulta
 * cuando el punto no cae en ninguna zona (otro barrio u otra ciudad) y el resultado se recuerda.
 * Devuelve null mientras no se sepa nada, para que el panel use su texto de siempre.
 */
export function useZoneName({ user, view }: { user: Coords | null; view: Coords }): ZoneName | null {
  const zonesQuery = useQuery({ queryKey: ['zones'], queryFn: () => zonesApi.list(), staleTime: 6 * 60 * 60_000 });
  const all = zonesQuery.data ?? NO_ZONES;

  // El nombre es el del lugar de la persona si el mapa está sobre ella; si no, el del mapa.
  const onUser = user !== null && distanceKm(user, view) * 1000 < NEAR_ME_M;
  const here = onUser && user ? user : view;
  const hereKey = keyOf(here);

  const { latitude: hereLat, longitude: hereLng } = here;
  const { zones, city: zoneCity } = useMemo(() => pickCityZones(all, { latitude: hereLat, longitude: hereLng }), [all, hereLat, hereLng]);

  const [geo, setGeo] = useState<GeoName>({});
  const [prevZoneId, setPrevZoneId] = useState<string | null>(null);

  const name = useMemo(
    () => resolveZoneName({ zones, zoneCity, user, view, geo, prevZoneId }),
    [zones, zoneCity, user, view, geo, prevZoneId],
  );

  // «Anterior» para no parpadear en el límite entre dos zonas.
  const zoneId = name.zone?.id ?? null;
  if (zoneId !== prevZoneId) setPrevZoneId(zoneId);

  // Sin zona para este punto: se le pregunta el barrio y la ciudad al teléfono (una vez por punto).
  const cache = useRef(new Map<string, GeoName>());
  const needGeo = name.zone === null;
  useEffect(() => {
    if (!needGeo) return;
    const hit = cache.current.get(hereKey);
    if (hit) {
      setGeo(hit);
      return;
    }
    let cancelled = false;
    const [latitude, longitude] = hereKey.split(',').map(Number);
    Location.reverseGeocodeAsync({ latitude, longitude })
      .then((results) => {
        const r = results[0];
        const found: GeoName = { district: r?.district ?? r?.subregion ?? null, city: r?.city ?? null };
        cache.current.set(hereKey, found);
        if (!cancelled) setGeo(found);
      })
      .catch(() => {
        // Sin conexión o sin servicio: el panel se queda con la ciudad de las zonas o «Cerca de ti».
      });
    return () => {
      cancelled = true;
    };
  }, [needGeo, hereKey]);

  // Nada que decir todavía: ni zonas, ni barrio, ni ciudad.
  if (name.reason === 'other-city' && !geo.city && !geo.district) return null;
  return name;
}
