import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { DiscoveryItem } from '@/api/types';
import { CategoryArt } from '@/components/CategoryArt';
import type { ServiceItem } from '@/lib/catalog';
import { priceText } from '@/lib/catalog';
import { onFootOrDistance } from '@/lib/format';
import { mediaUrl, resolveImageUrl } from '@/lib/image';
import type { IconGroup, PopularPick } from '@/lib/offerHome';
import { openLine } from '@/lib/offerHome';
import { colors, fonts } from '@/theme';

/** Dos filas de íconos a la vista (tablero «Empre Offers», teléfono 1): un toque y filtra, sin deslizar para encontrarlos. */
export const CategoryIcons = memo(function CategoryIcons({ groups, active, onPick }: { groups: IconGroup[]; active?: string; onPick: (key: string | undefined) => void }) {
  return (
    <View style={styles.icons} accessibilityLabel="Categorías">
      {groups.map((g) => {
        const on = active === g.key;
        return (
          <Pressable key={g.key} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={g.label} onPress={() => onPick(on ? undefined : g.key)} style={({ pressed }) => [styles.icon, pressed && styles.pressed]}>
            <View style={[styles.iconArt, on && styles.iconArtOn]}>
              <CategoryArt k={g.key} size={56} />
            </View>
            <Text style={[styles.iconText, on && styles.iconTextOn]} numberOfLines={1}>
              {g.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const km = (m?: number) => onFootOrDistance((m ?? 0) / 1000);
const bizPhoto = (b: DiscoveryItem) => resolveImageUrl(b.photos?.[0] ?? b.profile_url) ?? undefined;

/** «Lo más pegado»: los mejor reseñados cerca, con lo que venden. Solo con reseñas reales. */
export function PopularRail({ title, picks, catalogs, onOpen }: { title: string; picks: PopularPick<DiscoveryItem>[]; catalogs: Record<string, ServiceItem[]>; onOpen: (id: string) => void }) {
  return (
    <View style={styles.sec}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.why}>Los que más y mejor reseñan quienes fueron</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {picks.map(({ item: b, rank }) => {
          const sells = (catalogs[b.id] ?? []).slice(0, 2).map((i) => i.name);
          return (
            <Pressable
              key={b.id}
              accessibilityRole="button"
              accessibilityLabel={`Puesto ${rank}: ${b.name}, ${b.avg_rating.toFixed(1)} estrellas, ${b.review_count} reseñas`}
              onPress={() => onOpen(b.id)}
              style={({ pressed }) => [styles.pop, pressed && styles.pressed]}
            >
              <View>
                <Image source={{ uri: bizPhoto(b) }} style={styles.popImg} contentFit="cover" accessibilityIgnoresInvertColors />
                <Text style={styles.rank}>{rank}</Text>
                {km(b.distance_meters) ? <Text style={styles.popMin}>{km(b.distance_meters)}</Text> : null}
              </View>
              <View style={styles.popBody}>
                <Text style={styles.popName} numberOfLines={1}>
                  {b.name}
                </Text>
                <Text style={styles.popMeta} numberOfLines={1}>
                  ★ {b.avg_rating.toFixed(1).replace('.', ',')} · {b.review_count} {b.review_count === 1 ? 'reseña' : 'reseñas'} · {b.category_name}
                </Text>
                {sells.length ? (
                  <Text style={styles.popSells} numberOfLines={1}>
                    Venden: {sells.join(', ')}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * Un negocio con lo que vende (como las filas por tienda de los mercados): su cara, a cuánto está y si está abierto,
 * y sus productos y servicios en una fila. Tocar uno abre su ficha para preguntar, apartar o reservar.
 */
export function BizShelf({ biz, items, offers, onBiz, onItem }: { biz: DiscoveryItem; items: ServiceItem[]; offers: number; onBiz: () => void; onItem: (item: ServiceItem) => void }) {
  const sub = [km(biz.distance_meters), openLine(biz), offers ? (offers === 1 ? '1 oferta' : `${offers} ofertas`) : null].filter(Boolean).join(' · ');
  return (
    <View style={styles.sec}>
      <Pressable accessibilityRole="link" accessibilityLabel={`Ver ${biz.name}`} onPress={onBiz} style={styles.shelfHead}>
        <Image source={{ uri: resolveImageUrl(biz.profile_url) ?? bizPhoto(biz) }} style={styles.logo} contentFit="cover" accessibilityIgnoresInvertColors />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.shelfName} numberOfLines={1}>
            {biz.name}
          </Text>
          {sub ? (
            <Text style={styles.why} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
        <Text style={styles.link}>Ver negocio ›</Text>
      </Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {items.map((it) => {
          const photo = it.photos?.[0] ? mediaUrl(it.photos[0]) : undefined;
          const price = priceText(it);
          const note = it.kind === 'service' ? (it.bookable ? 'Se reserva' : null) : it.sold_out ? 'Agotado' : null;
          return (
            <Pressable key={it.id} accessibilityRole="button" accessibilityLabel={[it.name, price, note].filter(Boolean).join(', ')} onPress={() => onItem(it)} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.tileImg} contentFit="cover" accessibilityIgnoresInvertColors />
              ) : (
                <View style={[styles.tileImg, styles.tileNoImg]}>
                  <Text style={styles.tileNoImgText} numberOfLines={3}>
                    {it.name}
                  </Text>
                </View>
              )}
              {price ? <Text style={styles.price}>{price}</Text> : null}
              <Text style={styles.tileName} numberOfLines={2}>
                {it.name}
              </Text>
              {note ? <Text style={[styles.note, it.kind === 'service' && styles.noteOn]}>{note}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
  icons: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, rowGap: 14 },
  icon: { width: '20%', alignItems: 'center', gap: 6, minHeight: 44 },
  iconArt: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  iconArtOn: { borderColor: colors.primary },
  iconText: { fontFamily: fonts.ui.medium, fontSize: 12, color: colors.ink, textAlign: 'center', paddingHorizontal: 2 },
  iconTextOn: { fontFamily: fonts.ui.semibold, color: colors.primaryDark },
  sec: { gap: 10 },
  head: { paddingHorizontal: 20, gap: 2 },
  title: { fontFamily: fonts.display.semibold, fontSize: 17, color: colors.ink },
  why: { fontFamily: fonts.ui.medium, fontSize: 12, color: colors.muted },
  link: { fontFamily: fonts.ui.semibold, fontSize: 13, color: colors.primaryDark },
  rail: { gap: 10, paddingHorizontal: 20 },
  pop: { width: 236, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surface },
  popImg: { width: '100%', height: 118, backgroundColor: colors.sandSoft },
  rank: { position: 'absolute', left: 10, top: 10, width: 30, height: 30, borderRadius: 15, overflow: 'hidden', backgroundColor: colors.surface, textAlign: 'center', lineHeight: 30, fontFamily: fonts.ui.extrabold, fontSize: 15, color: colors.primaryDark },
  popMin: { position: 'absolute', right: 10, top: 10, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.surface, fontFamily: fonts.ui.semibold, fontSize: 12, color: colors.ink },
  popBody: { padding: 12, gap: 3 },
  popName: { fontFamily: fonts.ui.semibold, fontSize: 15, color: colors.ink },
  popMeta: { fontFamily: fonts.ui.medium, fontSize: 12, color: colors.muted },
  popSells: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.sandSoft, fontFamily: fonts.ui.medium, fontSize: 12, color: colors.ink },
  shelfHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, minHeight: 44 },
  logo: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sandSoft },
  shelfName: { fontFamily: fonts.ui.semibold, fontSize: 16, color: colors.ink },
  tile: { width: 118, gap: 4 },
  tileImg: { width: 118, height: 118, borderRadius: 14, backgroundColor: colors.sandSoft },
  tileNoImg: { padding: 10, justifyContent: 'flex-end' },
  tileNoImgText: { fontFamily: fonts.ui.semibold, fontSize: 13, color: colors.sandInk },
  price: { fontFamily: fonts.ui.extrabold, fontSize: 14, color: colors.ink, fontVariant: ['tabular-nums'] },
  tileName: { fontFamily: fonts.ui.medium, fontSize: 12, lineHeight: 16, color: colors.ink },
  note: { fontFamily: fonts.ui.semibold, fontSize: 11, color: colors.muted },
  noteOn: { color: colors.primaryDark },
});
