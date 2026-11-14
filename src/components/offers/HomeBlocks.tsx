import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { DiscoveryItem } from '@/api/types';
import { artKeyFor, type ArtKey } from '@/components/CategoryArt';
import { ART_TINT, BusinessArt, CategoryIllustration } from '@/components/CategoryIllustration';
import { Ionicons } from '@/components/Icon';
import type { ServiceItem } from '@/lib/catalog';
import { priceText } from '@/lib/catalog';
import { onFootOrDistance } from '@/lib/format';
import { mediaUrl, resolveImageUrl } from '@/lib/image';
import type { IconGroup, PopularPick, ResultGroup } from '@/lib/offerHome';
import { untilLabel } from '@/lib/offerHome';
import { priceView, type MarketItem } from '@/lib/offerMarket';
import { colors, fonts } from '@/theme';

const km = (m?: number | null) => onFootOrDistance((m ?? 0) / 1000);
const kmShort = (m?: number | null) => km(m)?.replace(' a pie', '') ?? null;
const bizPhoto = (b?: DiscoveryItem) => (b ? (resolveImageUrl(b.profile_url) ?? resolveImageUrl(b.photos?.[0]) ?? undefined) : undefined);

/** Entre secciones: una línea que se desvanece a los lados, con aire arriba y abajo. Así cada sección se lee aparte. */
export function SectionDivider() {
  return (
    <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={1}>
        <Defs>
          <LinearGradient id="sdiv" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#D9C49A" stopOpacity={0} />
            <Stop offset="0.5" stopColor="#D9C49A" stopOpacity={1} />
            <Stop offset="1" stopColor="#D9C49A" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height={1} fill="url(#sdiv)" />
      </Svg>
    </View>
  );
}

/**
 * El título de una sección es lo que se toca (tablero «Empre Offers»): sin «Ver todos», solo un chevrón cuando lleva
 * a algo. Así cada sección tiene a lo sumo un botón.
 */
export function SectionHead({ title, sub, onPress, divider = true }: { title: string; sub?: string | null; onPress?: () => void; divider?: boolean }) {
  const body = (
    <>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {sub ? <Text style={styles.why}>{sub}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={20} color={colors.muted} /> : null}
    </>
  );
  const head = onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.head, pressed && styles.pressed]}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.head}>{body}</View>
  );
  return divider ? (
    <View>
      <SectionDivider />
      {head}
    </View>
  ) : (
    head
  );
}

/**
 * La zona elegida (tablero «Empre Offers», teléfono 1c): su nombre, cuántos negocios y cuántos abiertos, y las caras de
 * todos sus negocios de una vez, en dos filas que se deslizan. Tocar una cara abre el negocio.
 */
export function ZoneHeader({ name, businesses, offers, onOpen }: { name: string; businesses: DiscoveryItem[]; offers: number; onOpen: (id: string) => void }) {
  const open = businesses.filter((b) => b.is_open_now).length;
  const cols: DiscoveryItem[][] = [];
  businesses.forEach((b, i) => {
    if (i % 2 === 0) cols.push([b]);
    else cols[cols.length - 1].push(b);
  });
  return (
    <View style={styles.sec}>
      <View style={styles.zoneHead}>
        <Text style={styles.zoneName} accessibilityRole="header">
          {name}
        </Text>
        <Text style={styles.zoneSub}>
          {businesses.length === 1 ? '1 negocio' : `${businesses.length} negocios`}
          {open ? <Text style={styles.zoneOpen}>{` · ${open === 1 ? '1 abierto' : `${open} abiertos`} ahora`}</Text> : null}
          {offers ? ` · ${offers === 1 ? '1 oferta' : `${offers} ofertas`}` : ''}
        </Text>
      </View>
      {businesses.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.zoneGrid}>
          {cols.map((col, ci) => (
            <View key={ci} style={styles.zoneCol}>
              {col.map((b) => {
                const photo = bizPhoto(b);
                return (
                  <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`${b.name}, ${b.category_name}${b.is_open_now ? ', abierto' : ''}`} onPress={() => onOpen(b.id)} style={({ pressed }) => [styles.zoneFace, pressed && styles.pressed]}>
                    <View style={[styles.zoneRing, b.is_open_now && styles.zoneRingOpen]}>
                      {photo ? <Image source={{ uri: photo }} style={styles.zoneImg} contentFit="cover" accessibilityIgnoresInvertColors /> : <BusinessArt k={artKeyFor(b.category_name, b.category_icon)} size={52} />}
                    </View>
                    <Text style={styles.faceName} numberOfLines={1}>
                      {b.name}
                    </Text>
                    <Text style={styles.faceMeta} numberOfLines={1}>
                      {b.category_name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text style={[styles.why, { paddingHorizontal: 20 }]}>Todavía no hay negocios con ubicación en esta zona.</Text>
      )}
    </View>
  );
}

/** Los íconos por tipo, en una fila que se desliza: un toque y filtra. */
export const CategoryIcons = memo(function CategoryIcons({ groups, active, onPick }: { groups: IconGroup[]; active?: string; onPick: (key: string | undefined) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.icons} accessibilityLabel="Categorías">
      {groups.map((g) => {
        const on = active === g.key;
        return (
          <Pressable key={g.key} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={g.label} onPress={() => onPick(on ? undefined : g.key)} style={({ pressed }) => [styles.icon, pressed && styles.pressed]}>
            <View style={[styles.iconArt, on && styles.iconArtOn]}>
              <CategoryIllustration k={g.key} size={58} />
            </View>
            <Text style={[styles.iconText, on && styles.iconTextOn]} numberOfLines={1}>
              {g.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
});

/** Lo más buscado de la semana (palabras reales): un toque y estás en los resultados. */
export function SearchedChips({ title, terms, onPick }: { title: string; terms: { term: string; label: string }[]; onPick: (label: string) => void }) {
  return (
    <View style={styles.sec}>
      <SectionHead title={title} sub="Esta semana · toca y ves quién lo tiene" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {terms.map((t) => (
          <Pressable key={t.term} accessibilityRole="button" accessibilityLabel={`Buscar ${t.label}`} onPress={() => onPick(t.label)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
            <Text style={styles.chipText}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Los más elegidos: caras compactas por reseñas reales, con su puesto, ★ y minutos a pie. */
export function ChosenFaces({ picks, onOpen }: { picks: PopularPick<DiscoveryItem>[]; onOpen: (id: string) => void }) {
  return (
    <View style={styles.sec}>
      <SectionHead title="Los más elegidos cerca" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.faces}>
        {picks.map(({ item: b, rank }) => (
          <Pressable
            key={b.id}
            accessibilityRole="button"
            accessibilityLabel={`Puesto ${rank}: ${b.name}, ${b.avg_rating.toFixed(1)} estrellas`}
            onPress={() => onOpen(b.id)}
            style={({ pressed }) => [styles.face, pressed && styles.pressed]}
          >
            <View>
              {bizPhoto(b) ? (
                <Image source={{ uri: bizPhoto(b) }} style={styles.faceImg} contentFit="cover" accessibilityIgnoresInvertColors />
              ) : (
                <BusinessArt k={artKeyFor(b.category_name, b.category_icon)} size={62} />
              )}
              <Text style={styles.rank}>{rank}</Text>
            </View>
            <Text style={styles.faceName} numberOfLines={2}>
              {b.name}
            </Text>
            <Text style={styles.faceMeta} numberOfLines={1}>
              ★ {b.avg_rating.toFixed(1).replace('.', ',')}
              {kmShort(b.distance_meters) ? ` · ${kmShort(b.distance_meters)}` : ''}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Cabecera de un negocio: su cara, minutos y hasta qué hora; tocar lleva al negocio. Nada repetido. */
function BizHead({ name, photo, art, distance, closes, closed, extra, onPress }: { name: string; photo?: string; art: ArtKey; distance?: number | null; closes?: string | null; closed?: boolean; extra?: string | null; onPress: () => void }) {
  const sub = [km(distance), closed ? 'cerrado' : untilLabel(closes), extra].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${name}${sub ? `, ${sub}` : ''}. Ver el negocio`} onPress={onPress} style={({ pressed }) => [styles.bizHead, pressed && styles.pressed]}>
      {photo ? <Image source={{ uri: photo }} style={styles.logo} contentFit="cover" accessibilityIgnoresInvertColors /> : <BusinessArt k={art} size={40} />}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={styles.bizName} numberOfLines={1}>
          {name}
        </Text>
        {sub ? (
          <Text style={styles.why} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

/**
 * A tu puerta como carrusel (tablero «Empre Offers»): cada negocio es un banner con todo lo suyo (foto o su
 * ilustración arriba, si está abierto, a cuánto queda y lo que vende) y se desliza desde la derecha para ver el
 * siguiente. Se asoma el borde del próximo para que se entienda que hay más. Igual con fotos o sin ellas.
 */
export function BizCarousel({
  shelves,
  onBiz,
  onItem,
}: {
  shelves: { biz: DiscoveryItem; items: ServiceItem[]; branches?: number }[];
  onBiz: (id: string) => void;
  onItem: (biz: DiscoveryItem, item: ServiceItem) => void;
}) {
  const { width } = useWindowDimensions();
  const w = Math.min(320, width - 72);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.bannerRail}
      snapToInterval={w + 12}
      decelerationRate="fast"
      snapToAlignment="start"
      accessibilityLabel="Negocios a tu puerta; desliza para ver más"
    >
      {shelves.map(({ biz, items, branches = 1 }) => {
        const art = artKeyFor(biz.category_name, biz.category_icon);
        const cover = resolveImageUrl(biz.photos?.[0]) ?? resolveImageUrl(biz.profile_url) ?? undefined;
        const logo = resolveImageUrl(biz.profile_url) ?? undefined;
        const status = biz.is_open_now ? ['Abierto', untilLabel(biz.closes_at)].filter(Boolean).join(' · ') : 'Cerrado ahora';
        const meta = [km(biz.distance_meters), biz.category_name, branches > 1 ? `${branches} sedes cerca` : null].filter(Boolean).join(' · ');
        return (
          <View key={biz.id} style={[styles.banner, { width: w }]}>
            <Pressable accessibilityRole="link" accessibilityLabel={`${biz.name}. ${status}. ${meta}. Ver el negocio`} onPress={() => onBiz(biz.id)} style={({ pressed }) => [pressed && styles.pressed]}>
              <View style={[styles.bannerTop, { backgroundColor: ART_TINT[art] }]}>
                {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors /> : <View style={styles.bannerArt}><CategoryIllustration k={art} size={92} /></View>}
                <Text style={[styles.bannerStatus, !biz.is_open_now && styles.bannerClosed]}>{status}</Text>
              </View>
              <View style={styles.bannerHead}>
                <View style={styles.bannerLogo}>{logo ? <Image source={{ uri: logo }} style={styles.bannerLogoImg} contentFit="cover" accessibilityIgnoresInvertColors /> : <BusinessArt k={art} size={44} />}</View>
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Text style={styles.bannerName} numberOfLines={1}>
                    {biz.name}
                  </Text>
                  <Text style={styles.why} numberOfLines={1}>
                    {meta}
                  </Text>
                </View>
              </View>
            </Pressable>
            <View style={styles.bannerList}>
              {items.slice(0, 3).map((it, i) => {
                const photo = it.photos?.[0] ? mediaUrl(it.photos[0]) : undefined;
                const price = priceText(it);
                const detail = it.kind === 'service' ? [it.duration_min ? `${it.duration_min} min` : null, it.bookable ? 'Se reserva' : null].filter(Boolean).join(' · ') : it.sold_out ? 'Agotado' : it.section || '';
                return (
                  <Pressable
                    key={it.id}
                    accessibilityRole="button"
                    accessibilityLabel={[it.name, price, detail].filter(Boolean).join(', ')}
                    onPress={() => onItem(biz, it)}
                    style={({ pressed }) => [styles.bannerRow, i > 0 && styles.menuRowLine, pressed && styles.pressed]}
                  >
                    {photo ? <Image source={{ uri: photo }} style={styles.menuImg} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
                    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                      <Text style={styles.bannerItem} numberOfLines={1}>
                        {it.name}
                      </Text>
                      {detail ? (
                        <Text style={[styles.menuDetail, it.kind === 'service' && it.bookable && styles.noteOn]} numberOfLines={1}>
                          {detail}
                        </Text>
                      ) : null}
                    </View>
                    {price ? <Text style={styles.bannerPrice}>{price}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
            <Pressable accessibilityRole="link" onPress={() => onBiz(biz.id)} style={({ pressed }) => [styles.bannerMore, pressed && styles.pressed]}>
              <Text style={styles.menuMore}>{items.length > 3 ? `Ver las ${items.length} cosas que vende` : 'Ver el negocio'}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

function Tile({ photo, art, price, was, tag, name, note, noteOn, onPress }: { photo?: string; art: ArtKey; price: string | null; was?: string | null; tag?: string | null; name: string; note?: string | null; noteOn?: boolean; onPress: () => void }) {
  const label = [name, price, tag, note].filter(Boolean).join(', ');
  if (!photo) {
    // Sin foto no hay un cuadro vacío con el nombre y el nombre otra vez debajo: el nombre se dice una vez.
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.tile, styles.card, pressed && styles.pressed]}>
        <CategoryIllustration k={art} size={44} />
        <Text style={styles.cardName} numberOfLines={3}>
          {name}
        </Text>
        <View style={styles.priceRow}>
          {price ? <Text style={styles.price}>{price}</Text> : null}
          {was ? <Text style={styles.was}>{was}</Text> : null}
        </View>
        {tag ? <Text style={styles.cardTag}>{tag}</Text> : note ? <Text style={[styles.note, noteOn && styles.noteOn]}>{note}</Text> : null}
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View>
        <Image source={{ uri: photo }} style={styles.tileImg} contentFit="cover" accessibilityIgnoresInvertColors />
        {tag ? <Text style={styles.tag}>{tag}</Text> : null}
      </View>
      <View style={styles.priceRow}>
        {price ? <Text style={styles.price}>{price}</Text> : null}
        {was ? <Text style={styles.was}>{was}</Text> : null}
      </View>
      <Text style={styles.tileName} numberOfLines={2}>
        {name}
      </Text>
      {note ? <Text style={[styles.note, noteOn && styles.noteOn]}>{note}</Text> : null}
    </Pressable>
  );
}

/**
 * Resultados de una búsqueda (tablero «Empre Offers», teléfono 1b): arriba quién lo tiene, luego una fila por negocio
 * con solo lo que coincide. Las caras dicen solo el nombre (y «Cerrado» si lo está); los minutos van en su fila.
 */
export function ResultsByBusiness({
  q,
  groups,
  bizById,
  onBiz,
  onItem,
  onAsk,
}: {
  q: string;
  groups: ResultGroup<MarketItem>[];
  bizById: Record<string, DiscoveryItem>;
  onBiz: (id: string) => void;
  onItem: (item: MarketItem) => void;
  onAsk?: () => void;
}) {
  return (
    <View style={styles.results}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.who} accessibilityLabel={`Quién tiene ${q}`}>
        {groups.map((g) => {
          const photo = bizPhoto(bizById[g.entityId]) ?? g.items[0]?.photo;
          return (
            <Pressable key={g.entityId} accessibilityRole="button" accessibilityLabel={`${g.name}${g.open === false ? ', cerrado' : ''}`} onPress={() => onBiz(g.entityId)} style={({ pressed }) => [styles.whoFace, pressed && styles.pressed]}>
              {photo ? (
                <Image source={{ uri: photo }} style={[styles.whoImg, g.open !== false && styles.whoImgOpen]} contentFit="cover" accessibilityIgnoresInvertColors />
              ) : (
                <View style={[styles.whoArt, g.open !== false && styles.whoImgOpen]}>
                  <BusinessArt k={artKeyFor(g.items[0]?.category_name, g.items[0]?.category_icon)} size={52} />
                </View>
              )}
              <Text style={styles.whoName} numberOfLines={1}>
                {g.name}
              </Text>
              {g.open === false ? <Text style={styles.whoClosed}>Cerrado</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      {groups.map((g) => (
        <View key={g.entityId} style={styles.sec}>
          <BizHead
            name={g.name}
            photo={bizPhoto(bizById[g.entityId]) ?? g.items[0]?.photo}
            art={artKeyFor(g.items[0]?.category_name, g.items[0]?.category_icon)}
            distance={g.distance}
            closes={g.openUntil}
            closed={g.open === false}
            onPress={() => onBiz(g.entityId)}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {g.items.map((it) => {
              const p = priceView(it);
              return <Tile key={it.id} photo={it.photo} art={artKeyFor(it.category_name, it.category_icon)} price={p.now} was={p.was} tag={p.save ?? (it.kind === 'offer' ? 'Oferta' : null)} name={it.title} onPress={() => onItem(it)} />;
            })}
          </ScrollView>
        </View>
      ))}
      {onAsk && groups.length > 1 ? (
        <View style={styles.ask}>
          <Text style={styles.askTitle}>¿Comparar antes de ir?</Text>
          <Text style={styles.askText}>{`Pregúntales a los ${groups.length} si tienen hoy y a qué precio. Empre AI responde con lo que publicaron.`}</Text>
          <Pressable accessibilityRole="button" onPress={onAsk} style={({ pressed }) => [styles.askBtn, pressed && styles.pressed]}>
            <Text style={styles.askBtnText}>{`Pregúntales a los ${groups.length}`}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
  sec: { gap: 12 },
  divider: { marginHorizontal: 28, marginBottom: 22 },
  zoneHead: { paddingHorizontal: 20, gap: 2 },
  zoneName: { fontFamily: fonts.display.semibold, fontSize: 22, letterSpacing: -0.2, color: colors.ink },
  zoneSub: { fontFamily: fonts.ui.medium, fontSize: 13, color: colors.muted },
  zoneOpen: { fontFamily: fonts.ui.semibold, color: colors.primaryDark },
  zoneGrid: { gap: 12, paddingHorizontal: 20 },
  zoneCol: { gap: 14 },
  zoneFace: { width: 76, alignItems: 'center', gap: 3 },
  zoneRing: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  zoneRingOpen: { borderColor: colors.primary },
  zoneImg: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.sandSoft },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, minHeight: 44 },
  title: { fontFamily: fonts.display.semibold, fontSize: 17, color: colors.ink },
  why: { fontFamily: fonts.ui.medium, fontSize: 12, color: colors.muted },
  icons: { gap: 18, paddingHorizontal: 20 },
  icon: { width: 64, alignItems: 'center', gap: 6, minHeight: 44 },
  iconArt: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconArtOn: { backgroundColor: colors.selectedSoft },
  iconText: { fontFamily: fonts.ui.medium, fontSize: 12, color: colors.ink, textAlign: 'center' },
  iconTextOn: { fontFamily: fonts.ui.semibold, color: colors.primaryDark },
  chips: { gap: 8, paddingHorizontal: 20 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'center' },
  chipText: { fontFamily: fonts.ui.medium, fontSize: 14, color: colors.ink },
  faces: { gap: 12, paddingHorizontal: 20 },
  face: { width: 84, alignItems: 'center', gap: 4 },
  faceImg: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.sandSoft, borderWidth: 2, borderColor: colors.surface },
  rank: { position: 'absolute', left: -2, top: -2, width: 22, height: 22, borderRadius: 11, overflow: 'hidden', backgroundColor: colors.surface, textAlign: 'center', lineHeight: 22, fontFamily: fonts.ui.extrabold, fontSize: 12, color: colors.primaryDark },
  faceName: { fontFamily: fonts.ui.semibold, fontSize: 12, lineHeight: 15, color: colors.ink, maxWidth: 84, textAlign: 'center' },
  faceMeta: { fontFamily: fonts.ui.medium, fontSize: 11, color: colors.muted },
  bizHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, minHeight: 44 },
  logo: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sandSoft },
  bizName: { fontFamily: fonts.ui.semibold, fontSize: 16, color: colors.ink },
  rail: { gap: 12, paddingHorizontal: 20 },
  menuRowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  menuImg: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.sandSoft },
  menuDetail: { fontFamily: fonts.ui.medium, fontSize: 12, color: colors.muted },
  menuMore: { flex: 1, fontFamily: fonts.ui.semibold, fontSize: 14, color: colors.ink },
  bannerRail: { gap: 12, paddingHorizontal: 20 },
  banner: { borderRadius: 22, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  bannerTop: { height: 112, overflow: 'hidden' },
  bannerArt: { position: 'absolute', right: 12, bottom: 4 },
  bannerStatus: { position: 'absolute', left: 12, top: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.surface, fontFamily: fonts.ui.semibold, fontSize: 12, color: colors.primaryDark },
  bannerClosed: { color: colors.muted },
  bannerHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingTop: 8 },
  bannerLogo: { width: 48, height: 48, marginTop: -32, borderRadius: 24, borderWidth: 3, borderColor: colors.surface, overflow: 'hidden', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  bannerLogoImg: { width: 44, height: 44, borderRadius: 22 },
  bannerName: { fontFamily: fonts.ui.semibold, fontSize: 16, color: colors.ink },
  bannerList: { paddingHorizontal: 14, marginTop: 8 },
  bannerRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  bannerItem: { fontFamily: fonts.ui.medium, fontSize: 14, color: colors.ink },
  bannerPrice: { fontFamily: fonts.ui.semibold, fontSize: 14, color: colors.ink, fontVariant: ['tabular-nums'] },
  bannerMore: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: colors.line },
  tile: { width: 118, gap: 4 },
  tileImg: { width: 118, height: 118, borderRadius: 14, backgroundColor: colors.sandSoft },
  card: { minHeight: 172, padding: 10, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 6 },
  cardName: { flex: 1, fontFamily: fonts.ui.semibold, fontSize: 13, lineHeight: 17, color: colors.ink },
  cardTag: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.accent, fontFamily: fonts.ui.semibold, fontSize: 11, color: colors.ink },
  tag: { position: 'absolute', left: 6, top: 6, paddingHorizontal: 7, paddingVertical: 2, borderTopLeftRadius: 3, borderBottomLeftRadius: 3, borderTopRightRadius: 8, borderBottomRightRadius: 8, overflow: 'hidden', backgroundColor: colors.accent, fontFamily: fonts.ui.semibold, fontSize: 11, color: colors.ink },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 5 },
  price: { fontFamily: fonts.ui.extrabold, fontSize: 14, color: colors.ink, fontVariant: ['tabular-nums'] },
  was: { fontFamily: fonts.ui.medium, fontSize: 11, color: colors.muted, textDecorationLine: 'line-through' },
  tileName: { fontFamily: fonts.ui.medium, fontSize: 12, lineHeight: 16, color: colors.ink },
  note: { fontFamily: fonts.ui.semibold, fontSize: 11, color: colors.muted },
  noteOn: { color: colors.primaryDark },
  results: { gap: 28 },
  who: { gap: 14, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  whoFace: { width: 72, alignItems: 'center', gap: 4 },
  whoImg: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.sandSoft, borderWidth: 2, borderColor: colors.line },
  whoImgOpen: { borderColor: colors.primary },
  whoArt: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  whoName: { fontFamily: fonts.ui.semibold, fontSize: 12, color: colors.ink, maxWidth: 72 },
  whoClosed: { fontFamily: fonts.ui.medium, fontSize: 11, color: colors.muted },
  ask: { marginHorizontal: 20, padding: 14, gap: 8, borderRadius: 18, backgroundColor: colors.surface },
  askTitle: { fontFamily: fonts.ui.semibold, fontSize: 14, color: colors.ink },
  askText: { fontFamily: fonts.ui.medium, fontSize: 13, lineHeight: 18, color: colors.muted },
  askBtn: { alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.sand, justifyContent: 'center' },
  askBtnText: { fontFamily: fonts.ui.semibold, fontSize: 13, color: colors.ink },
});
