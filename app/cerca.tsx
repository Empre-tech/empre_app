import { useQueries, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogApi } from '@/api/catalog';
import { discoveryApi } from '@/api/offers';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { loadFacts } from '@/lib/agentPrefsStore';
import { priceText, publicCatalog } from '@/lib/catalog';
import { onFootOrDistance } from '@/lib/format';
import { mediaUrl } from '@/lib/image';
import { nearbyWall } from '@/lib/offerMarket';
import { useCoords } from '@/lib/useCoords';
import { colors, fonts, radius, spacing } from '@/theme';

type Kind = 'product' | 'service';

interface Tile {
  id: string;
  entityId: string;
  photo?: string;
  name: string;
  price: string | null;
  biz: string;
  ini: string;
  near: string | null;
  chip: string | null;
  kind: Kind;
  open: boolean;
  soldOut: boolean;
  sizes: string[];
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || n.slice(0, 2).toUpperCase();

/**
 * Lo que venden cerca (tablero «Empre Offers», teléfono 2): productos y servicios de los negocios a pie, aparte de las
 * ofertas. Un muro de fotos como el de las tiendas: cada tarjeta dice qué es, cuánto cuesta y quién lo vende. Nunca dos
 * del mismo negocio seguidos ni la misma foto dos veces; tocar abre la ficha para preguntar y apartar o reservar.
 */
export default function NearbyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const coords = useCoords();
  const [kind, setKind] = useState<Kind>('product');
  const [today, setToday] = useState(false);
  const [openNow, setOpenNow] = useState(false);
  const [mySizeOn, setMySizeOn] = useState(false);
  const mySize = useQuery({ queryKey: ['agent-facts'], queryFn: loadFacts }).data?.find((f) => f.name === 'Talla')?.value ?? null;

  const place = coords ? { lat: coords.latitude, long: coords.longitude } : {};
  const near = useQuery({ queryKey: ['cerca', coords?.latitude.toFixed(3), coords?.longitude.toFixed(3)], queryFn: () => discoveryApi.discover({ ...place, limit: 16 }), staleTime: 60_000 });
  const biz = useMemo(() => near.data?.items ?? [], [near.data]);
  const catalogs = useQueries({ queries: biz.map((b) => ({ queryKey: ['catalog', b.id], queryFn: () => catalogApi.list(b.id), staleTime: 120_000 })) });

  const all = useMemo(() => {
    return biz.map((b, i) => {
      const items = publicCatalog(catalogs[i]?.data ?? []);
      return items.map(
        (it): Tile => ({
          id: it.id,
          entityId: b.id,
          photo: it.photos?.[0] ? mediaUrl(it.photos[0]) : undefined,
          name: it.name,
          price: priceText(it),
          biz: b.name,
          ini: initials(b.name),
          near: onFootOrDistance((b.distance_meters ?? 0) / 1000),
          kind: it.kind === 'service' ? 'service' : 'product',
          chip: it.kind === 'service' ? (it.bookable ? 'Se reserva' : null) : it.sold_out ? 'Agotado' : null,
          open: b.is_open_now,
          soldOut: Boolean(it.sold_out),
          sizes: (it.attrs ?? []).filter((a) => a.name.toLowerCase() === 'talla').map((a) => a.value.toUpperCase()),
        }),
      );
    });
  }, [biz, catalogs]);

  const counts = { product: all.flat().filter((t) => t.kind === 'product' && t.photo).length, service: all.flat().filter((t) => t.kind === 'service' && t.photo).length };
  const wall = useMemo(
    () =>
      nearbyWall(
        all.map((l) =>
          l.filter((t) => t.kind === kind && (!today || !t.soldOut) && (!openNow || t.open) && (!mySizeOn || !mySize || t.sizes.includes(mySize.toUpperCase()))),
        ),
        60,
      ),
    [all, kind, today, openNow, mySizeOn, mySize],
  );
  // Dos columnas que se llenan de a una: el muro queda parejo.
  const cols: Tile[][] = [[], []];
  wall.forEach((t, i) => cols[i % 2].push(t));
  const loading = near.isLoading || catalogs.some((c) => c.isLoading);

  const chips = [
    { key: 'today', label: kind === 'product' ? 'Hay hoy' : 'Con hora', on: today, toggle: () => setToday((v) => !v) },
    { key: 'open', label: 'Abierto ahora', on: openNow, toggle: () => setOpenNow((v) => !v) },
    ...(kind === 'product' && mySize ? [{ key: 'size', label: `Tu talla ${mySize}`, on: mySizeOn, toggle: () => setMySizeOn((v) => !v) }] : []),
  ];

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Lo que venden cerca" subtitle={biz.length ? `${biz.length} negocios a pie` : undefined} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.seg}>
          {(['product', 'service'] as const).map((k) => (
            <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: kind === k }} onPress={() => setKind(k)} style={[styles.segItem, kind === k && styles.segOn]}>
              <Text style={styles.segText}>
                {k === 'product' ? 'Productos' : 'Servicios'} · {counts[k]}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.chips}>
          {chips.map((c) => (
            <Pressable key={c.key} accessibilityRole="button" accessibilityState={{ selected: c.on }} onPress={c.toggle} style={[styles.chip, c.on && styles.chipOn]}>
              <Text style={styles.chipText}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
        ) : wall.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{kind === 'product' ? 'Aún no hay productos con foto cerca' : 'Aún no hay servicios con foto cerca'}</Text>
            <Text style={styles.emptyText}>Cuando los negocios de tu barrio suban lo que venden, sale aquí. Mientras tanto, mira las ofertas.</Text>
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>Ver ofertas</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.wall}>
            {cols.map((col, ci) => (
              <View key={ci} style={styles.col}>
                {col.map((t, i) => (
                  <Pressable
                    key={t.id}
                    accessibilityRole="button"
                    accessibilityLabel={[t.name, t.price, `de ${t.biz}`, t.near].filter(Boolean).join(', ')}
                    onPress={() => router.push({ pathname: '/business/product', params: { entityId: t.entityId, itemId: t.id } })}
                    style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                  >
                    <View>
                      <Image source={{ uri: t.photo }} style={[styles.img, { aspectRatio: (i + ci) % 3 === 0 ? 3 / 4 : 1 }]} contentFit="cover" accessibilityIgnoresInvertColors />
                      {t.chip ? <Text style={styles.cardChip}>{t.chip}</Text> : null}
                    </View>
                    <View style={styles.cardBody}>
                      {t.price ? <Text style={styles.price}>{t.price}</Text> : null}
                      <Text style={styles.name} numberOfLines={2}>
                        {t.name}
                      </Text>
                      <View style={styles.bizRow}>
                        <Text style={styles.ini}>{t.ini}</Text>
                        <Text style={styles.bizText} numberOfLines={1}>
                          {[t.biz, t.near].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.md, gap: spacing.md },
  seg: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 14, backgroundColor: colors.surface },
  segItem: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.selectedSoft },
  segText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.selectedSoft, borderColor: colors.selectedSoft },
  chipText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  wall: { flexDirection: 'row', gap: 8 },
  col: { flex: 1, gap: 8 },
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  img: { width: '100%', backgroundColor: colors.bg },
  cardChip: { position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.surface, fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.primaryDark },
  cardBody: { padding: 10, gap: 3 },
  name: { fontSize: 13, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.ink },
  price: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.ink, fontVariant: ['tabular-nums'] },
  bizRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ini: { width: 22, height: 22, borderRadius: 11, overflow: 'hidden', textAlign: 'center', lineHeight: 22, backgroundColor: colors.sand, fontSize: 10, fontFamily: fonts.ui.bold, color: colors.ink },
  bizText: { flex: 1, fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  emptyTitle: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  emptyBtn: { minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: colors.primary, justifyContent: 'center' },
  emptyBtnText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.surface },
});
