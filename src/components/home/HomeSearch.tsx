import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { forwardRef, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { askApi, type AskItem } from '@/api/ask';
import type { DiscoveryItem } from '@/api/types';
import { Ionicons } from '@/components/Icon';
import { CategoryIllustration } from '@/components/CategoryIllustration';
import { hourIdeas } from '@/lib/askChips';
import { formatPesos } from '@/lib/catalog';
import { hourCO } from '@/lib/finance';
import { onFootOrDistance } from '@/lib/format';
import { resolveImageUrl } from '@/lib/image';
import type { ArtKey } from '@/components/CategoryArt';
import { addRecent, loadRecents, saveRecents } from '@/lib/searchRecents';
import { colors, fonts, radius, spacing } from '@/theme';

export interface HomeCat {
  key: ArtKey;
  label: string;
  ids: string;
  count: number;
}

const plain = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * La barra de buscar del inicio (2026-11-22): ya no lleva al mapa. Al tocarla, el inicio muestra lo reciente, lo
 * sugerido para la hora y las categorías; al escribir o elegir una categoría, filtra lo del inicio y trae los
 * productos y servicios que coinciden (búsqueda por palabras, sin IA ni cupo).
 */
export const HomeSearchBar = forwardRef<TextInput, {
  value: string;
  active: boolean;
  onChange: (v: string) => void;
  onFocus: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}>(function HomeSearchBar({ value, active, onChange, onFocus, onSubmit, onCancel }, ref) {
  const router = useRouter();
  return (
    <View style={styles.barRow}>
      <View style={[styles.bar, active && styles.barActive]}>
        <Ionicons name="search" size={20} color={colors.ink} />
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChange}
          onFocus={onFocus}
          onSubmitEditing={onSubmit}
          placeholder="Busca negocios, cortes, almuerzos…"
          placeholderTextColor={colors.placeholder}
          returnKeyType="search"
          autoCorrect={false}
          maxLength={80}
          style={styles.input}
          accessibilityLabel="Buscar en el inicio"
        />
        {value ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Borrar" onPress={() => onChange('')} hitSlop={6} style={styles.iconBtn}>
            <Ionicons name="close" size={18} color={colors.ink} />
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Preguntarle a Empre AI hablando" onPress={() => router.push({ pathname: '/ask', params: { voice: '1' } })} hitSlop={4} style={styles.mic}>
            <Ionicons name="mic-outline" size={17} color={colors.onPrimary} />
          </Pressable>
        )}
      </View>
      {active ? (
        <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={6} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

export function HomeSearchPanel({
  query,
  cat,
  cats,
  discovery,
  center,
  onQuery,
  onCat,
  onOpenBusiness,
}: {
  query: string;
  cat: HomeCat | null;
  cats: HomeCat[];
  discovery: DiscoveryItem[];
  center: { latitude: number; longitude: number } | null;
  onQuery: (q: string) => void;
  onCat: (c: HomeCat | null) => void;
  onOpenBusiness: (b: DiscoveryItem) => void;
}) {
  const router = useRouter();
  const [recents, setRecents] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  useEffect(() => {
    void loadRecents().then(setRecents);
  }, []);
  // Se busca cuando dejas de escribir un momento, no con cada letra.
  useEffect(() => {
    const t = setTimeout(() => setTyped(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const term = typed || cat?.label || '';
  const items = useQuery({
    queryKey: ['home-search', term, center?.latitude.toFixed(3), center?.longitude.toFixed(3)],
    queryFn: () => askApi.ask({ q: term, ai: false, ...(center ? { lat: center.latitude, long: center.longitude } : {}) }),
    enabled: term.length >= 2,
    staleTime: 60_000,
  });

  const businesses = useMemo(() => {
    const ids = cat ? new Set(cat.ids.split(',')) : null;
    const q = plain(typed);
    const local = discovery.filter((b) => (!ids || ids.has(b.category_id)) && (!q || plain(`${b.name} ${b.category_name ?? ''} ${b.subcategory ?? ''} ${b.tagline ?? ''}`).includes(q)));
    const fromAsk = (items.data?.businesses ?? []).map((a) => a.id);
    const extra = discovery.filter((b) => fromAsk.includes(b.id) && !local.some((l) => l.id === b.id) && (!ids || ids.has(b.category_id)));
    return [...local, ...extra].slice(0, 12);
  }, [discovery, cat, typed, items.data]);

  const remember = (q: string) => {
    const next = addRecent(recents, q);
    setRecents(next);
    saveRecents(next);
  };

  const filtering = Boolean(term);
  if (!filtering) {
    const ideas = hourIdeas(hourCO(new Date().toISOString()));
    return (
      <View style={styles.panel}>
        {recents.length ? (
          <View style={styles.group}>
            <View style={styles.groupHead}>
              <Text style={styles.eyebrow}>RECIENTES</Text>
              <Pressable accessibilityRole="button" onPress={() => { setRecents([]); saveRecents([]); }} hitSlop={6}>
                <Text style={styles.link}>Borrar</Text>
              </Pressable>
            </View>
            {recents.slice(0, 5).map((r) => (
              <Pressable key={r} accessibilityRole="button" onPress={() => onQuery(r)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <Ionicons name="time-outline" size={18} color={colors.muted} />
                <Text style={styles.rowText} numberOfLines={1}>{r}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.group}>
          <Text style={styles.eyebrow}>SUGERIDOS PARA ESTA HORA</Text>
          <View style={styles.chips}>
            {ideas.map((i) => (
              <Pressable key={i.ask} accessibilityRole="button" onPress={() => { remember(i.ask); onQuery(i.ask); }} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                <Ionicons name={i.icon} size={16} color={colors.ink} />
                <Text style={styles.chipText}>{i.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        {cats.length ? (
          <View style={styles.group}>
            <Text style={styles.eyebrow}>CATEGORÍAS</Text>
            <View style={styles.chips}>
              {cats.map((c) => (
                <Pressable key={c.key} accessibilityRole="button" accessibilityLabel={`${c.label}, ${c.count} cerca`} onPress={() => onCat(c)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                  <CategoryIllustration k={c.key} size={22} />
                  <Text style={styles.chipText}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  const list = items.data?.items ?? [];
  return (
    <View style={styles.panel}>
      {cat ? (
        <View style={styles.chips}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${cat.label}`} onPress={() => onCat(null)} style={[styles.chip, styles.chipOn]}>
            <Text style={[styles.chipText, styles.chipTextOn]}>{cat.label}</Text>
            <Ionicons name="close" size={14} color={colors.onPrimary} />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.group}>
        <Text style={styles.eyebrow}>PRODUCTOS Y SERVICIOS</Text>
        {items.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} /> : null}
        {!items.isLoading && !list.length ? <Text style={styles.empty}>No encontramos productos ni servicios con «{term}».</Text> : null}
        {list.slice(0, 12).map((it) => (
          <ItemRow key={it.id} it={it} onPress={() => { if (typed) remember(typed); router.push({ pathname: '/business/product', params: { entityId: it.entity_id, itemId: it.id } }); }} />
        ))}
      </View>
      <View style={styles.group}>
        <Text style={styles.eyebrow}>NEGOCIOS</Text>
        {!businesses.length ? <Text style={styles.empty}>Ningún negocio cerca coincide.</Text> : null}
        {businesses.map((b) => (
          <Pressable key={b.id} accessibilityRole="button" onPress={() => { if (typed) remember(typed); onOpenBusiness(b); }} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <View style={styles.thumb}>
              {b.profile_url ? <Image source={{ uri: resolveImageUrl(b.profile_url) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} /> : <Ionicons name="storefront-outline" size={18} color={colors.ink} />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{b.name}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {[b.category_name, b.distance_meters != null ? onFootOrDistance(b.distance_meters / 1000) : null, b.is_open_now ? 'Abierto' : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.placeholder} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ItemRow({ it, onPress }: { it: AskItem; onPress: () => void }) {
  const photo = it.photo ? resolveImageUrl(it.photo) : null;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.thumb}>
        {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} /> : <Ionicons name="pricetag-outline" size={18} color={colors.ink} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{it.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{[it.entity_name, it.minutes ? `a ${it.minutes} min` : null].filter(Boolean).join(' · ')}</Text>
      </View>
      {it.price != null ? <Text style={styles.price}>{`${it.price_from ? 'Desde ' : ''}${formatPesos(it.price)}`}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bar: { flex: 1, minWidth: 0, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 6, borderRadius: 25, backgroundColor: colors.well, borderWidth: 1, borderColor: colors.line },
  barActive: { borderColor: colors.ink, borderWidth: 1.5, backgroundColor: colors.bg },
  input: { flex: 1, minWidth: 0, fontSize: 15.5, fontFamily: fonts.ui.medium, color: colors.ink, paddingVertical: 10 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  mic: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  cancel: { paddingVertical: 8, paddingHorizontal: 4 },
  cancelText: { fontSize: 14.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  panel: { gap: spacing.lg, paddingTop: spacing.md },
  group: { gap: 6 },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 11.5, letterSpacing: 0.6, fontFamily: fonts.ui.bold, color: colors.muted },
  link: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.primaryDark },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  rowText: { flex: 1, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink },
  rowTitle: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  rowSub: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  price: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.well },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  chipTextOn: { color: colors.onPrimary },
  empty: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted, paddingVertical: 6 },
  pressed: { opacity: 0.75 },
});
