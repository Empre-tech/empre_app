import { CrownIcon, Ionicons } from '@/components/Icon';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { entitiesApi } from '@/api/endpoints';
import type { EntityOwnerItem } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { EmpreAISheet } from '@/components/ai/EmpreAISheet';
import { VoiceSheet } from '@/components/ledger/VoiceSheet';
import { GoProSheet } from '@/components/pro/GoProSheet';
import { LOCKED_OPACITY, ProTag } from '@/components/pro/ProTag';
import { FEATURES } from '@/config';
import { getPhoneFlag, setPhoneFlag } from '@/lib/phoneFlags';
import { PRO_PRICE_AMOUNT } from '@/lib/proPlan';
import type { AssistantModule } from '@/lib/assistantRoute';
import { usePlans } from '@/lib/useProPlan';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';

const MARK = require('../../assets/brand/empre-mark.png');

type IconName = keyof typeof Ionicons.glyphMap;

interface Item {
  key: string;
  title: string;
  /** La línea de abajo: solo cuando dice algo que el título no dice (el precio, la sección que toca contar). */
  sub?: string;
  icon: IconName | 'crown';
  /** El color va solo en el ícono: gris para lo de siempre, naranja para ofertas, rojo para Empre AI, verde para la plata, arena para Pro. */
  tone: 'plain' | 'offer' | 'ai' | 'money' | 'pro';
  /** Lo que pide un negocio: con varios, primero se elige a cuál. */
  forBusiness?: (id: string) => void;
  go?: () => void;
  /** Es de Empre Pro y aquí todo está en Base: se ve en gris con la corona y abre «Pásate a Empre Pro». */
  locked?: boolean;
  /** Es de Empre Pro: al elegir negocio, los que están en Base llevan la corona. */
  proOnly?: boolean;
}

const TONE: Record<Item['tone'], { bg: string; ink: string }> = {
  plain: { bg: colors.well, ink: colors.ink },
  offer: { bg: colors.accentSoft, ink: colors.accentInk },
  ai: { bg: colors.primarySoft, ink: colors.brand },
  money: { bg: colors.financeSoft, ink: colors.finance },
  pro: { bg: colors.sand, ink: colors.ink },
};

/** Lo de la pantalla donde estás: va primero en el menú, junto al botón, bajo su nombre («En Inventario»). */
export interface EmpreHere {
  label: string;
  items: { key: string; title: string; sub?: string; icon: IconName; tone: Item['tone']; onPress: () => void; locked?: boolean }[];
  /** «Habla con Empre AI» desde esta pantalla, con lo que ella sabe (en Inventario: los nombres y modo inventario). */
  onTalk?: () => void;
}

function ItemIcon({ icon, tone }: { icon: Item['icon']; tone: Item['tone'] }) {
  const t = TONE[tone];
  return (
    <View style={[styles.iconDot, { backgroundColor: t.bg }]}>
      {icon === 'crown' ? <CrownIcon size={18} color={t.ink} /> : <Ionicons name={icon} size={18} color={t.ink} />}
    </View>
  );
}

/** Un ítem del menú. Bloqueado (Base): el contenido en gris y la corona de Pro a la derecha; sigue tocándose. */
function MenuItem({ it, onPress, big }: { it: Pick<Item, 'key' | 'title' | 'sub' | 'icon' | 'tone' | 'locked'>; onPress: () => void; big?: boolean }) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={`${it.title}${it.sub ? `. ${it.sub}` : ''}${it.locked ? '. Es de Empre Pro' : ''}`}
      accessibilityHint={it.locked ? 'Abre Pásate a Empre Pro' : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.item, big && styles.itemAi, it.tone === 'pro' && styles.itemPro, it.locked && styles.itemLocked, pressed && styles.pressed]}
    >
      <View style={[styles.itemBody, it.locked && { opacity: LOCKED_OPACITY }]}>
        <ItemIcon icon={it.icon} tone={it.locked ? 'plain' : it.tone} />
        <View style={styles.texts}>
          <Text style={styles.title} numberOfLines={1}>
            {it.title}
          </Text>
          {it.sub ? (
            <Text style={styles.sub} numberOfLines={1}>
              {it.sub}
            </Text>
          ) : null}
        </View>
      </View>
      {it.locked ? <ProTag /> : null}
    </Pressable>
  );
}

export const EMPRE_BUTTON = 60;
/** En la barra de una pantalla del negocio el botón es un poco más chico (junto a «Nuevo producto»). */
export const EMPRE_BUTTON_INLINE = 52;
const SIDE = 16;
const FADE_MS = 140;
const FOLLOW_MS = 80;

/** El símbolo de Empre (blanco o negro, nunca rojo), con su punto naranja (tablero «Dirección clara»). */
/**
 * El logo de Empre (2026-11-14): la casa con la «e» calada, sacada del ícono que compartió el usuario (PNG blanco con
 * la «e» transparente). Se tiñe con `color`: blanco sobre rojo, tinta sobre claro; nunca en rojo. Cuando llegue el
 * archivo original, se cambia solo `assets/brand/empre-mark.png`.
 */
export function EmpreMark({ size = 34, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return <Image source={MARK} style={{ width: size, height: size }} contentFit="contain" tintColor={color} accessible={false} />;
}

/**
 * El botón Empre (tablero «Dirección clara»): flota a la derecha, encima de la barra, en todas las pestañas.
 * - Con negocio: subir un servicio, crear una oferta, la agenda y Empre AI; junto al botón, anotar un gasto o una venta.
 *   Con varios negocios, cada atajo pregunta «¿En cuál negocio?» y entra directo; con uno solo, ese paso no aparece.
 * - Sin negocio: tus salidas, citas y guardados; donde el dueño anota la plata está Empre AI.
 * Al abrir, lo de atrás se aclara con un velo blanco y el botón muestra una X.
 * 2026-11-16: el botón va lleno del rojo de referencia (#FF1D25) con el logo en blanco: es la marca, como el ícono de
 * la app (el blanco solo va sobre ese rojo). La sombra es suave y en tinta, sin brillo rojo.
 */
export function EmpreButton({
  bottom,
  inline,
  entityId: givenId,
  here,
  onOpen,
  module = 'none',
}: {
  /** Desde el borde de abajo de la pantalla hasta el botón (flotando) o hasta donde queda en la barra (en línea). */
  bottom: number;
  /** En la barra de abajo de una pantalla del negocio: no flota (no tapa filas) y el menú sale desde ahí. */
  inline?: boolean;
  /** El negocio de esta pantalla: los atajos van directo a él, sin preguntar cuál. */
  entityId?: string;
  /** Lo de esta pantalla, primero y junto al botón (tablero «Inventario», teléfono 15). */
  here?: EmpreHere;
  /** Al abrir el menú (para pedir, solo entonces, lo que el menú muestra: lo usado de Empre AI). */
  onOpen?: () => void;
  /** Dónde se abre «Habla con Empre AI» desde este botón (en Finance, «En Finance»); por defecto, el negocio. */
  module?: AssistantModule;
}) {
  const size = inline ? EMPRE_BUTTON_INLINE : EMPRE_BUTTON;
  const router = useRouter();
  const reduce = useReduceMotion();
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const mine = useQuery({ queryKey: ['my-entities'], queryFn: entitiesApi.mine, enabled: signedIn, staleTime: 60_000 });
  const entities = mine.data ?? [];
  // Solo un negocio tuyo: en la página de otro negocio (sus reseñas, sus fotos) el menú es el de siempre.
  const entityId = givenId && entities.some((e) => e.id === givenId) ? givenId : undefined;
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [asking, setAsking] = useState<Item | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const [voiceFor, setVoiceFor] = useState<string | null>(null);
  const [goPro, setGoPro] = useState<{ id: string; name: string }[] | null>(null);
  const [fade] = useState(() => new Animated.Value(0));

  // Empre Pro va por negocio: el de esta pantalla, o todos los tuyos. Mientras no se sabe, nada sale cerrado.
  const planIds = entityId ? [entityId] : entities.map((e) => e.id);
  const plans = usePlans(planIds, signedIn && entities.length > 0);
  const isBase = (id: string) => plans.known && !plans.proIds.includes(id);
  const baseBusinesses = entities.filter((e) => planIds.includes(e.id) && isBase(e.id)).map((e) => ({ id: e.id, name: e.name }));
  const offerPro = (id?: string) => {
    const only = id ? baseBusinesses.filter((b) => b.id === id) : [];
    setGoPro(only.length ? only : baseBusinesses);
  };

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
      if (then) setTimeout(then, FOLLOW_MS);
      return;
    }
    Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start();
    // Se cierra por tiempo y no al terminar la animación: nunca queda abierto si el sistema la detiene. Lo que sigue va
    // un momento después: en Android una hoja (Modal) no se abre en el mismo instante en que se cierra el menú.
    setTimeout(() => {
      setOpen(false);
      setAsking(null);
      if (then) setTimeout(then, FOLLOW_MS);
    }, FADE_MS);
  };

  const inBusiness = (id: string, fn: (id: string) => void) => {
    void setPhoneFlag('active-business', id);
    close(() => fn(id));
  };

  const run = (item: Item) => {
    if (item.locked) return close(() => offerPro(entityId ?? (entities.length === 1 ? entities[0].id : undefined)));
    if (item.go) return close(item.go);
    if (!item.forBusiness) return;
    if (entityId) return inBusiness(entityId, item.forBusiness);
    if (entities.length === 1) return inBusiness(entities[0].id, item.forBusiness);
    setAsking(item);
  };

  // Tablero «Base y Empre Pro»: una sola entrada de Empre AI. El dueño habla y Empre entiende si es venta, gasto o
  // inventario (siempre muestra antes de guardar). Es de Pro: en Base se ve en gris con la corona.
  const allBase = plans.known && plans.proIds.length === 0;
  const talk: Item = {
    key: 'ai',
    title: 'Habla con Empre AI',
    icon: 'sparkles-outline',
    tone: 'ai',
    locked: allBase,
    proOnly: true,
    forBusiness: (id) => (isBase(id) ? offerPro(id) : id === entityId && here?.onTalk ? here.onTalk() : setVoiceFor(id)),
  };
  // Para quien no tiene negocio sigue abierta mientras no exista un plan para clientes (el Pro de hoy va por negocio).
  const ask: Item = { key: 'ai', title: 'Buscar con Empre AI', icon: 'sparkles-outline', tone: 'ai', go: () => setAiOpen(true) };
  const goProItem: Item[] = allBase
    ? [{ key: 'pro', title: 'Pásate a Empre Pro', sub: `Empre AI, Finance completo y más · ${PRO_PRICE_AMOUNT} al mes`, icon: 'crown', tone: 'pro', go: () => offerPro(entityId) }]
    : [];
  const expense: Item = { key: 'expense', title: 'Anotar un gasto', icon: 'remove', tone: 'money', forBusiness: (id) => router.push({ pathname: '/business/ledger/expense/[id]', params: { id } }) };
  const sale: Item = { key: 'sale', title: 'Anotar una venta', icon: 'add', tone: 'money', forBusiness: (id) => router.push({ pathname: '/business/ledger/sale/[id]', params: { id } }) };
  const offer: Item = { key: 'offer', title: 'Crear una oferta', icon: 'pricetag-outline', tone: 'offer', forBusiness: (id) => router.push({ pathname: '/business/offers/new', params: { entityId: id } }) };

  // De arriba hacia abajo, como se ven: «Pásate a Empre Pro» arriba (solo en Base) y lo de la plata junto al botón,
  // donde llega el pulgar. En una pantalla del negocio, lo de esa pantalla va todavía más cerca (debajo de todo).
  const items: Item[] = here
    ? entities.length
      ? [...goProItem, offer, talk, expense, sale]
      : []
    : entities.length
    ? [
        ...goProItem,
        { key: 'service', title: 'Subir un servicio', icon: 'camera-outline', tone: 'plain', forBusiness: (id) => router.push({ pathname: '/business/products/item', params: { entityId: id } }) },
        offer,
        ...(FEATURES.agenda
          ? [
              {
                key: 'agenda',
                title: 'Tu agenda',
                icon: 'calendar-outline' as IconName,
                tone: 'plain' as const,
                locked: allBase,
                proOnly: true,
                forBusiness: (id: string) => (isBase(id) ? offerPro(id) : router.push({ pathname: '/business/agenda/[id]', params: { id } })),
              },
            ]
          : []),
        talk,
        expense,
        sale,
      ]
    : [
        ...(signedIn
          ? [
              { key: 'vuelta', title: 'Armar una vuelta', icon: 'walk-outline' as IconName, tone: 'plain' as const, go: () => router.push('/vuelta') },
              { key: 'salidas', title: 'Mis salidas', icon: 'ticket-outline' as IconName, tone: 'plain' as const, go: () => router.push('/salidas') },
              { key: 'citas', title: 'Mis citas', icon: 'calendar-outline' as IconName, tone: 'plain' as const, go: () => router.push('/appointments') },
              { key: 'saved', title: 'Guardados', icon: 'bookmark-outline' as IconName, tone: 'plain' as const, go: () => router.push('/favorites') },
            ]
          : []),
        ask,
      ];

  // El último negocio que usaste va primero y se marca como sugerido.
  const ordered: EntityOwnerItem[] = [...entities].sort((a, b) => Number(b.id === lastId) - Number(a.id === lastId));

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={entities.length ? 'Empre: anotar una venta o un gasto, Empre AI y más' : 'Empre: Empre AI, tus salidas y tus citas'}
        onPress={() => {
          onOpen?.();
          setOpen(true);
        }}
        style={({ pressed }) => [inline ? styles.fabInline : styles.fab, !inline && { bottom }, { width: size, height: size, borderRadius: size / 2 }, pressed && styles.pressed]}
      >
        <EmpreMark color="#FFFFFF" size={inline ? 30 : 34} />
      </Pressable>

      <Modal visible={open} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => (asking ? setAsking(null) : close())}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          {/* Velo blanco: lo de atrás se desvanece (no se oscurece) para que el menú se lea solo, sin interferencias. */}
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar el menú de Empre" onPress={() => close()} style={styles.veil} />

          {asking ? (
            <View accessibilityViewIsModal style={[styles.picker, { bottom: bottom + size + 10 }]}>
              <View style={styles.pickerHead}>
                <Pressable accessibilityRole="button" accessibilityLabel="Volver al menú" onPress={() => setAsking(null)} style={styles.back}>
                  <Ionicons name="chevron-back" size={20} color={colors.ink} />
                </Pressable>
                <ItemIcon icon={asking.icon} tone={asking.tone} />
                <View style={styles.texts}>
                  <Text style={styles.title} numberOfLines={1}>
                    {asking.title}
                  </Text>
                  <Text style={styles.sub}>¿En cuál negocio?</Text>
                </View>
              </View>
              {ordered.map((e) => {
                const suggested = e.id === lastId;
                const base = Boolean(asking.proOnly) && isBase(e.id);
                return (
                  <Pressable
                    key={e.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${asking.title} en ${e.name}${base ? '. Está en Base: es de Empre Pro' : suggested ? ', el último que usaste' : ''}`}
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
                    {base ? (
                      <View style={styles.tagEnd}>
                        <ProTag />
                      </View>
                    ) : suggested ? (
                      <View style={styles.tag}>
                        <Text style={styles.tagText}>Sugerido</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View accessibilityRole="menu" style={[styles.menu, { bottom: bottom + size + 10 }]}>
              {items.map((it) => (
                <MenuItem key={it.key} it={it} big={it.key === 'ai' && !entities.length} onPress={() => run(it)} />
              ))}
              {here && here.items.length > 0 ? (
                <>
                  <Text style={styles.hereLabel}>{here.label}</Text>
                  {here.items.map((it) => (
                    <MenuItem key={it.key} it={it} onPress={() => close(it.locked ? () => offerPro(entityId) : it.onPress)} />
                  ))}
                </>
              ) : null}
            </View>
          )}

          {/* El botón abierto: el logo se vuelve una X en el mismo lugar. */}
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar el menú de Empre" onPress={() => close()} style={[styles.fab, styles.fabOpen, { bottom, width: size, height: size, borderRadius: size / 2 }]}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
      </Modal>

      <EmpreAISheet visible={aiOpen} onClose={() => setAiOpen(false)} />
      {voiceFor ? <VoiceSheet entityId={voiceFor} visible onClose={() => setVoiceFor(null)} hints={[]} module={module} /> : null}
      <GoProSheet visible={goPro !== null} onClose={() => setGoPro(null)} businesses={goPro ?? []} />
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
    backgroundColor: colors.brandRef,
    shadowColor: colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabOpen: { shadowOpacity: 0.22 },
  // En la barra de una pantalla del negocio: en línea, a la derecha de «Nuevo producto».
  fabInline: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandRef,
    shadowColor: colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  // El nombre de la pantalla («En Inventario») con su propio fondo: se lee aunque detrás haya una lista.
  hereLabel: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    fontSize: 12,
    fontFamily: fonts.ui.semibold,
    color: colors.muted,
  },
  pressed: { opacity: 0.8 },
  // Velo blanco al 88 % (usuario, 2026-11-17; tablero «Base y Empre Pro»): lo de atrás se desvanece y no compite con
  // el menú, que se lee solo. Entra con el mismo fundido del menú.
  veil: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(255,255,255,0.88)' },
  menu: { position: 'absolute', right: SIDE, left: SIDE, alignItems: 'flex-end', gap: 8 },
  itemBody: { flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Lo de Pro en Base: sobre arena clara, sin sombra que lo haga parecer activo.
  itemLocked: { backgroundColor: colors.well, shadowOpacity: 0.06, elevation: 1 },
  // «Pásate a Empre Pro»: el único ítem con el aro rojo, como los botones con texto.
  itemPro: { minHeight: 52, borderWidth: 2, borderColor: colors.brandRef },
  tagEnd: { marginLeft: 'auto' },
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
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.well },
  bizRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 16 },
  bizRowOn: { backgroundColor: colors.well },
  bizIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.well },
  tag: { marginLeft: 'auto', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: colors.sand },
  tagText: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.ink },
});
