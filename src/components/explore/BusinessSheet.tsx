import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi } from '@/api/agenda';
import { Cover } from '@/components/Cover';
import { FEATURES } from '@/config';
import { formatDistance } from '@/lib/format';
import { resolveImageUrl } from '@/lib/image';
import { offerUrgency, timeLeftLabel, timeLeftMs } from '@/lib/offer';
import { nextSlotText, statusLine, swipeEnters, walkText } from '@/lib/placeCard';
import { featuredRating } from '@/lib/reviewSnippet';
import { useNow } from '@/lib/useNow';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, spacing } from '@/theme';
import type { WithDistance } from './FeaturedCard';

interface Props {
  entity: WithDistance;
  isMine: boolean;
  /** Oferta con un QR activo del usuario en este negocio (la franja pasa a verde). */
  qrOfferId: string | null;
  onClose: () => void;
  onDirections: () => void;
  /** Abre el chat con el negocio. */
  onMessage?: () => void;
  /** Abre el perfil; con una oferta, la ficha del perfil se abre en ella. */
  onProfile: (offerId?: string) => void;
  onScan?: () => void;
  onPublishOffer?: () => void;
  /** La reseña verificada más reciente, ya en cita y firma; sin ella sale la frase corta del negocio. */
  review?: { quote: string; byline: string };
  /** Alto de la ficha, para que el mapa ponga el negocio en el centro del espacio libre. */
  onHeight?: (height: number) => void;
}

/**
 * La tarjeta del negocio al tocarlo en el mapa (lienzo «Empre», Sistema): estado arriba, foto pequeña con nombre,
 * categoría, distancia y nota; «Escribir» y «Cómo llegar»; debajo, una sola línea de lo que sigue (tu QR, la oferta o la
 * próxima hora) y la franja roja con la acción principal. Ni cantidades de ofertas ni precios. La foto, el nombre y
 * deslizar la tarjeta hacia arriba también abren el perfil.
 */
export function BusinessSheet({ entity, isMine, qrOfferId, onClose, onDirections, onMessage, onProfile, onScan, onPublishOffer, review, onHeight }: Props) {
  const distance = formatDistance(entity.distanceKm);
  const walk = walkText(entity.distanceKm);
  const rating = featuredRating(entity.avg_rating, entity.review_count);
  const sub = [entity.subcategory || entity.category_name, distance, walk].filter(Boolean).join(' · ');
  const status = statusLine(entity);
  const photo = entity.profile_url ? resolveImageUrl(entity.profile_url) : null;
  const quote = review?.quote ?? (entity.tagline ? entity.tagline : null);

  // Deslizar la ficha hacia arriba entra al perfil (atajo del botón: quien no lo usa no pierde nada).
  // Se crea una sola vez: con una oferta la ficha se repinta cada segundo y un gesto a medias no debe perderse.
  const profileRef = useRef(onProfile);
  useEffect(() => {
    profileRef.current = onProfile;
  });
  const pan = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- el callback del gesto corre por eventos del dedo, nunca durante el render
      PanResponder.create({
        // En la fase de captura: un arrastre vertical hacia arriba gana aunque empiece sobre un botón; un toque no se mueve.
        onMoveShouldSetPanResponderCapture: (_, g) => g.dy < -8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
        onPanResponderRelease: (_, g) => {
          if (swipeEnters(g.dy)) profileRef.current();
        },
      }),
    [],
  );

  const offer = entity.has_active_offer ? entity.active_offer : undefined;
  const now = useNow(offer ? 1000 : 60_000);
  const msLeft = offer ? timeLeftMs(offer.ends_at, now) : 0;
  const live = offer && msLeft > 0 ? offer : undefined;
  const urgency = offerUrgency(msLeft);
  const hot = urgency === 'hot' && !qrOfferId;
  const insets = useSafeAreaInsets();

  // La próxima hora solo se pide si no hay algo más importante que mostrar en esa línea.
  const wantsSlot = FEATURES.agenda && !isMine && !qrOfferId && !live;
  const agenda = useQuery({ queryKey: ['agenda-summary', entity.id], queryFn: () => agendaApi.summary(entity.id), enabled: wantsSlot, staleTime: 60_000, retry: false });
  const slot = wantsSlot && agenda.data?.enabled ? nextSlotText(agenda.data.next_slot, new Date(now)) : null;
  const trayStyle = qrOfferId ? styles.trayMine : live ? (hot ? styles.trayHot : styles.trayCalm) : slot ? styles.trayHour : null;
  const showBand = !isMine || Boolean(onPublishOffer);

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
    <Animated.View
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}
      {...pan.panHandlers}
      style={[styles.sheet, { bottom: insets.bottom + 12, opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}
    >
      <View style={[styles.shell, showBand && styles.shellBand]}>
        <View style={[styles.tray, trayStyle]}>
          <View style={styles.card}>
            <View style={styles.statusRow}>
              {status ? <View style={[styles.statusDot, { backgroundColor: status.tone === 'open' ? colors.verified : colors.warning }]} /> : null}
              <Text style={[styles.statusText, status?.tone === 'open' && styles.statusOpen]} numberOfLines={1}>
                {status?.text ?? ''}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} hitSlop={4} style={styles.close}>
                <Ionicons name="close" size={18} color={colors.ink} />
              </Pressable>
            </View>

            <Pressable accessibilityRole="button" accessibilityLabel={`${entity.name}. ${sub}.${entity.review_count == null ? '' : ` ${rating.text}.`} Entrar al negocio`} onPress={() => onProfile()} style={styles.identity}>
              <Cover photo={photo} category={entity.subcategory || entity.category_name} icon={entity.category_icon} iconName={(entity.category_icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap} iconSize={30} style={styles.photo} />
              <View style={styles.identityText}>
                <Text style={styles.name} numberOfLines={1}>
                  {entity.name}
                </Text>
                <Text style={styles.sub} numberOfLines={2}>
                  {sub}
                </Text>
                {entity.review_count == null ? null : <Text style={[styles.rating, !rating.hasScore && styles.ratingMuted]}>{rating.text}</Text>}
              </View>
            </Pressable>

            {quote ? (
              <Text style={styles.quote} numberOfLines={1} accessibilityLabel={review ? `Reseña: ${review.quote}. ${review.byline}` : quote}>
                {review ? review.quote : quote}
              </Text>
            ) : null}

            <View style={styles.actions}>
              {isMine ? (
                onScan ? <SoftButton icon="qr-code-outline" label="Escanear canje" onPress={onScan} /> : null
              ) : (
                <>
                  {onMessage ? <SoftButton icon="chatbubble-outline" label="Escribir" onPress={onMessage} /> : null}
                  <SoftButton icon="navigate-outline" label="Cómo llegar" onPress={onDirections} />
                </>
              )}
            </View>
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
          ) : slot ? (
            <Strip kind="hour" title={slot} line="Resérvala desde su perfil" onPress={() => onProfile()} />
          ) : null}
        </View>

        {showBand ? (
          <Pressable accessibilityRole="button" onPress={isMine ? onPublishOffer : () => onProfile()} style={({ pressed }) => [styles.band, pressed && { backgroundColor: colors.primaryPressed }]}>
            <Text style={styles.bandText}>{isMine ? 'Publicar oferta' : 'Entrar al negocio'}</Text>
            <Ionicons name="arrow-forward" size={17} color="#fff" />
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

function SoftButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.soft, pressed && styles.pressed]}>
      <Ionicons name={icon} size={16} color={colors.ink} />
      <Text style={styles.softText}>{label}</Text>
    </Pressable>
  );
}

/** Lo que sigue, debajo de la tarjeta: la oferta, tu QR o la próxima hora. Toda la línea es el botón. */
function Strip({ kind, title, line, fraction, onPress }: { kind: 'calm' | 'hot' | 'mine' | 'hour'; title: string; line: string; fraction?: number; onPress: () => void }) {
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
  const hour = kind === 'hour';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${line}. ${mine ? 'Ver mi QR' : hour ? 'Ver el perfil' : 'Ver la oferta en el perfil'}`} onPress={onPress} style={({ pressed }) => [styles.strip, pressed && styles.pressed]}>
      <Animated.View style={[styles.bolt, hot && styles.boltHot, mine && styles.boltMine, hour && styles.boltHour, { transform: [{ scale: pulse }] }]}>
        <Ionicons name={mine ? 'qr-code' : hour ? 'calendar-outline' : 'flash'} size={14} color={hot ? colors.accent : mine ? '#fff' : colors.ink} />
      </Animated.View>
      <View style={styles.stripText}>
        <Text style={styles.stripTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.stripLine, hot && styles.stripLineHot, mine && styles.stripLineMine, hour && styles.stripLineHour]} numberOfLines={1}>
          {line}
        </Text>
        {typeof fraction === 'number' ? (
          <View style={[styles.bar, hot && styles.barHot]}>
            <View style={[styles.barFill, hot && styles.barFillHot, { width: `${Math.round(fraction * 100)}%` }]} />
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.ink} />
    </Pressable>
  );
}

const PHOTO = 72;

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 12, right: 12, borderRadius: 24, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  shell: { borderRadius: 24, overflow: 'hidden', backgroundColor: colors.surface },
  shellBand: { backgroundColor: colors.primary },
  tray: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20, overflow: 'hidden', backgroundColor: colors.surface },
  trayCalm: { backgroundColor: colors.accentSoft },
  trayHot: { backgroundColor: colors.accent },
  trayMine: { backgroundColor: colors.verifiedSoft },
  trayHour: { backgroundColor: colors.selectedSoft },
  card: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14, gap: 8, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, backgroundColor: colors.surface },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { flex: 1, minWidth: 0, fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  statusOpen: { color: colors.verified },
  close: { width: 44, height: 44, marginRight: -10, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identityText: { flex: 1, minWidth: 0, gap: 2 },
  photo: { width: PHOTO, height: PHOTO, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  name: { fontSize: 19, lineHeight: 23, fontFamily: fonts.display.bold, color: colors.ink },
  sub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.muted },
  rating: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  ratingMuted: { color: colors.muted, fontFamily: fonts.ui.semibold },
  quote: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, fontStyle: 'italic', color: colors.muted },
  strip: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9 },
  bolt: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  boltHot: { backgroundColor: colors.ink },
  boltMine: { backgroundColor: colors.success },
  boltHour: { backgroundColor: colors.surface },
  stripText: { flex: 1, minWidth: 0, gap: 3 },
  stripTitle: { fontSize: 14, lineHeight: 17, fontFamily: fonts.ui.extrabold, color: colors.ink },
  stripLine: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.accentInk },
  stripLineHot: { color: colors.ink },
  stripLineMine: { color: colors.verified },
  stripLineHour: { color: colors.muted },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(154,79,0,0.18)' },
  barHot: { backgroundColor: 'rgba(14,35,70,0.18)' },
  barFill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  barFillHot: { backgroundColor: colors.ink },
  pressed: { opacity: 0.85 },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingTop: 4 },
  soft: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  softText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  // La acción principal, completa, debajo de las capas.
  band: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.primary },
  bandText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: '#fff' },
});
