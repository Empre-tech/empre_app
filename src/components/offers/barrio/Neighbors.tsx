import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { RollingNumber } from '@/components/finance/RollingNumber';
import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import { displayIcon } from '@/lib/mapView';
import { attendantLine, blocksLabel, neighborName, personInitial, ringUrgent, savingPesos, type MarketNeighbor } from '@/lib/offerBarrio';
import { pesos, timeBadge, type MarketItem } from '@/lib/offerMarket';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { useScreenReader } from '@/lib/useScreenReader';
import { alpha, colors, DENSE_TEXT_SCALE, fonts, radius, spacing } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

// «Tus vecinos hoy» (3.48): un círculo por negocio con la cara (o la inicial) de quien atiende y el ícono de su
// negocio. El anillo es lo que le queda a su oferta: blanco, naranja bajo una hora y gris cuando ya la viste. Al
// tocarlo se abre su historia a pantalla completa: la nota de quien atiende en grande, la oferta como boleto y dos
// botones. Las historias avanzan cada 6 s (como cualquier historia), se pausan manteniendo pulsado y se recorren
// tocando los lados. Con «Reducir movimiento» o con el lector de pantalla, no avanzan solas.

const STORY_MS = 6000;
const MODAL_GAP_MS = 350;
const RING = 66;
const STROKE = 3;

function Avatar({ item, size, border }: { item: MarketItem; size: number; border?: string }) {
  const cat = categoryColor(item.category_color);
  const uri = item.profile_photo ? resolveImageUrl(item.profile_photo) : null;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: cat.fg, borderColor: border ?? 'transparent' }]}>
      {uri ? (
        <Image accessible={false} source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.avatarText, { fontSize: size * 0.36 }]}>
          {personInitial(item)}
        </Text>
      )}
    </View>
  );
}

function Ring({ left, urgent, seen }: { left: number; urgent: boolean; seen: boolean }) {
  const r = (RING - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const fg = seen ? alpha(colors.white, 0.45) : urgent ? colors.accent : colors.white;
  return (
    <Svg width={RING} height={RING} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={alpha(colors.white, 0.28)} strokeWidth={STROKE} fill="none" />
      <Circle
        cx={RING / 2}
        cy={RING / 2}
        r={r}
        stroke={fg}
        strokeWidth={STROKE}
        fill="none"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={c * (1 - Math.max(0.04, left))}
        strokeLinecap="round"
        transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
      />
    </Svg>
  );
}

export function NeighborsRow({ neighbors, now, onClaim, onChat }: { neighbors: MarketNeighbor[]; now: number; onClaim: (o: MarketItem) => void; onChat: (o: MarketItem) => void }) {
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<number | null>(null);
  const markSeen = useCallback((k: number) => setSeen((s) => (s.has(neighbors[k].item.entity_id) ? s : new Set(s).add(neighbors[k].item.entity_id))), [neighbors]);
  if (!neighbors.length) return null;
  return (
    <>
      <Text style={styles.rowTitle} accessibilityRole="header">
        Tus vecinos hoy
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {neighbors.map((n, k) => {
          const o = n.item;
          const urgent = ringUrgent(o.ends_at, now);
          const cat = categoryColor(o.category_color);
          return (
            <Pressable
              key={o.entity_id}
              accessibilityRole="button"
              accessibilityLabel={`Historia de ${neighborName(o)}, ${o.entity_name}${urgent ? ', su oferta termina pronto' : ''}`}
              onPress={() => {
                markSeen(k);
                setOpen(k);
              }}
              style={({ pressed }) => [styles.st, pressed && styles.pressed]}
            >
              <View style={styles.ringBox}>
                <Ring left={n.time_left} urgent={urgent} seen={seen.has(o.entity_id)} />
                <Avatar item={o} size={RING - 12} border={colors.primaryDark} />
                <View style={styles.badge}>
                  <Ionicons name={displayIcon(o.category_icon) as IconName} size={12} color={cat.fg} />
                </View>
              </View>
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.stName} numberOfLines={1}>
                {neighborName(o)}
              </Text>
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.stBiz} numberOfLines={1}>
                {o.attendant_name ? o.entity_name : ' '}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {open !== null ? (
        <NeighborStory
          neighbors={neighbors}
          start={open}
          now={now}
          onSeen={markSeen}
          onClose={() => setOpen(null)}
          // Primero se cierra la historia y luego se abre lo siguiente: en Android, abrir un Modal mientras otro se
          // está cerrando deja la pantalla congelada en el primero.
          onClaim={(o) => {
            setOpen(null);
            setTimeout(() => onClaim(o), MODAL_GAP_MS);
          }}
          onChat={(o) => {
            setOpen(null);
            setTimeout(() => onChat(o), MODAL_GAP_MS);
          }}
        />
      ) : null}
    </>
  );
}

function NeighborStory({ neighbors, start, now, onSeen, onClose, onClaim, onChat }: { neighbors: MarketNeighbor[]; start: number; now: number; onSeen: (k: number) => void; onClose: () => void; onClaim: (o: MarketItem) => void; onChat: (o: MarketItem) => void }) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const reader = useScreenReader();
  const auto = !reduce && !reader;
  const [cur, setCur] = useState(start);
  const [bar] = useState(() => new Animated.Value(0));
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const n = neighbors[cur];
  const o = n.item;
  const cat = categoryColor(o.category_color);
  const save = savingPesos(o);
  const time = timeBadge(o.ends_at, now);

  const next = useCallback(() => {
    if (cur < neighbors.length - 1) setCur(cur + 1);
    else onClose();
  }, [cur, neighbors.length, onClose]);
  // La barra de la historia actual se llena en 6 s; al llenarse pasa a la siguiente (o se cierra al final).
  const run = useCallback(
    (from: number) => {
      anim.current?.stop();
      if (!auto) {
        bar.setValue(1);
        return;
      }
      bar.setValue(from);
      anim.current = Animated.timing(bar, { toValue: 1, duration: STORY_MS * (1 - from), easing: Easing.linear, useNativeDriver: true });
      anim.current.start(({ finished }) => {
        if (finished) next();
      });
    },
    [auto, bar, next],
  );
  useEffect(() => {
    onSeen(cur);
    run(0);
    return () => anim.current?.stop();
  }, [cur, run, onSeen]);
  const hold = () => anim.current?.stop();
  const release = () => {
    if (!auto) return;
    // Sigue desde donde iba (la barra no vuelve a empezar).
    bar.stopAnimation((v) => run(v));
  };

  return (
    <Modal visible animationType={reduce ? 'none' : 'fade'} statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.story, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
        <View style={[StyleSheet.absoluteFill, styles.storyArt]} pointerEvents="none">
          <View style={[styles.storyGlow, { backgroundColor: alpha(cat.fg, 0.55) }]} />
          <Ionicons name={displayIcon(o.category_icon) as IconName} size={300} color={alpha(colors.white, 0.12)} style={styles.storyIcon} />
        </View>
        <View style={styles.bars}>
          {neighbors.map((_, k) => (
            <View key={k} style={styles.barTrack}>
              {k < cur ? <View style={[styles.barFill, StyleSheet.absoluteFill]} /> : null}
              {k === cur ? <Animated.View style={[styles.barFill, StyleSheet.absoluteFill, styles.barOrigin, { transform: [{ scaleX: bar }] }]} /> : null}
            </View>
          ))}
        </View>
        <View style={styles.head}>
          <Avatar item={o} size={40} border={colors.white} />
          <View style={styles.headText}>
            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.headName} numberOfLines={1} accessibilityRole="header">
              {neighborName(o)} · {o.entity_name}
            </Text>
            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.headSub} numberOfLines={1}>
              {[blocksLabel(o.distance_meters), o.open_now ? 'Abierto ahora' : 'Cerrado ahora', o.rating ? `★ ${o.rating.toFixed(1).replace('.', ',')}` : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar historia" onPress={onClose} hitSlop={8} style={styles.close}>
            <Ionicons name="close" size={26} color={colors.white} />
          </Pressable>
        </View>

        {/* Tocar a los lados recorre; mantener pulsado pausa. El lector usa los botones de abajo. */}
        <View style={styles.taps}>
          <Pressable accessible={false} style={styles.tap} onPress={() => setCur(Math.max(0, cur - 1))} onLongPress={hold} onPressOut={release} delayLongPress={180} />
          <Pressable accessible={false} style={styles.tap} onPress={next} onLongPress={hold} onPressOut={release} delayLongPress={180} />
        </View>

        <View style={styles.storyBottom} pointerEvents="box-none">
          <Text style={styles.note} accessibilityRole="text">
            {o.owner_note ? `«${o.owner_note}»` : o.title}
          </Text>
          {o.owner_note && attendantLine(o) ? <Text style={styles.noteBy}>— {attendantLine(o)}</Text> : null}
          <View style={styles.ticket} accessible accessibilityLabel={`${o.title}, ${pesos(o.special_price ?? 0)}${save ? `, ahorras ${pesos(save)}` : ''}, ${time.text}`}>
            <View style={[styles.notch, styles.notchL]} />
            <View style={[styles.notch, styles.notchR]} />
            <View style={styles.tkBody}>
              <Text style={styles.tkTitle} numberOfLines={2}>
                {o.title}
              </Text>
              <Text style={styles.tkMeta} numberOfLines={1}>
                {o.special_price ? pesos(o.special_price) : ''}
                {o.reference_price && save ? `  ·  antes ${pesos(o.reference_price)}` : ''}
                {`  ·  ${time.urgent ? time.text.toLowerCase() : `quedan ${time.text}`}`}
              </Text>
            </View>
            {save ? (
              <View style={styles.tkSave}>
                <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.tkSaveKick}>
                  AHORRAS
                </Text>
                <RollingNumber value={save} style={styles.tkSaveNum} />
              </View>
            ) : null}
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => onClaim(o)} style={({ pressed }) => [styles.go, pressed && styles.pressed]}>
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.goText}>
                Ver oferta{o.special_price ? ` · ${pesos(o.special_price)}` : ''}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => onChat(o)} style={({ pressed }) => [styles.alt, pressed && styles.pressed]}>
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.altText}>
                Escribirle a {neighborName(o)}
              </Text>
            </Pressable>
            {reader ? (
              <View style={styles.readerNav}>
                <Pressable accessibilityRole="button" accessibilityLabel="Historia anterior" disabled={cur === 0} onPress={() => setCur(Math.max(0, cur - 1))} style={styles.readerBtn}>
                  <Ionicons name="chevron-back" size={22} color={colors.white} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Historia siguiente" onPress={next} style={styles.readerBtn}>
                  <Ionicons name="chevron-forward" size={22} color={colors.white} />
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: 0.95 }] },
  rowTitle: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.white, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 6 },
  row: { gap: spacing.md, paddingHorizontal: spacing.lg },
  st: { width: 72, alignItems: 'center', gap: 3 },
  ringBox: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2 },
  avatarText: { fontFamily: fonts.display.bold, color: colors.white },
  badge: { position: 'absolute', right: 0, bottom: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  stName: { fontSize: 12, fontFamily: fonts.display.bold, color: colors.white, maxWidth: 72 },
  stBiz: { fontSize: 10.5, fontFamily: fonts.ui.semibold, color: alpha(colors.white, 0.85), maxWidth: 72, marginTop: -2 },

  story: { flex: 1, backgroundColor: colors.ink, paddingHorizontal: spacing.lg },
  storyArt: { overflow: 'hidden' },
  storyGlow: { position: 'absolute', width: 420, height: 420, borderRadius: 210, right: -160, top: -120, opacity: 0.6 },
  storyIcon: { position: 'absolute', right: -70, top: 110 },
  bars: { flexDirection: 'row', gap: 4 },
  barTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: alpha(colors.white, 0.3), overflow: 'hidden' },
  barFill: { backgroundColor: colors.white },
  barOrigin: { transformOrigin: 'left' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, zIndex: 2 },
  headText: { flex: 1, minWidth: 0 },
  headName: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.white },
  headSub: { fontSize: 12, fontFamily: fonts.ui.semibold, color: alpha(colors.white, 0.85) },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  taps: { position: 'absolute', left: 0, right: 0, top: 120, bottom: 260, flexDirection: 'row' },
  tap: { flex: 1 },
  storyBottom: { flex: 1, justifyContent: 'flex-end' },
  note: { fontSize: 25, lineHeight: 32, fontFamily: fonts.display.bold, color: colors.white },
  noteBy: { fontSize: 13, fontFamily: fonts.ui.bold, color: alpha(colors.white, 0.85), marginTop: spacing.sm },
  ticket: { marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  notch: { position: 'absolute', top: '50%', marginTop: -8, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.ink },
  notchL: { left: -8 },
  notchR: { right: -8 },
  tkBody: { flex: 1, minWidth: 0 },
  tkTitle: { fontSize: 15, lineHeight: 19, fontFamily: fonts.display.bold, color: colors.ink },
  tkMeta: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted, marginTop: 2 },
  tkSave: { alignItems: 'flex-end', paddingLeft: spacing.sm, borderLeftWidth: 1, borderLeftColor: colors.line },
  tkSaveKick: { fontSize: 9.5, letterSpacing: 0.6, fontFamily: fonts.ui.extrabold, color: colors.successInk },
  tkSaveNum: { fontSize: 19, fontFamily: fonts.display.bold, color: colors.successInk },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  go: { minHeight: 52, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  goText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.white },
  alt: { minHeight: 50, borderRadius: radius.lg, backgroundColor: alpha(colors.white, 0.14), alignItems: 'center', justifyContent: 'center' },
  altText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.white },
  readerNav: { flexDirection: 'row', justifyContent: 'space-between' },
  readerBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});

export { Avatar as NeighborAvatar };
