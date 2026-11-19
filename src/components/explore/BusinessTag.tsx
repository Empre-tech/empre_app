import { Ionicons } from '@/components/Icon';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Cover } from '@/components/Cover';
import { resolveImageUrl } from '@/lib/image';
import { timeLeftMs } from '@/lib/offer';
import { statusLine, walkText } from '@/lib/placeCard';
import { useNow } from '@/lib/useNow';
import { colors, fonts } from '@/theme';
import type { WithDistance } from './FeaturedCard';

interface Props {
  entity: WithDistance;
  /** Oferta con un QR activo del usuario en este negocio. */
  qrOfferId: string | null;
  /** Entra al perfil; con una oferta, el perfil se abre en ella. */
  onProfile: (offerId?: string) => void;
  onClose: () => void;
  /** Alto de la etiqueta, para que el mapa deje el negocio a la vista. */
  onHeight?: (height: number) => void;
}

/**
 * El negocio al tocarlo en el mapa (2026-11-14): una etiqueta, no una ficha. Foto o dibujo, nombre y una línea con lo
 * que hace falta para decidir (tipo · a pie · abierto hasta). Si tiene oferta o tu QR, una etiqueta pequeña. Tocarla
 * entra al perfil, donde están escribir, la ruta y reservar; tocar el mapa o la ✕ la cierra. Sin botones de más.
 */
export function BusinessTag({ entity, qrOfferId, onProfile, onClose, onHeight }: Props) {
  const insets = useSafeAreaInsets();
  const now = useNow(60_000);
  const status = statusLine(entity);
  const walk = walkText(entity.distanceKm);
  const line = [entity.subcategory || entity.category_name, walk].filter(Boolean).join(' · ');
  const photo = entity.profile_url ? resolveImageUrl(entity.profile_url) : null;
  const offer = entity.has_active_offer && entity.active_offer && timeLeftMs(entity.active_offer.ends_at, now) > 0 ? entity.active_offer : undefined;
  const pill = qrOfferId ? { text: 'Tu QR está activo', mine: true } : offer ? { text: offer.title, mine: false } : null;

  // Entra breve desde abajo; sin movimiento si el sistema lo pide.
  const [enter] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) enter.setValue(1);
        else Animated.timing(enter, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      })
      .catch(() => enter.setValue(1));
    return () => {
      cancelled = true;
    };
  }, [enter, entity.id]);

  return (
    <Animated.View
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}
      style={[styles.wrap, { bottom: insets.bottom + 12, opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[entity.name, line, status?.text, pill?.text, 'Entrar al negocio'].filter(Boolean).join('. ')}
        onPress={() => onProfile(qrOfferId ?? offer?.id)}
        style={({ pressed }) => [styles.tag, pressed && styles.pressed]}
      >
        <Cover photo={photo} category={entity.subcategory || entity.category_name} icon={entity.category_icon} iconName={(entity.category_icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap} iconSize={22} style={styles.photo} />
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={1}>
            {entity.name}
          </Text>
          <Text style={styles.line} numberOfLines={1}>
            {line}
          </Text>
          {status ? (
            <Text style={[styles.status, status.tone === 'open' && styles.statusOpen]} numberOfLines={1}>
              {status.tone === 'open' ? <Text style={styles.openDot}>● </Text> : null}
              {status.text}
            </Text>
          ) : null}
          {pill ? (
            <View style={[styles.pill, pill.mine && styles.pillMine]}>
              <Text style={styles.pillText} numberOfLines={1}>
                {pill.text}
              </Text>
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} hitSlop={6} style={styles.close}>
        <Ionicons name="close" size={16} color={colors.ink} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  tag: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingRight: 14, borderRadius: 20, backgroundColor: colors.surface, shadowColor: '#2B2622', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  photo: { width: 52, height: 52, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 16, lineHeight: 20, fontFamily: fonts.display.semibold, color: colors.ink },
  line: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  status: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  statusOpen: { color: colors.ink },
  openDot: { color: colors.brand, fontSize: 9 },
  pill: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderTopLeftRadius: 3, borderBottomLeftRadius: 3, borderTopRightRadius: 8, borderBottomRightRadius: 8, backgroundColor: colors.accent, maxWidth: '100%' },
  pillMine: { borderRadius: 999, backgroundColor: colors.verifiedSoft },
  pillText: { fontSize: 11.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  close: { position: 'absolute', top: -10, right: -4, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
});
