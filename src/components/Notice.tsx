import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, softShadow } from '@/theme';

/**
 * Los avisos de Empre: cuando algo no salió, una tarjeta arriba que dice qué pasó y se va sola, en vez de la alerta del
 * sistema. Las preguntas que piden decidir (como «¿Eliminar?») siguen siendo diálogos.
 */
interface NoticeData {
  id: number;
  title: string;
  body?: string;
}

const SHOW_MS = 6000;
let current: NoticeData | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function publish(next: NoticeData | null) {
  current = next;
  listeners.forEach((l) => l());
}

export function notifyError(title: string, body?: string) {
  publish({ id: nextId++, title, body });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function Card({ notice }: { notice: NoticeData }) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [enter] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) enter.setValue(1);
    else Animated.timing(enter, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const t = setTimeout(() => publish(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [enter, reduce]);
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingTop: insets.top + 8, opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }]}
    >
      <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="alert" size={16} color={colors.danger} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>{notice.title}</Text>
          {notice.body ? <Text style={styles.body}>{notice.body}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar el aviso" onPress={() => publish(null)} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.ink} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

/** Se monta una vez en la raíz. Tiene que verse encima de las hojas abiertas, y cada sistema lo logra distinto. */
export function NoticeHost() {
  const notice = useSyncExternalStore(subscribe, () => current);
  if (!notice) return null;
  const card = <Card key={notice.id} notice={notice} />;
  if (Platform.OS === 'ios') return <FullWindowOverlay>{card}</FullWindowOverlay>;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => publish(null)}>
      <Pressable accessibilityLabel="Cerrar el aviso" onPress={() => publish(null)} style={StyleSheet.absoluteFill} />
      {card}
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 12, right: 12 },
  card: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 14, paddingRight: 4, borderRadius: 20, backgroundColor: colors.surface, ...softShadow, shadowOpacity: 0.22, elevation: 10 },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 14.5, lineHeight: 19, fontFamily: fonts.ui.extrabold, color: colors.ink },
  body: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.muted },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
