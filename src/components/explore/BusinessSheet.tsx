import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { categoryColor } from '@/lib/categoryColor';
import { formatDistance } from '@/lib/format';
import { resolveImageUrl } from '@/lib/image';
import { offerUrgency, timeLeftLabel, timeLeftMs } from '@/lib/offer';
import { statusLine, swipeEnters, walkText } from '@/lib/placeCard';
import { featuredRating } from '@/lib/reviewSnippet';
import { useNow } from '@/lib/useNow';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, radius, spacing } from '@/theme';
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
 * La tarjeta del negocio al tocarlo en el mapa (lienzo «Empre», página 8): estado arriba, foto grande, nombre,
 * categoría con distancia y nota; una frase de reseña; la franja de la oferta (si tiene); «Escribir» y «Cómo llegar»;
 * y debajo asoma la franja roja con la acción principal. Ni cantidades de ofertas ni precios. La foto, el nombre y
 * deslizar la tarjeta hacia arriba también abren el perfil.
 */
export function BusinessSheet({ entity, isMine, qrOfferId, onClose, onDirections, onMessage, onProfile, onScan, onPublishOffer, review, onHeight }: Props) {
  const distance = formatDistance(entity.distanceKm);
  const walk = walkText(entity.distanceKm);
  const rating = featuredRating(entity.avg_rating, entity.review_count);
  const sub = [entity.subcategory || entity.category_name, distance, walk].filter(Boolean).join(' · ');
  const status = statusLine(entity);
  const cat = categoryColor(entity.category_color);
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
      style={[styles.sheet, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}
    >
      <View style={styles.card}>
        <View style={styles.statusRow}>
          {status ? <View style={[styles.statusDot, { backgroundColor: status.tone === 'open' ? colors.verified : colors.warning }]} /> : null}
          <Text style={styles.statusText} numberOfLines={1}>
            {status?.text ?? ''}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} hitSlop={4} style={styles.close}>
            <Ionicons name="close" size={18} color={colors.ink} />
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel={`${entity.name}. ${sub}. ${rating.text}. Entrar al negocio`} onPress={() => onProfile()} style={styles.identity}>
          <View style={[styles.photo, { backgroundColor: cat.fg }]}>
            {photo ? (
              <Image accessible={false} source={{ uri: photo }} style={styles.photoImage} contentFit="cover" />
            ) : (
              <Ionicons name={(entity.category_icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap} size={44} color="#fff" />
            )}
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {entity.name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
          <Text style={[styles.rating, !rating.hasScore && styles.ratingMuted]}>{rating.text}</Text>
        </Pressable>

        {quote ? (
          <View style={styles.review} accessible accessibilityLabel={review ? `Reseña: ${review.quote}. ${review.byline}` : quote}>
            <Text style={styles.quote} numberOfLines={2}>
              {review ? review.quote : quote}
            </Text>
          </View>
        ) : null}

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
            onScan ? <SoftButton icon="qr-code-outline" label="Escanear canje" onPress={onScan} /> : null
          ) : (
            <>
              {onMessage ? <SoftButton icon="chatbubble-outline" label="Escribir" onPress={onMessage} /> : null}
              <SoftButton icon="navigate-outline" label="Cómo llegar" onPress={onDirections} />
            </>
          )}
        </View>
      </View>

      {isMine && !onPublishOffer ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={isMine ? onPublishOffer : () => onProfile()}
          style={({ pressed }) => [styles.band, pressed && { backgroundColor: colors.primaryPressed }]}
        >
          <Text style={styles.bandText}>{isMine ? 'Publicar oferta' : 'Entrar al negocio'}</Text>
          <Ionicons name="arrow-forward" size={17} color="#fff" />
        </Pressable>
      )}
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
      <Ionicons name="chevron-forward" size={18} color={hot ? colors.ink : mine ? colors.verified : colors.accentInk} />
      {typeof fraction === 'number' ? (
        <View style={styles.bar}>
          <View style={[styles.barFill, hot && styles.barFillHot, { width: `${Math.round(fraction * 100)}%` }]} />
        </View>
      ) : null}
    </Pressable>
  );
}

const PHOTO = 148;

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  card: {
    zIndex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg + 4,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.ink,
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, marginTop: spacing.xs },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { flex: 1, minWidth: 0, fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  close: { width: 44, height: 44, marginRight: -10, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  identity: { alignItems: 'center', gap: 3 },
  photo: { width: PHOTO, height: PHOTO, marginBottom: spacing.sm, borderRadius: radius.lg + 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoImage: { width: PHOTO, height: PHOTO },
  name: { fontSize: 22, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  sub: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted, textAlign: 'center' },
  rating: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink, textAlign: 'center' },
  ratingMuted: { color: colors.muted, fontFamily: fonts.ui.semibold },
  review: { alignItems: 'center' },
  quote: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, fontStyle: 'italic', color: colors.muted, textAlign: 'center' },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  stripMine: { backgroundColor: colors.verifiedSoft, borderColor: colors.success },
  bolt: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  boltHot: { backgroundColor: colors.ink },
  boltMine: { backgroundColor: colors.success },
  stripText: { flex: 1, minWidth: 0, gap: 1 },
  stripTitle: { fontSize: 14.5, fontFamily: fonts.display.bold, color: colors.ink },
  stripLine: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.accentInk },
  stripLineHot: { color: colors.ink },
  stripLineMine: { color: colors.verified },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(22,35,58,0.1)' },
  barFill: { height: 3, backgroundColor: colors.accentDark },
  barFillHot: { backgroundColor: colors.ink },
  pressed: { opacity: 0.85 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  soft: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  softText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  // La franja asoma por debajo de la tarjeta: es la acción principal.
  band: {
    marginTop: -18,
    marginHorizontal: spacing.md,
    paddingTop: 18,
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    backgroundColor: colors.primary,
    shadowColor: colors.brand,
    shadowOpacity: 0.32,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  bandText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: '#fff' },
});
