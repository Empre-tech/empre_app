import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { offersApi } from '@/api/offers';
import type { OfferClaim, OfferType } from '@/api/types';
import { useClaimOffer } from '@/claims/useClaimOffer';
import { RollingNumber } from '@/components/finance/RollingNumber';
import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import { displayIcon } from '@/lib/mapView';
import { formatEndsWhen, formatSlotsFree, formatWindow, offerTypeLabel } from '@/lib/offer';
import { attendantLine, blocksLabel, metersBetween, savingPesos, whyWorthIt } from '@/lib/offerBarrio';
import { pesos, timeBadge, type MarketItem } from '@/lib/offerMarket';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { alpha, colors, DENSE_TEXT_SCALE, fonts, radius, spacing } from '@/theme';
import { Perforation } from './BarrioRails';
import { NeighborAvatar } from './Neighbors';
import { CategoryWash } from './Wash';

type IconName = keyof typeof Ionicons.glyphMap;

// La hoja de la oferta (3.48): se abre sobre Ofertas sin salir de la pestaña. Foto, la nota de quien atiende, el
// precio y el ahorro, «Por qué vale la pena» (solo hechos), las condiciones y un solo botón fijo abajo, «Reclamar
// oferta». El perfil queda a un toque en la fila del negocio. Al reclamar, el botón se vuelve boleto: sube con un solo
// rebote y lleva al QR (el mismo flujo del reclamo de siempre). Se cierra con ✕, tocando el velo o con «atrás».

const EMPHASIZED = Easing.bezier(0.22, 1, 0.36, 1);

export function OfferSheet({
  item,
  now,
  signedIn,
  onClose,
  onBusiness,
  onShowQR,
  onSignIn,
  onOpenOffer,
}: {
  item: MarketItem;
  now: number;
  signedIn: boolean;
  onClose: () => void;
  onBusiness: (o: MarketItem) => void;
  onShowQR: (c: OfferClaim, o: MarketItem) => void;
  onSignIn: () => void;
  /** «Completa tu plan» (3.49): abrir la oferta de un vecino sugerido. */
  onOpenOffer: (o: MarketItem) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduce = useReduceMotion();
  const claimer = useClaimOffer();
  const [claimed, setClaimed] = useState<OfferClaim | null>(null);
  const [rise] = useState(() => new Animated.Value(reduce ? 1 : 0));
  const [ticket] = useState(() => new Animated.Value(0));
  const sheetH = Math.round(height * 0.88);
  // «Completa tu plan» (3.49): después de reclamar, dos vecinos de otro tipo cerca de este negocio y abiertos.
  const next = useQuery({ queryKey: ['offer-next', item.id], queryFn: () => offersApi.next(item.id), enabled: Boolean(claimed), staleTime: 60_000 });

  useEffect(() => {
    if (reduce) return;
    const a = Animated.timing(rise, { toValue: 1, duration: 320, easing: EMPHASIZED, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [reduce, rise]);
  const close = () => {
    if (reduce) return onClose();
    Animated.timing(rise, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => onClose());
  };

  const o = item;
  const cat = categoryColor(o.category_color).fg;
  const save = savingPesos(o);
  const pct = save && o.reference_price ? Math.round((save / o.reference_price) * 100) : 0;
  const why = whyWorthIt(o, now);
  const who = attendantLine(o);
  const time = timeBadge(o.ends_at, now);
  const photo = o.photo ? resolveImageUrl(o.photo) : null;
  const price = o.special_price ?? null;

  const onClaim = async () => {
    if (!signedIn) return onSignIn();
    const res = await claimer.claim(o.id);
    if (!res) return;
    setClaimed(res.claim);
    AccessibilityInfo.announceForAccessibility(`Es tuya. ${save ? `Ahorras ${pesos(save)}. ` : ''}Muestra el código QR en ${o.entity_name}.`);
    if (reduce) ticket.setValue(1);
    else Animated.spring(ticket, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 160, mass: 0.9 }).start();
  };

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={close}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.veil, { opacity: rise }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar la oferta" style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[styles.sheet, { height: sheetH, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [sheetH, 0] }) }] }]}
      >
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            {photo ? <Image accessible={false} source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : <CategoryWash color={cat} />}
            {!photo ? <Ionicons name={displayIcon(o.category_icon) as IconName} size={150} color={alpha(colors.white, 0.18)} style={styles.heroIcon} /> : null}
            <View style={[styles.clock, time.urgent && styles.clockUrgent]}>
              <Ionicons name="time-outline" size={13} color={time.urgent ? colors.ink : colors.white} />
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.clockText, time.urgent && styles.clockTextUrgent]}>
                {time.urgent ? time.text : `Quedan ${time.text}`}
              </Text>
            </View>
          </View>
          <View style={styles.grab} />
          <View style={styles.content}>
            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.kicker}>
              {offerTypeLabel(o.type as OfferType).toUpperCase()}
            </Text>
            <Text style={styles.title} accessibilityRole="header">
              {o.title}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Ver el perfil de ${o.entity_name}`} onPress={() => onBusiness(o)} style={styles.biz}>
              <NeighborAvatar item={o} size={36} />
              <View style={styles.bizText}>
                <Text style={styles.bizName} numberOfLines={1}>
                  {o.entity_name}
                </Text>
                <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.bizSub}>
                  Ver negocio
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
            {o.owner_note ? (
              <View style={styles.note}>
                <Text style={styles.noteText}>«{o.owner_note}»</Text>
                {who ? <Text style={styles.noteBy}>— {who}</Text> : null}
              </View>
            ) : null}

            <View style={styles.money} accessible accessibilityLabel={[price !== null ? pesos(price) : null, o.reference_price && save ? `antes ${pesos(o.reference_price)}` : null, save ? `ahorras ${pesos(save)}, ${pct} por ciento` : null].filter(Boolean).join(', ')}>
              <View>
                {price !== null ? <Text style={styles.now}>{price === 0 ? 'Gratis' : pesos(price)}</Text> : null}
                {o.reference_price && save ? <Text style={styles.was}>{pesos(o.reference_price)}</Text> : null}
              </View>
              {save ? (
                <View style={styles.saveBox}>
                  <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.saveKick}>
                    AHORRAS
                  </Text>
                  <RollingNumber value={save} style={styles.saveNum} />
                  <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.savePct}>
                    −{pct} %
                  </Text>
                </View>
              ) : null}
            </View>

            {why.length ? (
              <View style={styles.why}>
                <Text style={styles.whyTitle} accessibilityRole="header">
                  Por qué vale la pena
                </Text>
                {why.map((l) => (
                  <View key={l.title} style={styles.whyRow} accessible accessibilityLabel={`${l.title}. ${l.sub}`}>
                    <View style={styles.whyIcon}>
                      <Ionicons name={l.icon} size={17} color={colors.primaryDark} />
                    </View>
                    <View style={styles.whyText}>
                      <Text style={styles.whyLine}>{l.title}</Text>
                      <Text style={styles.whySub}>{l.sub}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.terms}>
              <Row label="Vigencia" value={`Hasta el ${formatEndsWhen(o.ends_at)}`} />
              <Row label="Dónde" value="En el negocio" />
              {o.claim_window_minutes ? <Row label="Para canjear" value={`Tienes ${formatWindow(o.claim_window_minutes)} después de reclamar`} /> : null}
              {typeof o.slots_left === 'number' && typeof o.total_slots === 'number' ? <Row label="Cupos" value={formatSlotsFree(o.slots_left, o.total_slots)} /> : null}
              {o.conditions ? <Row label="Condiciones" value={o.conditions} /> : null}
            </View>
          </View>
        </ScrollView>

        <View style={[styles.foot, { paddingBottom: insets.bottom + spacing.sm }]}>
          {claimer.message ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {claimer.message}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: claimer.busy || Boolean(claimed), busy: claimer.busy }}
            disabled={claimer.busy || Boolean(claimed)}
            onPress={() => void onClaim()}
            style={({ pressed }) => [styles.cta, (claimer.busy || claimed) && styles.ctaDone, pressed && styles.pressed]}
          >
            {claimer.busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.ctaText}>
                {claimed ? 'Reclamada' : signedIn ? `Reclamar oferta${price ? ` · ${pesos(price)}` : ''}` : 'Inicia sesión para reclamar'}
              </Text>
            )}
          </Pressable>
          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.ctaNote}>
            Te damos un código QR para mostrar en el negocio.
          </Text>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={close} style={[styles.x, { top: spacing.md }]}>
          <Ionicons name="close" size={22} color={colors.ink} />
        </Pressable>

        {claimed ? (
          <Animated.View
            style={[styles.ticket, { bottom: insets.bottom + spacing.md, transform: [{ translateY: ticket.interpolate({ inputRange: [0, 1], outputRange: [260, 0] }) }] }]}
            accessibilityViewIsModal
          >
            <View style={[styles.tNotch, styles.tNotchL]} />
            <View style={[styles.tNotch, styles.tNotchR]} />
            <View style={styles.tHead}>
              <View style={styles.ok}>
                <Ionicons name="checkmark" size={22} color={colors.white} />
              </View>
              <View style={styles.tHeadText}>
                <Text style={styles.tTitle} accessibilityRole="header">
                  ¡Es tuya!{save ? ` Ahorras ${pesos(save)}` : ''}
                </Text>
                <Text style={styles.tSub}>
                  Muestra el QR en {o.entity_name}
                  {o.claim_window_minutes ? `. Tienes ${formatWindow(o.claim_window_minutes)} para canjearla.` : '.'}
                </Text>
              </View>
            </View>
            <Perforation />
            {next.data?.length ? (
              <View style={styles.next}>
                <Text style={styles.nextTitle} accessibilityRole="header">
                  Completa tu plan
                </Text>
                <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.nextSub}>
                  Cerca de {o.entity_name}, de otro tipo y abiertos
                </Text>
                <View style={styles.nextRow}>
                  {next.data.map((n) => {
                    const near = blocksLabel(metersBetween(o, n));
                    return (
                      <Pressable
                        key={n.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${n.entity_name}: ${n.title}${savingPesos(n) ? `, ahorras ${pesos(savingPesos(n))}` : ''}${near ? `, ${near}` : ''}`}
                        onPress={() => onOpenOffer(n)}
                        style={({ pressed }) => [styles.nextCard, pressed && styles.pressed]}
                      >
                        <View style={[styles.nextIcon, { backgroundColor: categoryColor(n.category_color).fg }]}>
                          <Ionicons name={displayIcon(n.category_icon) as IconName} size={16} color={colors.white} />
                        </View>
                        <View style={styles.nextText}>
                          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.nextName} numberOfLines={1}>
                            {n.entity_name}
                          </Text>
                          {savingPesos(n) ? (
                            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.nextSave}>
                              −{pesos(savingPesos(n))}
                            </Text>
                          ) : null}
                          {near ? (
                            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.nextNear} numberOfLines={1}>
                              {near}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
            <View style={styles.tActions}>
              <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.tAlt, pressed && styles.pressed]}>
                <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.tAltText}>
                  Seguir viendo
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => onShowQR(claimed, o)} style={({ pressed }) => [styles.tGo, pressed && styles.pressed]}>
                <Ionicons name="qr-code-outline" size={18} color={colors.white} />
                <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.tGoText}>
                  Ver mi QR
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.rowLabel}>
        {label.toUpperCase()}
      </Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: 0.98 }] },
  veil: { backgroundColor: alpha(colors.black, 0.45) },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
  body: { paddingBottom: spacing.lg },
  hero: { height: 170, overflow: 'hidden', backgroundColor: colors.primaryDark },
  heroIcon: { position: 'absolute', right: -30, bottom: -30 },
  grab: { position: 'absolute', top: 8, alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: alpha(colors.white, 0.7) },
  clock: { position: 'absolute', left: spacing.md, bottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: alpha(colors.ink, 0.75) },
  clockUrgent: { backgroundColor: colors.accent },
  clockText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.white },
  clockTextUrgent: { color: colors.ink },
  x: { position: 'absolute', right: spacing.md, width: 44, height: 44, borderRadius: 22, backgroundColor: alpha(colors.white, 0.94), alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  kicker: { fontSize: 10.5, letterSpacing: 0.7, fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  title: { fontSize: 22, lineHeight: 27, fontFamily: fonts.display.bold, color: colors.ink, marginTop: 2 },
  biz: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, marginTop: spacing.xs },
  bizText: { flex: 1, minWidth: 0 },
  bizName: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  bizSub: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.primary },
  note: { backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.xs },
  noteText: { fontSize: 15, lineHeight: 21, fontFamily: fonts.display.bold, color: colors.ink },
  noteBy: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted, marginTop: 4 },
  money: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.successSoft },
  now: { fontSize: 28, fontFamily: fonts.display.bold, color: colors.ink },
  was: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted, textDecorationLine: 'line-through' },
  saveBox: { alignItems: 'flex-end' },
  saveKick: { fontSize: 10, letterSpacing: 0.6, fontFamily: fonts.ui.extrabold, color: colors.successInk },
  saveNum: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.successInk },
  savePct: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.successInk },
  why: { marginTop: spacing.lg },
  whyTitle: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink, marginBottom: spacing.xs },
  whyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  whyIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  whyText: { flex: 1, minWidth: 0 },
  whyLine: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  whySub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  terms: { marginTop: spacing.md, backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  rowLabel: { fontSize: 10.5, letterSpacing: 0.6, fontFamily: fonts.ui.extrabold, color: colors.mutedDark, paddingTop: 2 },
  rowValue: { flex: 1, textAlign: 'right', fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  foot: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  error: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.dangerInk, textAlign: 'center', marginBottom: spacing.sm },
  cta: { minHeight: 54, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  ctaDone: { backgroundColor: colors.primaryDark },
  ctaText: { fontSize: 15.5, fontFamily: fonts.ui.extrabold, color: colors.white },
  ctaNote: { fontSize: 11.5, fontFamily: fonts.ui.semibold, color: colors.muted, textAlign: 'center', marginTop: 6 },
  ticket: { position: 'absolute', left: spacing.md, right: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, shadowColor: colors.black, shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  // Muescas del boleto: del color de la hoja que queda detrás, con la línea del borde (como las tarjetas).
  tNotch: { position: 'absolute', top: 76, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  tNotchL: { left: -9 },
  tNotchR: { right: -9 },
  tHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ok: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.successSolid, alignItems: 'center', justifyContent: 'center' },
  tHeadText: { flex: 1, minWidth: 0 },
  tTitle: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  tSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  tActions: { flexDirection: 'row', gap: spacing.sm },
  next: { gap: 2 },
  nextTitle: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  nextSub: { fontSize: 11.5, fontFamily: fonts.ui.semibold, color: colors.muted, marginBottom: 6 },
  nextRow: { flexDirection: 'row', gap: spacing.sm },
  nextCard: { flex: 1, minWidth: 0, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  nextIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  nextText: { flex: 1, minWidth: 0 },
  nextName: { fontSize: 12, fontFamily: fonts.display.bold, color: colors.ink },
  nextSave: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.successInk },
  nextNear: { fontSize: 10.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  tAlt: { minHeight: 50, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  tAltText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  tGo: { flex: 1, minHeight: 50, borderRadius: radius.md, backgroundColor: colors.primary, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  tGoText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.white },
});
