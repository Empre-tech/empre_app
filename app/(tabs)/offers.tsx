import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { categoriesApi } from '@/api/endpoints';
import { offersApi } from '@/api/offers';
import { Button } from '@/components/Button';
import { UpdatingBar } from '@/components/explore/LoadingMotion';
import { Reveal } from '@/components/offers/MarketMotion';
import { OfferRow, OfferTile, TILE_GAP, TILE_W } from '@/components/offers/OfferTiles';
import { SkeletonBlock } from '@/components/Skeleton';
import { buildGroups, categoryFilter, type GroupId } from '@/lib/categoryGroups';
import { effectiveSort, sortOptions, visibleSections, type MarketItem, type MarketSort } from '@/lib/offerMarket';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';

type Coords = { latitude: number; longitude: number };

/**
 * Pestaña Ofertas como vitrina (3.38, mockup ofertas_marketplace.html): cerca de ti, lo más buscado, tendencia y
 * recomendado, y debajo todas las de la zona. Las secciones las arma el servidor sin repetir ofertas; aquí se dibujan
 * con movimiento que explica (entrar una vez, cascada corta, presión) y nada patrocinado ni contadores de ofertas.
 * El reclamo no cambia: la tarjeta abre el perfil en la ficha de esa oferta.
 */
export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow(60_000);

  const [coords, setCoords] = useState<Coords | null>(null);
  const [locAsked, setLocAsked] = useState(false);
  const [group, setGroup] = useState<GroupId | undefined>();
  const [term, setTerm] = useState<string | undefined>();
  const [sort, setSort] = useState<MarketSort>('near');
  const [text, setText] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getLastKnownPositionAsync();
        if (pos) setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch {
        // Sin ubicación: la vitrina no muestra «cerca» ni distancias.
      }
    })();
  }, []);
  const askLocation = useCallback(async () => {
    setLocAsked(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (pos) setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      // Se queda sin ubicación.
    }
  }, []);

  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: 5 * 60_000 });
  const groups = useMemo(() => buildGroups(categories.data ?? []), [categories.data]);
  const category = categoryFilter(group, undefined, groups);
  const hasLoc = coords !== null;
  const sortNow = effectiveSort(sort, hasLoc);
  const key = [coords ? `${coords.latitude.toFixed(3)},${coords.longitude.toFixed(3)}` : 'no-ref', category ?? 'all', term ?? '', sortNow].join('|');
  const market = useQuery({
    queryKey: ['offers-market', key],
    queryFn: () => offersApi.market({ lat: coords?.latitude, long: coords?.longitude, category, term, sort: sortNow }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const data = market.data;
  const open = useCallback((o: MarketItem) => router.push({ pathname: '/business/[id]', params: { id: o.entity_id, offer: o.id, src: 'offers' } }), [router]);

  // Buscar dentro de la vitrina: filtra la lista de todas por oferta o negocio (sin tildes); las secciones se ocultan.
  const q = text.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const filtered = useMemo(
    () => (q ? (data?.all ?? []).filter((o) => `${o.title} ${o.entity_name} ${o.category_name}`.toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)) : []),
    [data?.all, q],
  );
  const sections = q ? [] : visibleSections(data);

  const rail = (items: MarketItem[]) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} snapToInterval={TILE_W + TILE_GAP} decelerationRate="fast" snapToAlignment="start">
      {items.map((o, i) => (
        <Reveal key={o.id} delay={80 + Math.min(i, 5) * 50} distance={6} duration={280}>
          <OfferTile item={o} now={now} onPress={() => open(o)} />
        </Reveal>
      ))}
    </ScrollView>
  );
  const header = (title: string, why: string) => (
    <View style={styles.sh}>
      <Text style={styles.shTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.shWhy}>{why}</Text>
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {market.isFetching && data ? <UpdatingBar /> : null}
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
        <View style={styles.top}>
          <Text style={styles.title} accessibilityRole="header">
            Ofertas
          </Text>
          <Pressable accessibilityRole="button" onPress={hasLoc ? undefined : () => void askLocation()} disabled={hasLoc} style={styles.where} hitSlop={6}>
            <Ionicons name={hasLoc ? 'location' : 'location-outline'} size={16} color={colors.primaryDark} />
            <Text style={styles.whereText}>{hasLoc ? 'Cerca de ti · 3 km' : 'Activa tu ubicación para ver lo cercano'}</Text>
          </Pressable>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput value={text} onChangeText={setText} placeholder="Busca una oferta o un negocio" placeholderTextColor={colors.muted} style={styles.searchInput} accessibilityLabel="Buscar en las ofertas" returnKeyType="search" />
            {text ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => setText('')} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Todas" active={!group} onPress={() => setGroup(undefined)} />
          {groups.map((g) => (
            <Chip key={g.id} label={g.name} active={group === g.id} onPress={() => setGroup(group === g.id ? undefined : g.id)} />
          ))}
        </ScrollView>

        {!hasLoc && !q ? (
          <View style={styles.loc}>
            <Text style={styles.locText}>{locAsked ? 'Sin permiso de ubicación no podemos decir qué está cerca.' : 'Con tu ubicación te mostramos lo que está cerca.'}</Text>
            <Pressable accessibilityRole="button" onPress={() => void askLocation()} style={styles.locBtn}>
              <Text style={styles.locBtnText}>Activar</Text>
            </Pressable>
          </View>
        ) : null}

        {market.isLoading ? (
          <View style={styles.sec}>
            <View style={styles.sh}>
              <SkeletonBlock width={140} height={18} />
            </View>
            <View style={styles.rail}>
              {[0, 1].map((i) => (
                <SkeletonBlock key={i} width={TILE_W} height={214} borderRadius={radius.lg} />
              ))}
            </View>
          </View>
        ) : null}

        {data
          ? sections.map((s, i) => (
              // La llave cambia con el filtro, el término o la ubicación: lo nuevo vuelve a entrar con su cascada.
              <Reveal key={`${s}|${key}`} delay={Math.min(i, 3) * 70} style={styles.sec}>
                {s === 'near' ? (
                  <>
                    {header('Cerca de ti', 'A menos de 3 km, la más cercana primero')}
                    {rail(data.near)}
                  </>
                ) : s === 'searched' ? (
                  <>
                    {header('Lo más buscado', 'Lo que la gente busca esta semana en Empre')}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.terms}>
                      {data.searched.terms.map((t) => (
                        <Chip key={t.term} label={t.label} active={data.searched.term === t.term} soft onPress={() => setTerm(t.term)} />
                      ))}
                    </ScrollView>
                    {data.searched.items.length ? rail(data.searched.items) : <Text style={styles.none}>Ahora no hay ofertas para esto. Si sigues negocios, te enteras cuando publiquen.</Text>}
                  </>
                ) : s === 'trending' ? (
                  <>
                    {header('Tendencia', hasLoc ? 'Las que más se están reclamando cerca, últimas 48 h' : 'Las que más se están reclamando, últimas 48 h')}
                    {rail(data.trending)}
                  </>
                ) : (
                  <>
                    {header(data.for_you.top_rated ? (hasLoc ? 'Mejor valoradas cerca' : 'Mejor valoradas') : 'Recomendado para ti', data.for_you.top_rated ? 'Según las reseñas de quienes fueron' : 'Según lo que sigues y reclamas')}
                    {rail(data.for_you.items)}
                  </>
                )}
              </Reveal>
            ))
          : null}

        {data ? (
          <Reveal key={`all|${key}|${q ? 'q' : ''}`} delay={Math.min(sections.length, 3) * 70} style={styles.sec}>
            {header(q ? 'Resultados' : 'Todas las ofertas', q ? `Con «${text.trim()}»` : hasLoc ? 'En tu zona' : 'Las vigentes ahora')}
            {!q ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.terms}>
                {sortOptions(hasLoc).map((o) => (
                  <Chip key={o.key} label={o.label} active={sortNow === o.key} onPress={() => setSort(o.key)} />
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.list}>
              {(q ? filtered : data.all).map((o, i) => (
                <Reveal key={o.id} delay={60 + Math.min(i, 6) * 40} distance={6} duration={260}>
                  <OfferRow item={o} now={now} onPress={() => open(o)} />
                </Reveal>
              ))}
              {(q ? filtered : data.all).length === 0 ? <EmptyOffers searching={Boolean(q)} /> : null}
            </View>
          </Reveal>
        ) : null}
        {market.isError && !data ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No pudimos cargar las ofertas</Text>
            <Button title="Reintentar" variant="secondary" onPress={() => void market.refetch()} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Chip({ label, active, onPress, soft }: { label: string; active: boolean; onPress: () => void; soft?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && (soft ? styles.chipSoftOn : styles.chipOn), pressed && styles.chipPressed]}
    >
      <Text style={[styles.chipText, active && (soft ? styles.chipSoftText : styles.chipOnText)]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyOffers({ searching }: { searching: boolean }) {
  const router = useRouter();
  return (
    <View style={styles.empty}>
      <Ionicons name="pricetag-outline" size={36} color={colors.muted} />
      <Text style={styles.emptyTitle}>{searching ? 'Nada con esa búsqueda' : 'Aún no hay ofertas aquí'}</Text>
      <Text style={styles.emptyText}>{searching ? 'Prueba con otra palabra o quita el filtro.' : 'Explora el mapa para ver negocios cerca.'}</Text>
      {searching ? null : <Button title="Ver en el mapa" variant="secondary" onPress={() => router.replace('/')} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 26, fontFamily: fonts.display.bold, color: colors.ink },
  where: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, alignSelf: 'flex-start' },
  whereText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 44, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, marginTop: spacing.xs },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink, paddingVertical: 0 },
  chips: { gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 4 },
  terms: { gap: 6, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipSoftOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipPressed: { transform: [{ scale: 0.97 }] },
  chipText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink },
  chipOnText: { color: '#fff' },
  chipSoftText: { color: colors.primaryDark },
  loc: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  locText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.primaryDark },
  locBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center' },
  locBtnText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: '#fff' },
  sec: { paddingTop: spacing.md },
  sh: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  shTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  shWhy: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  rail: { flexDirection: 'row', gap: TILE_GAP, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  none: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, paddingHorizontal: spacing.lg },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 13.5, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
});
