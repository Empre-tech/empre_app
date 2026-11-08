import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Cover } from '@/components/Cover';
import { categoryColor } from '@/lib/categoryColor';
import { displayIcon } from '@/lib/mapView';
import {
  distanceLabel,
  featuredA11y,
  featuredClock,
  itemStatusBadge,
  priceView,
  tileA11y,
  zoneSubtitle,
  type MarketItem,
  type MarketZone,
} from '@/lib/offerMarket';
import { colors, fonts, radius, spacing } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** Foto del negocio o del producto/servicio; sin foto, su portada editorial. */
function Photo({ item, style, size }: { item: MarketItem; style: object; size: 'sm' | 'md' | 'lg' }) {
  return <Cover photo={item.photo} category={item.category_name} icon={item.category_icon} iconName={displayIcon(item.category_icon) as IconName} iconSize={DIMS[size]} style={style} />;
}
const DIMS = { sm: 30, md: 56, lg: 72 };

/**
 * Precio con psicologia de anclaje (inspirado en Swiggy / Shop):
 * - Si hay precio habitual tachado (`was`), el precio especial (`now`) se destaca en una etiqueta calida tipo marcador.
 * - Si es precio de catalogo (`kind === 'service'`), se muestra limpio con soporte para «Desde $...».
 */
function Price({ item, big }: { item: MarketItem; big?: boolean }) {
  const p = priceView(item);
  if (!p.now) {
    return <Text style={styles.consultPrice}>Consultar precio</Text>;
  }
  return (
    <View style={styles.priceRow}>
      {p.was ? <Text style={styles.was}>{p.was}</Text> : null}
      <View style={[p.was ? styles.promoPriceTag : null]}>
        <Text style={[styles.price, big && styles.priceBig, p.was ? styles.promoPriceText : null]}>{p.now}</Text>
      </View>
    </View>
  );
}

/**
 * Tarjeta unificada de Vitrina (Oferta o Servicio/Producto de Catalogo) con modelo AIDA:
 * 1. Atencion: Insignia de ahorro (-20%) o sello de Catalogo + indicador si el negocio tiene oferta activa.
 * 2. Interes: Negocio + distancia + calificacion o estado abierto.
 * 3. Deseo: Anclaje visual de precio (etiqueta ambar sobre precio tachado) o duracion/modalidad del servicio.
 * 4. Accion: Pie con reloj/estado y boton rapido «IA / Ver» para abrir la ficha interactiva.
 */
export function OfferTile({ item, now, onPress, width = TILE_W, selected }: { item: MarketItem; now: number; onPress: () => void; width?: number; selected?: boolean }) {
  const dist = distanceLabel(item.distance_meters);
  const save = priceView(item).save;
  const status = itemStatusBadge(item, now);
  const isService = item.kind === 'service';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tileA11y(item, now)}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width }, selected && styles.tileOn, pressed && styles.pressed]}
    >
      <View style={styles.tileClip}>
        {selected ? (
          <View style={styles.tricolorBar}>
            <View style={[styles.tricolorSeg, { backgroundColor: colors.primary }]} />
            <View style={[styles.tricolorSeg, { backgroundColor: '#14B8B0' }]} />
            <View style={[styles.tricolorSeg, { backgroundColor: colors.accent }]} />
          </View>
        ) : null}
        <View style={styles.tilePhotoWrap}>
          <Photo item={item} style={styles.tilePhoto} size="md" />
          {save ? (
            <View style={styles.saveTag}>
              <Text style={styles.saveTagText}>{save}</Text>
            </View>
          ) : isService ? (
            <View style={styles.catalogTag}>
              <Ionicons name="pricetag-outline" size={11} color="#fff" />
              <Text style={styles.catalogTagText} numberOfLines={1}>
                {item.section || 'Catálogo'}
              </Text>
            </View>
          ) : null}

          {isService && item.has_entity_offer ? (
            <View style={styles.entityOfferTag}>
              <Ionicons name="flame" size={11} color={colors.ink} />
              <Text style={styles.entityOfferTagText}>Con oferta</Text>
            </View>
          ) : item.rating && item.rating >= 4.0 ? (
            <View style={styles.ratingTag}>
              <Ionicons name="star" size={10} color="#fff" />
              <Text style={styles.ratingTagText}>{item.rating.toFixed(1)}</Text>
            </View>
          ) : null}

          {selected ? (
            <View style={styles.mapActiveTag}>
              <Ionicons name="location" size={11} color="#fff" />
              <Text style={styles.mapActiveTagText}>En el mapa</Text>
            </View>
          ) : item.open_now ? (
            <View style={styles.openPhotoPill}>
              <View style={styles.openDot} />
              <Text style={styles.openPhotoText}>Abierto</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.tileBody}>
          <View style={styles.tileBizRow}>
            <Text style={styles.tileBiz} numberOfLines={1}>
              {item.entity_name}
            </Text>
            {dist ? (
              <View style={styles.tileDistPill}>
                <Text style={styles.tileDistText}>a {dist}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.tileTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.ticketPerfRow} pointerEvents="none">
            <View style={styles.notchLeft} />
            <View style={styles.ticketDash} />
            <View style={styles.notchRight} />
          </View>
          <Price item={item} />
          <View style={styles.tileFootRow}>
            <View style={[styles.tileClock, status.urgent && styles.tileClockUrgent, isService && styles.tileServiceMeta]}>
              <Ionicons
                name={isService ? (item.bookable ? 'calendar-outline' : 'checkmark-circle-outline') : 'time-outline'}
                size={13}
                color={status.urgent ? ACCENT_INK : isService ? colors.verified : colors.muted}
              />
              <Text
                style={[styles.tileClockText, status.urgent && { color: ACCENT_INK }, isService && { color: colors.verified }]}
                numberOfLines={1}
              >
                {status.text}
              </Text>
            </View>
            <View style={styles.quickActionPill}>
              <Ionicons name="sparkles" size={11} color={colors.primaryDark} />
              <Text style={styles.quickActionText}>{isService ? 'Info' : 'Ver'}</Text>
            </View>
          </View>
          {item.reason ? (
            <Text style={styles.reasonText} numberOfLines={1}>
              {item.reason}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Fila de «Todas» y resultados de búsqueda: soporta tanto ofertas como productos/servicios del catálogo. */
export function OfferRow({ item, now, onPress }: { item: MarketItem; now: number; onPress: () => void }) {
  const status = itemStatusBadge(item, now);
  const dist = distanceLabel(item.distance_meters);
  const isService = item.kind === 'service';
  const save = priceView(item).save;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={tileA11y(item, now)} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowPhotoWrap}>
        <Photo item={item} style={styles.rowPhoto} size="sm" />
        {save ? (
          <View style={styles.rowSaveBadge}>
            <Text style={styles.rowSaveBadgeText}>{save.replace(' ', '')}</Text>
          </View>
        ) : isService ? (
          <View style={styles.rowCatBadge}>
            <Text style={styles.rowCatBadgeText}>Catálogo</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTopLine}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          {isService && item.has_entity_offer ? (
            <View style={styles.rowOfferAlert}>
              <Ionicons name="flame" size={11} color={ACCENT_INK} />
              <Text style={styles.rowOfferAlertText}>Tiene oferta</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {[
            item.entity_name,
            dist ? `a ${dist}` : null,
            isService ? status.text : status.urgent ? status.text.toLowerCase() : status.text.toLowerCase(),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <View style={styles.rowPrice}>
          <Price item={item} />
          {save ? (
            <View style={styles.save}>
              <Text style={styles.saveText}>Ahorras {save.replace('-', '')}</Text>
            </View>
          ) : null}
          <View style={styles.rowAskChip}>
            <Ionicons name="sparkles" size={11} color={colors.ink} />
            <Text style={styles.rowAskChipText}>Preguntar / Ver</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * «Mayor ahorro de hoy» (3.40): la destacada de la vitrina, por una regla que se lee en la etiqueta (nunca pagada).
 * Foto grande, el ahorro en un círculo verde y el reloj.
 */
export function FeaturedOffer({ item, now, onPress }: { item: MarketItem; now: number; onPress: () => void }) {
  const save = priceView(item).save;
  const clock = featuredClock(item.ends_at, now);
  const dist = distanceLabel(item.distance_meters);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={featuredA11y(item, now)} onPress={onPress} style={({ pressed }) => [styles.feat, pressed && styles.pressed]}>
      <View style={styles.tricolorBar}>
        <View style={[styles.tricolorSeg, { backgroundColor: colors.primary }]} />
        <View style={[styles.tricolorSeg, { backgroundColor: '#14B8B0' }]} />
        <View style={[styles.tricolorSeg, { backgroundColor: colors.accent }]} />
      </View>
      <Photo item={item} style={styles.featPhoto} size="lg" />
      <View style={[styles.badge, styles.badgeLeft]}>
        <Ionicons name="sparkles" size={12} color={colors.accent} />
        <Text style={styles.ruleText}>Mayor ahorro de hoy</Text>
      </View>
      {save ? (
        <View style={styles.bigSave}>
          <Text style={styles.bigSaveText}>{save.replace(' ', '')}</Text>
          <Text style={styles.bigSaveSub}>AHORRO</Text>
        </View>
      ) : null}
      <View style={styles.featBody}>
        <Text style={styles.featTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[item.entity_name, dist].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.featFoot}>
          <Price item={item} big />
          <View style={[styles.clock, clock.urgent && styles.clockUrgent]}>
            <Ionicons name="time-outline" size={13} color={clock.urgent ? colors.ink : ACCENT_INK} />
            <Text style={[styles.clockText, clock.urgent && styles.urgentText]}>{clock.text}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** Una categoría de la fila con iconos (3.40): icono en su color, nombre corto debajo, 44 pt o más para tocar. */
export function CategoryTile({ name, short, icon, color, active, onPress }: { name: string; short: string; icon?: string; color?: string; active: boolean; onPress: () => void }) {
  const c = categoryColor(color);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [styles.cat, pressed && styles.catPressed]}>
      <View style={[styles.catIcon, { backgroundColor: c.bg }, active && { borderColor: colors.ink }]}>
        <Ionicons name={displayIcon(icon) as IconName} size={22} color={c.fg} />
      </View>
      <Text style={[styles.catText, active && styles.catTextOn]} numberOfLines={1}>
        {short}
      </Text>
    </Pressable>
  );
}

/** Tarjeta de «Por zona» (3.39): mosaico de hasta 3 categorías, nombre y qué tan lejos queda. Lleva a la lista de esa
 * zona. Sin conteos. */
export function ZoneCard({ zone, onPress }: { zone: MarketZone; onPress: () => void }) {
  const looks = zone.looks.length ? zone.looks : [{}];
  const tiles = [0, 1, 2].map((i) => looks[i % looks.length]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver ofertas de ${zone.name}, ${zoneSubtitle(zone).toLowerCase()}`}
      onPress={onPress}
      style={({ pressed }) => [styles.zone, pressed && styles.pressed]}
    >
      <View style={styles.mosaic}>
        {tiles.map((l, i) => (
          <View key={i} style={[styles.mosaicCell, { backgroundColor: categoryColor(l.color).fg }]}>
            <Ionicons name={displayIcon(l.icon) as IconName} size={18} color="rgba(255,255,255,0.92)" />
          </View>
        ))}
      </View>
      <View style={styles.zoneBody}>
        <Text style={styles.title} numberOfLines={1}>
          {zone.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {zoneSubtitle(zone)}
        </Text>
        {zone.here ? (
          <View style={styles.here}>
            <Text style={styles.hereText}>Tu zona</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export const ZONE_W = 168;
// Verde del ahorro y tonos del reloj (los mismos del mockup vitrina_viva.html).
const SAVE_GREEN = '#2E7D4F';
const ACCENT_SOFT = '#FFF1E3';
const ACCENT_INK = '#8F4300';
export const TILE_W = 224;
export const TILE_GAP = 12;

const styles = StyleSheet.create({
  tile: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  tileOn: { borderWidth: 2, borderColor: colors.ink, shadowOpacity: 0.14, shadowRadius: 14, elevation: 4 },
  tileClip: { borderRadius: 19, overflow: 'hidden' },
  tricolorBar: { flexDirection: 'row', height: 4, width: '100%' },
  tricolorSeg: { flex: 1, height: '100%' },
  pressed: { transform: [{ scale: 0.975 }], opacity: 0.95 },
  tilePhotoWrap: { position: 'relative' },
  tilePhoto: { height: 118, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badge: { position: 'absolute', top: 12, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  badgeLeft: { left: 10, backgroundColor: 'rgba(255,255,255,0.96)' },
  urgentText: { color: colors.ink },
  tileBody: { paddingTop: 11, paddingHorizontal: 13, paddingBottom: 13, gap: 5 },
  tileBizRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  tileBiz: { flex: 1, fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  tileDistPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: '#E3F5F3' },
  tileDistText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.verified },
  tileTitle: { fontSize: 16, lineHeight: 20, minHeight: 40, fontFamily: fonts.display.bold, color: colors.ink },
  ticketPerfRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -13, marginVertical: 3 },
  notchLeft: { width: 10, height: 10, borderRadius: 5, marginLeft: -5, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  ticketDash: { flex: 1, height: 1, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.line, marginHorizontal: 4 },
  notchRight: { width: 10, height: 10, borderRadius: 5, marginRight: -5, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  tileFootRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 2 },
  tileClock: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.selectedSoft },
  tileClockUrgent: { backgroundColor: ACCENT_SOFT },
  tileServiceMeta: { backgroundColor: '#E3F5F3' },
  tileClockText: { flexShrink: 1, fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  quickActionPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  quickActionText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  mapActiveTag: { position: 'absolute', left: 9, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(14,35,70,0.88)' },
  mapActiveTagText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: '#fff' },
  openPhotoPill: { position: 'absolute', left: 9, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.92)' },
  openDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.verified },
  openPhotoText: { fontSize: 10.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  catalogTag: { position: 'absolute', left: 9, top: 9, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(14,35,70,0.84)' },
  catalogTagText: { maxWidth: 110, fontSize: 11, fontFamily: fonts.ui.extrabold, color: '#fff' },
  entityOfferTag: { position: 'absolute', right: 9, top: 9, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.accent },
  entityOfferTagText: { fontSize: 10.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  ratingTag: { position: 'absolute', right: 9, top: 9, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: SAVE_GREEN },
  ratingTagText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: '#fff' },
  title: { flex: 1, fontSize: 14.5, lineHeight: 19, fontFamily: fonts.display.bold, color: colors.ink, minHeight: 18 },
  meta: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  price: { fontSize: 17, fontFamily: fonts.ui.extrabold, color: colors.ink, fontVariant: ['tabular-nums'] },
  promoPriceTag: { backgroundColor: '#FFF1E3', borderWidth: 1, borderColor: colors.accent, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 1 },
  promoPriceText: { color: colors.ink },
  consultPrice: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.muted },
  was: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.faint, textDecorationLine: 'line-through', fontVariant: ['tabular-nums'] },
  save: { backgroundColor: '#E3F5F3', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  saveText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: '#1B6B3C' },
  reasonText: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.sm + 2, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  rowPhotoWrap: { position: 'relative', width: 82, height: 82 },
  rowPhoto: { width: 82, height: 82, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rowSaveBadge: { position: 'absolute', left: 4, top: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.accent },
  rowSaveBadgeText: { fontSize: 10.5, fontFamily: fonts.display.bold, color: colors.ink },
  rowCatBadge: { position: 'absolute', left: 4, bottom: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(14,35,70,0.84)' },
  rowCatBadgeText: { fontSize: 9.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  rowBody: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 3 },
  rowTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  rowOfferAlert: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: ACCENT_SOFT },
  rowOfferAlertText: { fontSize: 10.5, fontFamily: fonts.ui.extrabold, color: ACCENT_INK },
  rowAskChip: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.selectedSoft },
  rowAskChipText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.ink },
  zone: { width: 168, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  mosaic: { flexDirection: 'row', height: 64 },
  mosaicCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  zoneBody: { padding: spacing.sm + 2, paddingTop: spacing.sm, gap: 2 },
  here: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: colors.primarySoft, borderRadius: 6, paddingHorizontal: 6 },
  hereText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  saveTag: { position: 'absolute', left: 9, top: 9, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.accent, shadowColor: colors.ink, shadowOpacity: 0.16, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  saveTagText: { fontSize: 12.5, fontFamily: fonts.display.bold, color: colors.ink },
  rowPrice: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  priceBig: { fontSize: 22 },
  feat: { marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  featPhoto: { height: 150, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ruleText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.ink },
  bigSave: { position: 'absolute', right: 12, top: 102, width: 74, height: 74, borderRadius: 37, backgroundColor: SAVE_GREEN, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: colors.ink, shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  bigSaveText: { fontSize: 19, lineHeight: 22, fontFamily: fonts.display.bold, color: '#fff' },
  bigSaveSub: { fontSize: 9, fontFamily: fonts.ui.extrabold, color: '#fff', letterSpacing: 0.4 },
  featBody: { padding: spacing.md, paddingTop: spacing.sm + 2, gap: 3 },
  featTitle: { fontSize: 18, lineHeight: 22, fontFamily: fonts.display.bold, color: colors.ink, paddingRight: 76 },
  featFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: 4 },
  clock: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: ACCENT_SOFT },
  clockUrgent: { backgroundColor: colors.accent },
  clockText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: ACCENT_INK },
  cat: { width: 64, alignItems: 'center', gap: 5, minHeight: 44 },
  catPressed: { transform: [{ scale: 0.95 }] },
  catIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'transparent' },
  catText: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.ink },
  catTextOn: { fontFamily: fonts.ui.extrabold },
});
