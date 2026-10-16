import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { formatDistance } from '@/lib/format';
import { offerUrgency, timeLeftLabel, timeLeftMs } from '@/lib/offer';
import { useNow } from '@/lib/useNow';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { WithDistance } from './FeaturedCard';

interface Props {
  entity: WithDistance;
  isMine: boolean;
  /** Oferta con un QR activo del usuario en este negocio (la franja pasa a verde). */
  qrOfferId: string | null;
  onClose: () => void;
  onDirections: () => void;
  /** Abre el perfil; con una oferta, la ficha del perfil se abre en ella. */
  onProfile: (offerId?: string) => void;
  onScan?: () => void;
  onPublishOffer?: () => void;
}

/**
 * Lo que se ve al tocar un negocio en el mapa: su nombre y estado, la franja
 * naranja de la oferta relámpago que termina antes (si tiene) y dos acciones:
 * «Ver perfil» y «Cómo llegar». Ni cantidades de ofertas ni precios: todo eso,
 * escribirle y seguirlo están en el perfil. La franja entera abre el perfil.
 */
export function BusinessSheet({ entity, isMine, qrOfferId, onClose, onDirections, onProfile, onScan, onPublishOffer }: Props) {
  const distance = formatDistance(entity.distanceKm);
  const status = entity.has_hours ? (entity.is_open_now ? 'Abierto' : 'Cerrado') : null;
  const sub = [entity.subcategory || entity.category_name, distance, status].filter(Boolean).join(' · ');

  const offer = entity.has_active_offer ? entity.active_offer : undefined;
  const now = useNow(offer ? 1000 : 60_000);
  const msLeft = offer ? timeLeftMs(offer.ends_at, now) : 0;
  const live = offer && msLeft > 0 ? offer : undefined;
  const urgency = offerUrgency(msLeft);
  const hot = urgency === 'hot' && !qrOfferId;

  // Entrada breve; sin movimiento si el sistema lo pide.
  const [enter] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) enter.setValue(1);
        else Animated.timing(enter, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      })
      .catch(() => enter.setValue(1));
    return () => {
      cancelled = true;
    };
  }, [enter]);

  return (
    <Animated.View style={[styles.sheet, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}>
      <View style={styles.handle} />
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.name} numberOfLines={1}>
            {entity.name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} hitSlop={8} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.ink} />
        </Pressable>
      </View>

      {qrOfferId ? (
        <Strip kind="mine" title="Tu QR está activo" line="Toca para verlo en el perfil" onPress={() => onProfile(qrOfferId)} />
      ) : live ? (
        <Strip
          kind={hot ? 'hot' : 'calm'}
          title={isMine ? `Tu oferta: ${live.title}` : live.title}
          line={timeLeftLabel(msLeft)}
          fraction={Math.min(1, Math.max(0, msLeft / Math.max(1, new Date(live.ends_at).getTime() - new Date(live.starts_at).getTime())))}
          onPress={() => onProfile(live.id)}
        />
      ) : null}

      <View style={styles.actions}>
        {isMine ? (
          <>
            {onPublishOffer ? <Button title="Publicar oferta" onPress={onPublishOffer} style={styles.main} /> : null}
            {onScan ? <Button title="Escanear canje" variant="secondary" onPress={onScan} style={styles.action} /> : null}
          </>
        ) : (
          <>
            <Button title="Ver perfil" onPress={() => onProfile()} style={styles.main} />
            <Button title="Cómo llegar" variant="secondary" onPress={onDirections} style={styles.action} />
          </>
        )}
      </View>
    </Animated.View>
  );
}

/** La franja naranja de la oferta relámpago: toda ella es el botón. Su barra se consume con el tiempo. */
function Strip({ kind, title, line, fraction, onPress }: { kind: 'calm' | 'hot' | 'mine'; title: string; line: string; fraction?: number; onPress: () => void }) {
  const reduce = useReduceMotion();
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    // Última llamada: el rayo late. Con «Reducir movimiento», quieto.
    if (kind !== 'hot' || reduce) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [kind, reduce, pulse]);

  const mine = kind === 'mine';
  const hot = kind === 'hot';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}. ${mine ? 'Ver mi QR' : 'Ver la oferta en el perfil'}`}
      onPress={onPress}
      style={({ pressed }) => [styles.strip, hot && styles.stripHot, mine && styles.stripMine, pressed && styles.pressed]}
    >
      <Animated.View style={[styles.bolt, hot && styles.boltHot, mine && styles.boltMine, { transform: [{ scale: pulse }] }]}>
        <Ionicons name={mine ? 'qr-code' : 'flash'} size={16} color={hot ? colors.accent : mine ? '#fff' : colors.ink} />
      </Animated.View>
      <View style={styles.stripText}>
        <Text style={styles.stripTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.stripLine, hot && styles.stripLineHot, mine && styles.stripLineMine]} numberOfLines={1}>
          {line}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={hot ? colors.ink : mine ? '#1D6B3D' : colors.accentInk} />
      {typeof fraction === 'number' ? (
        <View style={styles.bar}>
          <View style={[styles.barFill, hot && styles.barFillHot, { width: `${Math.round(fraction * 100)}%` }]} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 2,
    borderTopRightRadius: radius.lg + 2,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.md,
    ...shadow,
  },
  handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  headText: { flex: 1, minWidth: 0 },
  name: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  sub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1.5,
    borderColor: colors.accent,
    overflow: 'hidden',
  },
  // Última llamada: ámbar sólido con texto en tinta (6,1:1).
  stripHot: { backgroundColor: colors.accent },
  stripMine: { backgroundColor: '#E3F4EA', borderColor: colors.success },
  bolt: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  boltHot: { backgroundColor: colors.ink },
  boltMine: { backgroundColor: colors.success },
  stripText: { flex: 1, minWidth: 0, gap: 1 },
  stripTitle: { fontSize: 14.5, fontFamily: fonts.display.bold, color: colors.ink },
  stripLine: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.accentInk },
  stripLineHot: { color: colors.ink },
  stripLineMine: { color: '#1D6B3D' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(22,35,58,0.1)' },
  barFill: { height: 3, backgroundColor: colors.accentDark },
  barFillHot: { backgroundColor: colors.ink },
  pressed: { opacity: 0.85 },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  main: { flex: 1.4, paddingHorizontal: spacing.sm, minHeight: 46 },
  action: { flex: 1, paddingHorizontal: spacing.sm, minHeight: 46 },
});
