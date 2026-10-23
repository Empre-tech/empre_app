import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { categoryColor } from '@/lib/categoryColor';
import { formatDistance } from '@/lib/format';
import { resolveImageUrl } from '@/lib/image';
import { offerUrgency, timeLeftLabel, timeLeftMs } from '@/lib/offer';
import { statusLine, swipeEnters, walkText } from '@/lib/placeCard';
import { featuredRating } from '@/lib/reviewSnippet';
import { useNow } from '@/lib/useNow';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { alpha, colors, fonts, radius, shadow, spacing } from '@/theme';
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
  /** La reseña verificada más reciente, ya en cita y firma; sin ella sale la frase corta del negocio. */
  review?: { quote: string; byline: string };
  /** Alto de la ficha, para que el mapa ponga el negocio en el centro del espacio libre. */
  onHeight?: (height: number) => void;
}

/**
 * Lo que se ve al tocar un negocio en el mapa (maqueta `ficha_negocio_mapa.html`, forma A con el deslizar de B):
 * foto, nombre, categoría con distancia y minutos a pie; nota (desde 3 reseñas) y estado con hora; una frase de
 * reseña; la franja naranja de la oferta (si tiene); y el cierre «¿Quieres saber más?» con «Entrar al negocio» y
 * «Cómo llegar». Ni cantidades de ofertas ni precios. La cabecera, la franja y deslizar la ficha hacia arriba
 * también abren el perfil.
 */
export function BusinessSheet({ entity, isMine, qrOfferId, onClose, onDirections, onProfile, onScan, onPublishOffer, review, onHeight }: Props) {
  const distance = formatDistance(entity.distanceKm);
  const walk = walkText(entity.distanceKm);
  const sub = [entity.subcategory || entity.category_name, distance, walk].filter(Boolean).join(' · ');
  const rating = featuredRating(entity.avg_rating, entity.review_count);
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
      <View style={styles.grab}>
        <View style={styles.handle} />
      </View>
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${entity.name}. ${sub}. Entrar al negocio`}
          onPress={() => onProfile()}
          style={styles.headTap}
        >
          <View style={[styles.photo, { backgroundColor: cat.fg }]}>
            {photo ? (
              <Image accessible={false} source={{ uri: photo }} style={styles.photoImage} contentFit="cover" />
            ) : (
              <Ionicons name={(entity.category_icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap} size={26} color={colors.white} />
            )}
          </View>
          <View style={styles.headText}>
            <Text style={styles.name} numberOfLines={1}>
              {entity.name}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {sub}
            </Text>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} hitSlop={4} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.facts}>
        <View style={[styles.fact, rating.hasScore && styles.factRating]}>
          <Text style={[styles.factText, rating.hasScore ? styles.factRatingText : styles.factMuted]}>{rating.text}</Text>
        </View>
        {status ? (
          <View style={[styles.fact, status.tone === 'open' ? styles.factOpen : styles.factClosed]}>
            <Text style={[styles.factText, status.tone === 'open' ? styles.factOpenText : styles.factClosedText]}>{status.text}</Text>
          </View>
        ) : null}
      </View>

      {quote ? (
        <View style={styles.review} accessible accessibilityLabel={review ? `Reseña: ${review.quote}. ${review.byline}` : quote}>
          <Text style={styles.quote} numberOfLines={2}>
            {review ? review.quote : quote}
          </Text>
          {review ? (
            <Text style={styles.byline} numberOfLines={1}>
              {review.byline}
            </Text>
          ) : null}
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

      {isMine ? null : <Text style={styles.more}>¿Quieres saber más? Entra al negocio.</Text>}
      <View style={styles.actions}>
        {isMine ? (
          <>
            {onPublishOffer ? <Button title="Publicar oferta" onPress={onPublishOffer} style={styles.main} /> : null}
            {onScan ? <Button title="Escanear canje" variant="secondary" onPress={onScan} style={styles.action} /> : null}
          </>
        ) : (
          <>
            <Button title="Entrar al negocio ›" onPress={() => onProfile()} style={styles.main} />
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
        <Ionicons name={mine ? 'qr-code' : 'flash'} size={16} color={hot ? colors.accent : mine ? colors.white : colors.ink} />
      </Animated.View>
      <View style={styles.stripText}>
        <Text style={styles.stripTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.stripLine, hot && styles.stripLineHot, mine && styles.stripLineMine]} numberOfLines={1}>
          {line}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={hot ? colors.ink : mine ? colors.successInk : colors.accentInk} />
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
  // Zona de agarre para deslizar hacia arriba: el asa visible es pequeña, la zona de toque es mayor.
  grab: { minHeight: 24, justifyContent: 'center', marginTop: -spacing.xs },
  handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  headTap: { flex: 1, minWidth: 0, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photo: { width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoImage: { width: 56, height: 56 },
  headText: { flex: 1, minWidth: 0 },
  name: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  sub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.lg },
  fact: { minHeight: 28, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.bg, justifyContent: 'center' },
  factText: { fontSize: 12, fontFamily: fonts.ui.bold },
  factMuted: { color: colors.muted },
  factRating: { backgroundColor: colors.warningSoft },
  factRatingText: { color: colors.warningInk },
  factOpen: { backgroundColor: colors.successSoft },
  factOpenText: { color: colors.successInk },
  factClosed: { backgroundColor: colors.dangerSoft },
  factClosedText: { color: colors.dangerInk },
  review: { marginHorizontal: spacing.lg, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: colors.accent, gap: 2 },
  quote: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, fontStyle: 'italic', color: colors.ink },
  byline: { fontSize: 11.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  more: { paddingHorizontal: spacing.lg, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
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
  stripMine: { backgroundColor: colors.successSoft, borderColor: colors.success },
  bolt: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  boltHot: { backgroundColor: colors.ink },
  boltMine: { backgroundColor: colors.success },
  stripText: { flex: 1, minWidth: 0, gap: 1 },
  stripTitle: { fontSize: 14.5, fontFamily: fonts.display.bold, color: colors.ink },
  stripLine: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.accentInk },
  stripLineHot: { color: colors.ink },
  stripLineMine: { color: colors.successInk },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: alpha(colors.ink, 0.1) },
  barFill: { height: 3, backgroundColor: colors.accentDark },
  barFillHot: { backgroundColor: colors.ink },
  pressed: { opacity: 0.85 },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  main: { flex: 1.4, paddingHorizontal: spacing.sm, minHeight: 46 },
  action: { flex: 1, paddingHorizontal: spacing.sm, minHeight: 46 },
});
