import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { entitiesApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Chispa } from '@/components/ai/Chispa';
import { VoiceSheet } from '@/components/ledger/VoiceSheet';
import { getPhoneFlag } from '@/lib/phoneFlags';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, softShadow } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface QuickAction {
  key: string;
  icon: IconName;
  title: string;
  /** La acción principal: la única en rojo. */
  main?: boolean;
  /** Empre AI: va con la Chispa en vez de un ícono (3.66). */
  ai?: boolean;
  go: () => void;
}

const FADE_MS = 120;
const STAGGER_MS = 32;

/**
 * Acciones rápidas del (+) del centro de la barra: salen del mismo botón, sobre la pantalla oscurecida, y la X queda
 * donde estaba el +. Con negocio, lo de todos los días sin pasar por el perfil; la más usada queda más cerca del pulgar
 * y Empre AI arriba de todo (3.66).
 */
export function QuickActionSheet({ visible, onClose, anchorBottom, anchorX }: { visible: boolean; onClose: () => void; anchorBottom: number; anchorX?: number }) {
  const win = useWindowDimensions();
  const cx = anchorX ?? win.width - SIDE - BUTTON / 2;
  const [voiceFor, setVoiceFor] = useState<string | null>(null);
  const router = useRouter();
  const reduce = useReduceMotion();
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const mine = useQuery({ queryKey: ['my-entities'], queryFn: entitiesApi.mine, enabled: signedIn && visible, staleTime: 60_000 });
  const [savedId, setSavedId] = useState<string | null>(null);
  const [fade] = useState(() => new Animated.Value(0));
  const [rise] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;
    void getPhoneFlag('active-business').then(setSavedId);
    fade.setValue(0);
    rise.setValue(reduce ? 1 : 0);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: FADE_MS, useNativeDriver: true }),
      ...(reduce ? [] : [Animated.spring(rise, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true })]),
    ]).start();
  }, [visible, reduce, fade, rise]);

  // Se cierra por tiempo y no al terminar la animación: así nunca queda abierto si el sistema la detiene.
  const dismiss = (then?: () => void) => {
    Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start();
    setTimeout(() => {
      onClose();
      then?.();
    }, FADE_MS);
  };

  const entities = mine.data ?? [];
  const active = entities.find((e) => e.id === savedId) ?? entities[0] ?? null;
  const params = active ? { id: active.id } : { id: '' };

  // De arriba hacia abajo, tal como se ven.
  const actions: QuickAction[] = active
    ? [
        { key: 'ai', icon: 'sparkles', title: 'Hablar con Empre AI', ai: true, go: () => setVoiceFor(active.id) },
        { key: 'finance', icon: 'wallet-outline', title: 'Finanzas', go: () => router.push({ pathname: '/business/ledger/[id]', params }) },
        { key: 'inventory', icon: 'cube-outline', title: 'Inventario', go: () => router.push({ pathname: '/business/products/[id]', params }) },
        { key: 'scan', icon: 'qr-code-outline', title: 'Canjear oferta', go: () => router.push('/business/scan') },
        { key: 'expense', icon: 'remove', title: 'Registrar gasto', go: () => router.push({ pathname: '/business/ledger/expense/[id]', params }) },
        { key: 'sale', icon: 'add', title: 'Registrar venta', main: true, go: () => router.push({ pathname: '/business/ledger/sale/[id]', params }) },
      ]
    : [
        ...(signedIn
          ? [
              { key: 'create', icon: 'storefront-outline' as IconName, title: 'Poner mi negocio en Empre', go: () => router.push('/business/new') },
              { key: 'salidas', icon: 'ticket-outline' as IconName, title: 'Mis salidas', go: () => router.push('/salidas') },
            ]
          : []),
        { key: 'ask', icon: 'sparkles-outline', title: 'Preguntarle a Empre', main: true, go: () => router.push({ pathname: '/ask', params: { voice: '1' } }) },
      ];

  return (
    <>
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => dismiss()}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar acciones rápidas" onPress={() => dismiss()} style={styles.scrim} />
        <View pointerEvents="box-none" style={[styles.stack, { bottom: anchorBottom + BUTTON + 12, right: Math.max(SIDE, win.width - cx - 27) }]}>
          {active && entities.length > 1 ? (
            <Text style={styles.business} numberOfLines={1}>
              {active.name}
            </Text>
          ) : null}
          {actions.map((a, i) => {
            const fromEnd = actions.length - 1 - i;
            const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [24 + fromEnd * STAGGER_MS * 0.5, 0] });
            return (
              <Animated.View key={a.key} style={{ transform: [{ translateY }] }}>
                <Pressable accessibilityRole="button" accessibilityLabel={a.title} onPress={() => dismiss(a.go)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                  <Text style={styles.label} numberOfLines={1}>
                    {a.title}
                  </Text>
                  <View style={[styles.circle, a.main && styles.circleMain, a.ai && styles.circleAi]}>
                    {a.ai ? <Chispa size={36} animated={false} /> : <Ionicons name={a.icon} size={a.key === 'sale' || a.key === 'expense' ? 24 : 20} color={a.main ? '#fff' : colors.ink} />}
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={() => dismiss()} style={[styles.close, { bottom: anchorBottom, left: cx - BUTTON / 2 }]}>
          <Ionicons name="close" size={24} color={colors.ink} />
        </Pressable>
      </Animated.View>
    </Modal>
    <VoiceSheet entityId={voiceFor ?? ''} visible={voiceFor !== null} onClose={() => setVoiceFor(null)} hints={[]} defaultMode="finance" />
    </>
  );
}

/** Lo que mide el botón (+) de la barra: la X ocupa exactamente su lugar. */
export const BUTTON = 54;
const SIDE = 14;

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11, 21, 38, 0.9)' },
  stack: { position: 'absolute', right: SIDE, left: SIDE, alignItems: 'flex-end', gap: 6 },
  business: { maxWidth: '100%', paddingRight: 3, paddingBottom: 6, fontSize: 12.5, fontFamily: fonts.ui.bold, color: 'rgba(255, 255, 255, 0.72)' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, paddingLeft: 12 },
  pressed: { opacity: 0.75 },
  label: { flexShrink: 1, fontSize: 15.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  circle: { width: 48, height: 48, marginRight: 3, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  circleMain: { backgroundColor: colors.primary },
  circleAi: { backgroundColor: colors.ink },
  close: { position: 'absolute', width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, ...softShadow },
});
