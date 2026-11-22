import { Ionicons } from '@/components/Icon';
import { loadFacts } from '@/lib/agentPrefsStore';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { catalogApi } from '@/api/catalog';
import { entitiesApi } from '@/api/endpoints';
import { CatalogFilters } from '@/components/catalog/CatalogFilters';
import { CatalogItems } from '@/components/catalog/CatalogItems';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { attrGroups, audienceChips, catalogCopy, catalogCount, catalogGroups, filterCatalog, formatPesos, kindChips, matchesAttrs, matchesAudience, publicCatalog, quickFilters, sectionChips, type Audience, type ItemKind, type ServiceItem } from '@/lib/catalog';
import { safeIcon } from '@/lib/icons';
import { displayIcon } from '@/lib/mapView';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * El catálogo completo de un negocio (3.27/3.28): se llama según el tipo de negocio (Carta, Servicios, Productos…), con
 * buscador (sin tildes ni mayúsculas) y chips por sección cuando el dueño las usa. Tocar un ítem abre su detalle
 * (fotos, descripción y preguntar). Solo el catálogo habitual: las ofertas tienen su propia pantalla.
 * 2026-11-22: arriba solo buscar, «Filtrar» y las secciones en una fila; lo demás (para quién, talla, color, precio,
 * duración) va en la hoja de filtros, y lo elegido queda como fichas que se quitan con la x.
 */
export default function CatalogScreen() {
  const { id, section: initialSection, audience: initialAudience } = useLocalSearchParams<{ id: string; section?: string; audience?: Audience }>();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [section, setSection] = useState(initialSection ?? '');
  const [audience, setAudience] = useState<Audience | null>(initialAudience ?? null);
  const [kind, setKind] = useState<ItemKind | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  // Filtros que salen de sus datos: hasta un precio y de poca duración (solo si parten la lista).
  const [cheap, setCheap] = useState(false);
  const mySize = useQuery({ queryKey: ['agent-facts'], queryFn: loadFacts }).data?.find((f) => f.name === 'Talla')?.value ?? null;
  const [short, setShort] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const business = useQuery({ queryKey: ['entity', id], queryFn: () => entitiesApi.get(id ?? ''), enabled: Boolean(id) });
  const catalog = useQuery({ queryKey: ['catalog', id, 'sections'], queryFn: () => catalogApi.listWithSections(id ?? ''), enabled: Boolean(id), staleTime: 60_000 });

  const copy = catalogCopy(business.data?.category?.name, business.data?.business_profile);
  const items = useMemo(() => publicCatalog(catalog.data?.items ?? []), [catalog.data]);
  // El orden de las secciones es el del negocio (las que tienen productos), con «Otros» al final.
  const order = useMemo(() => (catalog.data?.sections ?? []).map((s) => s.name), [catalog.data]);
  // Servicios y productos nunca van mezclados: si hay de los dos, se elige; las secciones y los atributos siguen esa elección.
  const kinds = useMemo(() => kindChips(items), [items]);
  const byKind = useMemo(() => items.filter((i) => !kind || i.kind === kind), [items, kind]);
  const audiences = useMemo(() => (catalog.data?.audience ? audienceChips(byKind) : []), [catalog.data, byKind]);
  const forAudience = useMemo(() => byKind.filter((i) => matchesAudience(i.audience, audience)), [byKind, audience]);
  // Los atributos (talla, color…) salen de lo que se ve, y filtran juntos.
  const attrs = useMemo(() => attrGroups(forAudience), [forAudience]);
  const quick = useMemo(() => quickFilters(byKind), [byKind]);
  const shown = useMemo(
    () =>
      forAudience.filter(
        (i) =>
          matchesAttrs(i, chosen) &&
          (!cheap || quick.maxPrice === null || (typeof i.price === 'number' && i.price <= quick.maxPrice)) &&
          (!short || quick.maxMin === null || (typeof i.duration_min === 'number' && i.duration_min <= quick.maxMin)),
      ),
    [forAudience, chosen, cheap, short, quick],
  );
  const sizeGroup = attrs.find((g) => g.name.toLowerCase() === 'talla');
  const sizeValue = mySize && sizeGroup ? sizeGroup.values.find((v) => v.value.toUpperCase() === mySize.toUpperCase())?.value : undefined;
  const quickChips = [
    ...(sizeValue && sizeGroup ? [{ key: 'size', label: `Tu talla ${sizeValue}`, on: chosen[sizeGroup.name] === sizeValue, toggle: () => choose(sizeGroup.name, chosen[sizeGroup.name] === sizeValue ? null : sizeValue) }] : []),
    ...(quick.maxPrice !== null ? [{ key: 'cheap', label: `Hasta ${formatPesos(quick.maxPrice)}`, on: cheap, toggle: () => setCheap((v) => !v) }] : []),
    ...(quick.maxMin !== null ? [{ key: 'short', label: `${quick.maxMin} min o menos`, on: short, toggle: () => setShort((v) => !v) }] : []),
  ];
  // Las secciones siempre se ven (salen de lo de este tipo); el conteo es el de los demás filtros.
  const chips = useMemo(() => sectionChips(byKind, order, shown), [byKind, order, shown]);
  const groups = useMemo(() => catalogGroups(filterCatalog(shown, query, section), order), [shown, query, section, order]);
  const choose = (name: string, value: string | null) =>
    setChosen((c) => {
      const next = { ...c };
      if (value) next[name] = value;
      else delete next[name];
      return next;
    });
  const filtering = Boolean(query || section || audience || kind || cheap || short || Object.keys(chosen).length);
  // Lo que vive en la hoja de filtros, como fichas que se quitan con la x.
  const active = [
    ...(audience ? [{ key: 'aud', label: audiences.find((a) => a.key === audience)?.label ?? 'Para', clear: () => setAudience(null) }] : []),
    ...Object.entries(chosen).map(([n, v]) => ({ key: `attr-${n}`, label: `${n} ${v}`, clear: () => choose(n, null) })),
    ...(cheap && quick.maxPrice !== null ? [{ key: 'cheap', label: `Hasta ${formatPesos(quick.maxPrice)}`, clear: () => setCheap(false) }] : []),
    ...(short && quick.maxMin !== null ? [{ key: 'short', label: `${quick.maxMin} min o menos`, clear: () => setShort(false) }] : []),
  ];
  const hasSheet = audiences.length > 0 || attrs.length > 0 || quickChips.length > 0;
  const clearSheet = () => {
    setAudience(null);
    setChosen({});
    setCheap(false);
    setShort(false);
  };
  const shownCount = groups.reduce((n, g) => n + g.items.length, 0);

  // Sin foto, cada producto muestra el ícono de su sección (o el de la categoría del negocio).
  const icons = useMemo(() => new Map((catalog.data?.sections ?? []).map((x) => [x.name, x.icon])), [catalog.data]);
  const fallback = safeIcon(displayIcon(business.data?.category?.icon), 'pricetag-outline');
  const iconOf = (item: ServiceItem) => safeIcon(icons.get(item.section ?? ''), fallback);
  const open = (item: ServiceItem) => router.push({ pathname: '/business/product', params: { entityId: id ?? '', itemId: item.id } });

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Catálogo" subtitle={business.data ? `${business.data.name} · ${catalogCount(copy, items.length)}` : undefined} />
      {catalog.isLoading ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.topRow}>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Busca en este negocio"
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                accessibilityLabel="Busca en este negocio"
                returnKeyType="search"
              />
              {query ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => setQuery('')} style={styles.clear}>
                  <Ionicons name="close-circle" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            {hasSheet ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={active.length ? `Filtrar, ${active.length} elegidos` : 'Filtrar'}
                onPress={() => setFiltersOpen(true)}
                style={[styles.filterBtn, active.length > 0 && styles.filterBtnOn]}
              >
                <Ionicons name="options-outline" size={18} color={active.length ? colors.onPrimary : colors.ink} />
                <Text style={[styles.filterText, active.length > 0 && { color: colors.onPrimary }]}>{active.length ? `Filtros · ${active.length}` : 'Filtrar'}</Text>
              </Pressable>
            ) : null}
          </View>
          {kinds.length > 0 ? (
            <View style={styles.segment} accessibilityRole="tablist" accessibilityLabel="Servicios o productos">
              {kinds.map((k) => {
                const on = k.key === kind;
                return (
                  <Pressable
                    key={k.key ?? 'all'}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${k.label}, ${k.count}`}
                    onPress={() => {
                      setKind(k.key);
                      setSection('');
                      setChosen({});
                    }}
                    style={[styles.segBtn, on && styles.segOn]}
                  >
                    <Text style={[styles.segText, on && styles.segTextOn]}>
                      {k.label} <Text style={styles.segCount}>{k.count}</Text>
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <CatalogFilters sections={chips} total={shown.length} section={section} onSection={setSection} />
          {active.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeRow}>
              {active.map((f) => (
                <Pressable key={f.key} accessibilityRole="button" accessibilityLabel={`Quitar ${f.label}`} onPress={f.clear} style={styles.activeChip}>
                  <Text style={styles.activeText}>{f.label}</Text>
                  <Ionicons name="close" size={14} color={colors.primaryDark} />
                </Pressable>
              ))}
              <Pressable accessibilityRole="button" onPress={clearSheet} style={styles.activeClear}>
                <Text style={styles.activeClearText}>Quitar todo</Text>
              </Pressable>
            </ScrollView>
          ) : null}
          <Text style={styles.count} accessibilityLiveRegion="polite">
            {filtering ? `${catalogCount(copy, shownCount)} de ${items.length}` : catalogCount(copy, items.length)}
          </Text>
          {groups.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{query ? `Nada coincide con «${query}».` : 'Nada por aquí con este filtro.'}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setQuery('');
                  setSection('');
                  setAudience(null);
                  setKind(null);
                  setChosen({});
                  setCheap(false);
                  setShort(false);
                }}
                style={styles.emptyBtn}
              >
                <Text style={styles.emptyBtnText}>Ver todo</Text>
              </Pressable>
            </View>
          ) : (
            groups.map((g) => (
              <View key={g.section || 'all'} style={styles.group}>
                {g.section ? (
                  <Text style={styles.groupTitle} accessibilityRole="header">
                    {g.section} · {g.items.length}
                  </Text>
                ) : null}
                <CatalogItems items={g.items} iconOf={iconOf} color={business.data?.category?.color} onOpen={open} />
              </View>
            ))
          )}
        </ScrollView>
      )}
      <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <Pressable style={styles.backdrop} accessibilityLabel="Cerrar los filtros" onPress={() => setFiltersOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.grab} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Filtros</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={() => setFiltersOpen(false)} style={styles.clear}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.md }}>
            <CatalogFilters sections={[]} total={shown.length} section={section} onSection={setSection} audiences={audiences} audience={audience} onAudience={setAudience} attrs={attrs} chosen={chosen} onChoose={choose} />
            {quickChips.length ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.sheetLabel}>Atajos</Text>
                <View style={styles.quick}>
                  {quickChips.map((c) => (
                    <Pressable key={c.key} accessibilityRole="button" accessibilityState={{ selected: c.on }} onPress={c.toggle} style={[styles.quickChip, c.on && styles.quickChipOn]}>
                      <Text style={[styles.quickText, c.on && styles.quickTextOn]}>{c.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.sheetFoot}>
            <Pressable accessibilityRole="button" onPress={clearSheet} disabled={!active.length} style={[styles.sheetClear, !active.length && { opacity: 0.4 }]}>
              <Text style={styles.sheetClearText}>Limpiar</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setFiltersOpen(false)} style={styles.sheetGo}>
              <Text style={styles.sheetGoText}>{`Ver ${catalogCount(copy, shownCount)}`}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loading: { marginTop: spacing.xxl },
  body: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  filterBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  segment: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.md, backgroundColor: colors.well },
  segBtn: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.surface, elevation: 1, shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.muted },
  segTextOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  segCount: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  activeRow: { gap: 6, alignItems: 'center' },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  activeText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  activeClear: { minHeight: 36, paddingHorizontal: 8, justifyContent: 'center' },
  activeClearText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
  backdrop: { flex: 1, backgroundColor: 'rgba(22,35,58,0.45)' },
  sheet: { maxHeight: '80%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  sheetLabel: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  sheetFoot: { flexDirection: 'row', gap: spacing.sm },
  sheetClear: { flex: 1, minHeight: 50, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  sheetClearText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  sheetGo: { flex: 2, minHeight: 50, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sheetGoText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.onPrimary },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingLeft: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  searchInput: { flex: 1, minHeight: 44, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickChip: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'center' },
  quickChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  quickText: { fontSize: 13.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  quickTextOn: { color: colors.onPrimary},
  group: { gap: spacing.sm },
  groupTitle: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.muted },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.muted },
  emptyBtn: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' },
  emptyBtnText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
