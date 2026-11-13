import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { entitiesApi } from '@/api/endpoints';
import type { EntityOwnerItem } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { EmpreAISheet } from '@/components/ai/EmpreAISheet';
import { FEATURES } from '@/config';
import { getPhoneFlag, setPhoneFlag } from '@/lib/phoneFlags';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface Item {
  key: string;
  title: string;
  sub: string;
  icon: IconName;
  /** El color va solo en el ícono: gris para lo de siempre, naranja para ofertas, rojo para Empre AI, verde para la plata. */
  tone: 'plain' | 'offer' | 'ai' | 'money';
  /** Lo que pide un negocio: con varios, primero se elige a cuál. */
  forBusiness?: (id: string) => void;
  go?: () => void;
}

const TONE: Record<Item['tone'], { bg: string; ink: string }> = {
  plain: { bg: colors.bg, ink: colors.ink },
  offer: { bg: colors.accentSoft, ink: colors.accentInk },
  ai: { bg: colors.primarySoft, ink: colors.brand },
  money: { bg: colors.financeSoft, ink: colors.finance },
};

export const EMPRE_BUTTON = 60;
const SIDE = 16;
const FADE_MS = 140;

/** El símbolo de Empre en blanco, con su punto naranja (tablero «Dirección clara»). */
function EmpreMark({ size = 34 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Path d="M15 25V18C15 14.686 17.686 12 21 12H47" stroke="#FFFFFF" strokeWidth={7} strokeLinecap="round" />
      <Path d="M15 39V46C15 49.314 17.686 52 21 52H43C46.314 52 49 49.314 49 46V42" stroke="#FFFFFF" strokeWidth={7} strokeLinecap="round" />
      <Rect x={15} y={28.5} width={22} height={7} rx={3.5} fill="#FFFFFF" />
      <Circle cx={45} cy={32} r={6} fill={colors.accent} />
    </Svg>
  );
}

/**
 * El botón Empre (tablero «Dirección clara»): flota a la derecha, encima de la barra, en todas las pestañas.
 * - Con negocio: subir un servicio, crear una oferta, la agenda y Empre AI; junto al botón, anotar un gasto o una venta.
 *   Con varios negocios, cada atajo pregunta «¿En cuál negocio?» y entra directo; con uno solo, ese paso no aparece.
 * - Sin negocio: tus salidas, citas y guardados; donde el dueño anota la plata está Empre AI.
 * Al abrir, lo de atrás se aclara con un velo blanco y el botón se vuelve negro con una X.
 */
export function EmpreButton({ bottom }: { bottom: number }) {
  const router = useRouter();
  const reduce = useReduceMotion();
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const mine = useQuery({ queryKey: ['my-entities'], queryFn: entitiesApi.mine, enabled: signedIn, staleTime: 60_000 });
  const entities = mine.data ?? [];
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [asking, setAsking] = useState<Item | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const [fade] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!open) return;
    void getPhoneFlag('active-business').then(setLastId);
    fade.setValue(reduce ? 1 : 0);
    if (!reduce) Animated.timing(fade, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
  }, [open, reduce, fade]);

  const close = (then?: () => void) => {
    if (reduce) {
      setOpen(false);
      setAsking(null);
      then?.();
      return;
    }
    Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start();
    // Se cierra por tiempo y no al terminar la animación: nunca queda abierto si el sistema la detiene.
    setTimeout(() => {
      setOpen(false);
      setAsking(null);
      then?.();
    }, FADE_MS);
  };

  const inBusiness = (id: string, fn: (id: string) => void) => {
    void setPhoneFlag('active-business', id);
    close(() => fn(id));
  };

  const run = (item: Item) => {
    if (item.go) return close(item.go);
    if (!item.forBusiness) return;
    if (entities.length === 1) return inBusiness(entities[0].id, item.forBusiness);
    setAsking(item);
  };

  const one = entities.length === 1 ? entities[0].name : null;
  const ai: Item = { key: 'ai', title: 'Pregúntale a Empre AI', sub: entities.length ? 'Te responde al instante' : 'Escribe o habla', icon: 'sparkles-outline', tone: 'ai', go: () => setAiOpen(true) };

  // De arriba hacia abajo, como se ven: lo de la plata queda junto al botón, donde llega el pulgar.
  const items: Item[] = entities.length
    ? [
        { key: 'service', title: 'Subir un servicio', sub: 'Con foto, en 1 min', icon: 'camera-outline', tone: 'plain', forBusiness: (id) => router.push({ pathname: '/business/products/item', params: { entityId: id } }) },
        { key: 'offer', title: 'Crear una oferta', sub: 'Sale en Ofertas al instante', icon: 'pricetag-outline', tone: 'offer', forBusiness: (id) => router.push({ pathname: '/business/offers/new', params: { entityId: id } }) },
        ...(FEATURES.agenda
          ? [{ key: 'agenda', title: 'Tu agenda', sub: 'Citas y horas libres', icon: 'calendar-outline' as IconName, tone: 'plain' as const, forBusiness: (id: string) => router.push({ pathname: '/business/agenda/[id]', params: { id } }) }]
          : []),
        ai,
        { key: 'expense', title: 'Anotar un gasto', sub: one ? `En ${one}` : 'Eliges el negocio al tocar', icon: 'remove', tone: 'money', forBusiness: (id) => router.push({ pathname: '/business/ledger/expense/[id]', params: { id } }) },
        { key: 'sale', title: 'Anotar una venta', sub: one ? `En ${one}` : 'Eliges el negocio al tocar', icon: 'add', tone: 'money', forBusiness: (id) => router.push({ pathname: '/business/ledger/sale/[id]', params: { id } }) },
      ]
    : [
        ...(signedIn
          ? [
              { key: 'salidas', title: 'Mis salidas', sub: 'Las ofertas que guardaste', icon: 'ticket-outline' as IconName, tone: 'plain' as const, go: () => router.push('/salidas') },
              { key: 'citas', title: 'Mis citas', sub: 'Las que pediste', icon: 'calendar-outline' as IconName, tone: 'plain' as const, go: () => router.push('/appointments') },
              { key: 'saved', title: 'Guardados', sub: 'Los negocios que te gustan', icon: 'bookmark-outline' as IconName, tone: 'plain' as const, go: () => router.push('/favorites') },
            ]
          : []),
        ai,
      ];

  // El último negocio que usaste va primero y se marca como sugerido.
  const ordered: EntityOwnerItem[] = [...entities].sort((a, b) => Number(b.id === lastId) - Number(a.id === lastId));

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={entities.length ? 'Empre: anotar una venta o un gasto, Empre AI y más' : 'Empre: Empre AI, tus salidas y tus citas'}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.fab, { bottom }, pressed && styles.pressed]}
      >
        <EmpreMark />
      </Pressable>

      <Modal visible={open} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => (asking ? setAsking(null) : close())}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          {/* Velo blanco: lo de atrás se aclara, no se oscurece. */}
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar el menú de Empre" onPress={() => close()} style={styles.veil} />

          {asking ? (
            <View accessibilityViewIsModal style={[styles.picker, { bottom: bottom + EMPRE_BUTTON + 10 }]}>
              <View style={styles.pickerHead}>
                <Pressable accessibilityRole="button" accessibilityLabel="Volver al menú" onPress={() => setAsking(null)} style={styles.back}>
                  <Ionicons name="chevron-back" size={20} color={colors.ink} />
                </Pressable>
                <View style={[styles.iconDot, { backgroundColor: TONE[asking.tone].bg }]}>
                  <Ionicons name={asking.icon} size={18} color={TONE[asking.tone].ink} />
                </View>
                <View style={styles.texts}>
                  <Text style={styles.title} numberOfLines={1}>
                    {asking.title}
                  </Text>
                  <Text style={styles.sub}>¿En cuál negocio?</Text>
                </View>
              </View>
              {ordered.map((e) => {
                const suggested = e.id === lastId;
                return (
                  <Pressable
                    key={e.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${asking.title} en ${e.name}${suggested ? ', el último que usaste' : ''}`}
                    onPress={() => asking.forBusiness && inBusiness(e.id, asking.forBusiness)}
                    style={({ pressed }) => [styles.bizRow, suggested && styles.bizRowOn, pressed && styles.pressed]}
                  >
                    {e.profile_url ? (
                      <Avatar uri={e.profile_url} name={e.name} size={44} />
                    ) : (
                      <View style={styles.bizIcon}>
                        <Ionicons name="storefront-outline" size={20} color={colors.ink} />
                      </View>
                    )}
                    <View style={styles.texts}>
                      <Text style={styles.title} numberOfLines={1}>
                        {e.name}
                      </Text>
                      <Text style={styles.sub} numberOfLines={1}>
                        {suggested ? 'El último que usaste' : e.category_name}
                      </Text>
                    </View>
                    {suggested ? (
                      <View style={styles.tag}>
                        <Text style={styles.tagText}>Sugerido</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View accessibilityRole="menu" style={[styles.menu, { bottom: bottom + EMPRE_BUTTON + 10 }]}>
              {items.map((it) => (
                <Pressable
                  key={it.key}
                  accessibilityRole="menuitem"
                  accessibilityLabel={`${it.title}. ${it.sub}`}
                  onPress={() => run(it)}
                  style={({ pressed }) => [styles.item, it.key === 'ai' && !entities.length && styles.itemAi, pressed && styles.pressed]}
                >
                  <View style={[styles.iconDot, { backgroundColor: TONE[it.tone].bg }]}>
                    <Ionicons name={it.icon} size={18} color={TONE[it.tone].ink} />
                  </View>
                  <View style={styles.texts}>
                    <Text style={styles.title} numberOfLines={1}>
                      {it.title}
                    </Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {it.sub}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {/* El botón abierto: el logo se vuelve una X en el mismo lugar. */}
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar el menú de Empre" onPress={() => close()} style={[styles.fab, styles.fabOpen, { bottom }]}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
      </Modal>

      <EmpreAISheet visible={aiOpen} onClose={() => setAiOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: SIDE,
    width: EMPRE_BUTTON,
    height: EMPRE_BUTTON,
    borderRadius: EMPRE_BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
    shadowColor: colors.brand,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  fabOpen: { backgroundColor: colors.ink, shadowColor: colors.ink, shadowOpacity: 0.25 },
  pressed: { opacity: 0.8 },
  veil: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(255,255,255,0.86)' },
  menu: { position: 'absolute', right: SIDE, left: SIDE, alignItems: 'flex-end', gap: 8 },
  item: {
    minHeight: 48,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  itemAi: { marginTop: 6, minHeight: 56 },
  iconDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  texts: { flexShrink: 1, minWidth: 0 },
  title: { fontSize: 15, lineHeight: 18, fontFamily: fonts.ui.bold, color: colors.ink },
  sub: { fontSize: 12, lineHeight: 16, fontFamily: fonts.ui.medium, color: colors.muted },
  picker: {
    position: 'absolute',
    left: SIDE,
    right: SIDE,
    padding: 8,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: colors.ink,
    shadowOpacity: 0.16,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  pickerHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, paddingTop: 6, paddingBottom: 10 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  bizRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 16 },
  bizRowOn: { backgroundColor: colors.bg },
  bizIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  tag: { marginLeft: 'auto', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: colors.ink },
  tagText: { fontSize: 12, fontFamily: fonts.ui.medium, color: '#FFFFFF' },
});
