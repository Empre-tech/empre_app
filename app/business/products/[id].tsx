import { Ionicons } from '@/components/Icon';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogApi } from '@/api/catalog';
import { entitiesApi } from '@/api/endpoints';
import { ledgerApi, type InventoryItem, type InventorySort, type InventoryState, type InventoryTab, type InventoryTabCounts, type SetupChoice } from '@/api/ledger';
import { useEntitySections } from '@/api/sections';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { QuickStockSheet } from '@/components/inventory/QuickStockSheet';
import { NewSupplySheet } from '@/components/inventory/NewSupplySheet';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { Chip } from '@/components/ledger/parts';
import { VoiceSheet } from '@/components/ledger/VoiceSheet';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { FEATURES } from '@/config';
import { catalogCopy, priceNote, priceText, type ItemKind, type ServiceItem } from '@/lib/catalog';
import { fmtQty, missingIngredients, recommendationText, stockPill, unitFor, variantPill, type PillTone } from '@/lib/inventory';
import { addDays, todayCO } from '@/lib/finance';
import { FEW_BUSINESSES } from '@/lib/fewBusinesses';
import { formatPesos } from '@/lib/ledger';
import { getPhoneFlag, setPhoneFlag } from '@/lib/phoneFlags';
import { stockNews } from '@/lib/stockNews';
import { countsLine } from '@/lib/alerts';
import { safeIcon, type IconName } from '@/lib/icons';
import { mediaUrl } from '@/lib/image';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';

type Row = InventoryItem & { children: InventoryItem[] };

const TABS: { key: InventoryTab; label: string; one: string; many: string; counts: 'products' | 'services' | 'supplies' }[] = [
  { key: 'product', label: 'Productos', one: 'producto', many: 'productos', counts: 'products' },
  { key: 'service', label: 'Servicios', one: 'servicio', many: 'servicios', counts: 'services' },
  { key: 'supply', label: 'Insumos', one: 'insumo', many: 'insumos', counts: 'supplies' },
];
const SORTS: { key: InventorySort; label: string }[] = [
  { key: 'az', label: 'A–Z' },
  { key: 'stock', label: 'Menos existencias' },
  { key: 'sales', label: 'Más vendidos' },
];
const STATE_LABEL: Record<InventoryState, string> = { low: 'Se acaban', out: 'Agotados', nophoto: 'Sin foto' };
const PAGE = 50;
const pageKey = (entityId: string, tab: InventoryTab, q: string, section?: string, state?: InventoryState, sort?: InventorySort) =>
  ['ledger', entityId, 'inventory', 'page', tab, q, section ?? '', state ?? '', sort ?? ''] as const;
const unitShort = (u?: string) => (!u || u === 'unidad' ? 'und' : u);

/**
 * Inventario (tablero «Inventario», 2026-11-16): productos, servicios e insumos como un catálogo, cada uno en su
 * pestaña con su número. Una barra: buscar y un solo filtro (cómo están, sección y orden), que se resuelven en el
 * servidor por páginas de 50; la lista dibuja solo lo que se ve y las variantes van plegadas dentro de su producto.
 * Con pocos (menos de 8) no hay barra: todo se ve de una vez. Empre AI va en su propia entrada (es de pago, nunca dentro
 * del buscador ni del filtro). Abajo, crear lo de la pestaña: producto, servicio o insumo.
 */
export default function InventoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const now = useNow(60_000);
  const ledgerOn = Boolean(entityId) && FEATURES.ledger;

  const business = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId) });
  const copy = catalogCopy(business.data?.category?.name, business.data?.business_profile);
  // Sin el módulo de administración la pantalla es solo el catálogo (nombre y precio); con él, no se baja entero.
  const catalog = useQuery({ queryKey: ['catalog', entityId], queryFn: () => catalogApi.list(entityId), enabled: Boolean(entityId) && !FEATURES.ledger });
  // Lo de arriba (avisos, empezar a llevar inventario, revisar qué es cada cosa, la nota de precios) llega ya contado:
  // la pantalla no baja todas las filas ni el catálogo entero, solo la página que se ve.
  const summary = useQuery({ queryKey: ['ledger', entityId, 'inventory', 'summary'], queryFn: () => ledgerApi.inventorySummary(entityId), enabled: ledgerOn });
  const counts = useQuery({ queryKey: ['ledger', entityId, 'inventory', 'counts'], queryFn: () => ledgerApi.inventoryCounts(entityId), enabled: ledgerOn });

  const [pickedTab, setPickedTab] = useState<InventoryTab | null>(null);
  // Sin elegir, arranca donde está lo del negocio: una peluquería en Servicios, una tienda en Productos.
  const tab: InventoryTab = pickedTab ?? (copy.kind === 'service' ? 'service' : 'product');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [state, setState] = useState<InventoryState | undefined>();
  const [section, setSection] = useState<string | undefined>();
  const [sort, setSort] = useState<InventorySort | undefined>();
  const [filterOpen, setFilterOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<InventoryItem | null>(null);
  const [newSupply, setNewSupply] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Los nombres (para que Empre AI entienda lo que dictas y para no repetir un insumo) solo al abrir esas hojas.
  const names = useQuery({ queryKey: ['ledger', entityId, 'inventory', 'names'], queryFn: () => ledgerApi.inventoryNames(entityId), enabled: ledgerOn && (voiceOpen || newSupply), staleTime: 60_000 });

  // Buscar espera a que dejes de escribir (y se resuelve en el servidor).
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const tabTotal = counts.data?.[(TABS.find((t) => t.key === tab) ?? TABS[0]).counts].total;
  const pages = useInfiniteQuery({
    queryKey: pageKey(entityId, tab, q, section, state, sort),
    queryFn: ({ pageParam }) => ledgerApi.inventoryPage(entityId, { tab, q, section, state, sort, cursor: pageParam, limit: PAGE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor || undefined,
    // Una pestaña en 0 no pide nada: su vacío se ve al instante (cada consulta tarda casi un segundo). Si el 0 es viejo y
    // los conteos se están pidiendo otra vez (volviste de agregar algo), pide la página de una vez.
    enabled: ledgerOn && (tabTotal !== 0 || counts.isFetching),
    // Mientras llega otra búsqueda u otro filtro de la misma pestaña se queda lo de antes; al cambiar de pestaña no, para
    // no mostrar productos bajo «Servicios».
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[4] === tab ? keepPreviousData(prev) : undefined),
  });

  // Las otras pestañas se piden de una vez, en paralelo, para que cambiar de pestaña no espere.
  useEffect(() => {
    if (!ledgerOn || !counts.data) return;
    for (const t of TABS) {
      if (counts.data[t.counts].total === 0) continue;
      void qc.prefetchInfiniteQuery({
        queryKey: pageKey(entityId, t.key, ''),
        queryFn: ({ pageParam }) => ledgerApi.inventoryPage(entityId, { tab: t.key, cursor: pageParam, limit: PAGE }),
        initialPageParam: undefined as string | undefined,
        staleTime: 30_000,
      });
    }
  }, [ledgerOn, counts.data, qc, entityId]);

  // Al entrar o al cambiar algo, se pide otra vez solo lo de esta pantalla. Lo demás del negocio (Finance, Mi negocio,
  // el catálogo) solo se marca viejo: se pide cuando vuelvas a esa pantalla, no ahora y no todo de una vez.
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['ledger', entityId, 'inventory'] });
    void qc.invalidateQueries({ queryKey: ['ledger', entityId, 'sales', 'stock-news'] });
    void qc.invalidateQueries({ queryKey: ['sections', entityId] });
    void qc.invalidateQueries({ queryKey: ['ledger', entityId], refetchType: 'none' });
    // Sin el módulo de administración, el catálogo es lo de esta pantalla: ese sí se pide.
    void qc.invalidateQueries({ queryKey: ['catalog', entityId], refetchType: FEATURES.ledger ? 'none' : 'active' });
  }, [qc, entityId]);
  // Al abrir, las consultas ya se piden solas; volver a pedir al enfocar solo cuando regresas a la pantalla (si no, cada
  // cosa se pedía dos veces).
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      refresh();
    }, [refresh]),
  );

  const setup = useMutation({
    mutationFn: (choice: SetupChoice) => ledgerApi.setupInventory(entityId, choice),
    onSuccess: () => refresh(),
    onError: () => setError('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.'),
  });

  // Las filas de las páginas, cada producto con sus variantes plegadas.
  const rows: Row[] = useMemo(() => {
    const all = pages.data?.pages ?? [];
    const kids = new Map<string, InventoryItem[]>();
    for (const p of all) for (const v of p.variants) if (v.parent_id) kids.set(v.parent_id, [...(kids.get(v.parent_id) ?? []), v]);
    return all.flatMap((p) => p.items).map((it) => ({ ...it, children: kids.get(it.ref) ?? [] }));
  }, [pages.data]);
  const total = pages.data?.pages[0]?.total ?? 0;
  const meta = TABS.find((t) => t.key === tab) ?? TABS[0];
  const tc: InventoryTabCounts | undefined = counts.data?.[meta.counts];
  // Pocos: sin barra ni filtro, todo de una vez y cada uno una vez (como Inicio con pocos negocios).
  const few = tc ? tc.total < FEW_BUSINESSES && !q && !state && !section : false;
  // Con tu orden y sin búsqueda, la lista va por secciones (con su título pegado arriba); si no, una sola.
  // Con una sección elegida en la fila, la lista es solo esa y su nombre ya está en la ficha: sin título repetido.
  const grouped = !few && !sort && !q && !section;
  const sections = useMemo(() => {
    if (!rows.length) return [];
    if (!grouped) return [{ title: '', data: rows }];
    const out: { title: string; data: Row[] }[] = [];
    const at = new Map<string, number>();
    for (const r of rows) {
      const name = (tab === 'supply' ? r.group || r.section : r.section) || 'Sin sección';
      if (!at.has(name)) {
        at.set(name, out.length);
        out.push({ title: name, data: [] });
      }
      out[at.get(name) as number].data.push(r);
    }
    return out;
  }, [grouped, rows, tab]);
  // El número de cada sección es su total real. Con un estado elegido («Se acaban») ese total ya no sirve: va lo que quedó
  // de la sección, y solo cuando ya llegó todo.
  // Sin títulos de sección (pocos, buscando u ordenando) la sección va en cada fila, salvo que todas compartan la misma:
  // lo que comparten todas no se repite debajo de cada una.
  const mixedSections = useMemo(() => new Set(rows.map((r) => r.section || '')).size > 1, [rows]);
  // «Sin asignar» (un insumo que ningún producto usa) solo dice algo si otros sí están asignados.
  const someAssigned = useMemo(() => rows.some((r) => (r.used_in ?? []).length > 0), [rows]);
  const headCount = (title: string, loaded: number) => (state ? (pages.hasNextPage ? undefined : loaded) : tc?.sections.find((s) => s.name === title)?.count);

  const sellSections = useEntitySections(entityId, 'sell');
  const sellIcons = useMemo(() => new Map((sellSections.data ?? []).map((s) => [s.name, s.icon])), [sellSections.data]);
  const supplySections = useEntitySections(entityId, 'supply');
  const supplyIcons = useMemo(() => new Map((supplySections.data ?? []).map((s) => [s.name, s.icon])), [supplySections.data]);

  const items = useMemo(() => catalog.data ?? [], [catalog.data]);
  const sum = summary.data;
  const alerts = sum?.alerts ?? { out: 0, soon: 0, risk: 0, total: 0 };

  // Aviso cuando una venta en Empre Finance cambia tus existencias; se cierra hasta la siguiente venta.
  const today = todayCO();
  const salesToday = useQuery({
    queryKey: ['ledger', entityId, 'sales', 'stock-news', today],
    queryFn: () => ledgerApi.sales(entityId, { from: `${today}T00:00:00-05:00`, to: `${addDays(today, 1)}T00:00:00-05:00`, limit: 100 }),
    enabled: ledgerOn,
    staleTime: 30_000,
  });
  const [seenSale, setSeenSale] = useState<string | null>(null);
  useEffect(() => {
    void getPhoneFlag(`stock-news-${entityId}`).then(setSeenSale);
  }, [entityId]);
  // Solo las filas de lo vendido hoy (no todo el inventario): con ellas se arma el aviso.
  const soldIds = useMemo(() => [...new Set((salesToday.data ?? []).flatMap((s) => (s.lines ?? []).map((l) => l.item_id).filter((x): x is string => Boolean(x))))].sort(), [salesToday.data]);
  const soldRows = useQuery({
    queryKey: ['ledger', entityId, 'inventory', 'items', soldIds.join(',')],
    queryFn: () => ledgerApi.inventoryItems(entityId, soldIds),
    enabled: ledgerOn && soldIds.length > 0,
    staleTime: 30_000,
  });
  const tracked = useMemo(() => (soldRows.data ?? []).filter((i) => !i.is_service && (i.mode === 'light' || i.mode === 'exact')).map((i) => ({ ids: [i.ref, i.item_id].filter((x): x is string => Boolean(x)), name: i.name, qty: i.qty })), [soldRows.data]);
  const news = useMemo(() => stockNews(salesToday.data ?? [], tracked, seenSale), [salesToday.data, tracked, seenSale]);
  const dismissNews = () => {
    if (!news) return;
    setSeenSale(news.id);
    void setPhoneFlag(`stock-news-${entityId}`, news.id);
  };

  const openDetail = (itemId: string) => router.push({ pathname: '/business/products/item', params: { entityId, itemId } });
  // Crear lo de la pestaña; con una sección elegida en el filtro, nace en ella.
  const create = () => {
    if (tab === 'supply') return setNewSupply(true);
    const sec = section ? (sellSections.data ?? []).find((s) => s.name === section) : undefined;
    router.push({ pathname: '/business/products/item', params: { entityId, kind: tab, ...(sec ? { sectionId: sec.id, sectionName: sec.name } : {}) } });
  };
  const pickTab = (t: InventoryTab) => {
    setPickedTab(t);
    setState(undefined);
    setSection(undefined);
    setSort(undefined);
    setSearch('');
    setQ('');
  };
  // El filtro es cómo están y el orden; la sección va en su fila (tablero «Inventario», v97).
  const activeFilters = [state, sort].filter(Boolean).length;
  const filterLabel = state ? STATE_LABEL[state] : ((sort ? SORTS.find((s) => s.key === sort)?.label : null) ?? 'Todos');

  if (!FEATURES.ledger) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Inventario" />
        <PlainList items={items} onOpen={(it) => openDetail(it.id)} />
      </View>
    );
  }

  const note = sum ? priceNote(sum.prices, now) : null;

  const header = (
    <View style={styles.listHead}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {news ? (
        <View style={styles.news} accessibilityLiveRegion="polite">
          <EmpreSymbol product="finance" size={32} />
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/business/ledger/[id]', params: { id: entityId } })} style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text style={styles.newsTitle}>Empre Finance actualizó tu inventario</Text>
            <Text style={styles.newsText}>{news.text}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar el aviso" onPress={dismissNews} style={styles.newsClose}>
            <Ionicons name="close" size={18} color={colors.ink} />
          </Pressable>
        </View>
      ) : null}
      {/* Buscando o con una sección elegida, primero lo que pediste (los avisos son de todo el negocio). */}
      {alerts.total > 0 && !q && !section && tab !== 'service' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Tienes ${alerts.total} cosas por revisar: ${countsLine(alerts)}. Ver los avisos`}
          onPress={() => router.push({ pathname: '/business/products/alerts', params: { entityId } })}
          style={({ pressed }) => [styles.alertCard, pressed && { opacity: 0.9 }]}
        >
          <View style={styles.alertHead}>
            <View style={styles.alertIcon}>
              <Ionicons name="warning-outline" size={18} color={colors.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>{alerts.total === 1 ? 'Tienes 1 cosa por revisar' : `Tienes ${alerts.total} cosas por revisar`}</Text>
              <Text style={styles.alertLine}>{copy.kind === 'food' ? countsLine(alerts) : countsLine(alerts, 'producto', 'productos')}</Text>
            </View>
          </View>
          <View style={styles.alertFoot}>
            <Text style={styles.alertLink}>{alerts.total === 1 ? 'Ver el aviso' : `Ver los ${alerts.total} avisos`}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primaryDark} />
          </View>
        </Pressable>
      ) : null}
      {tab !== 'supply' && sum && sum.unchecked_total > 0 ? <KindReview entityId={entityId} items={sum.unchecked} total={sum.unchecked_total} onChanged={refresh} /> : null}
      {/* Empezar a llevar inventario: solo si todavía no se cuenta nada (con 55 contados y 6 sin decidir, esos 6 dicen
          «Sin control» en su fila y se ajustan ahí). */}
      {tab === 'product' && sum && sum.unset > 0 && sum.tracked === 0 ? (
        <View style={styles.setup}>
          <Text style={styles.setupTitle}>¿Quieres saber cuándo se acaba algo?</Text>
          <Text style={styles.meta}>{recommendationText(sum.kind, sum.category)}</Text>
          <View style={styles.row}>
            <Button title="Sí, empezar" loading={setup.isPending} onPress={() => setup.mutate('recommended')} style={{ flex: 1 }} />
            <Button title="Más simple" variant="secondary" disabled={setup.isPending} onPress={() => setup.mutate('simple')} style={{ flex: 1 }} />
          </View>
          <Pressable accessibilityRole="button" onPress={() => setup.mutate('none')} style={styles.linkRow}>
            <Text style={styles.link}>No quiero llevar inventario</Text>
          </Pressable>
        </View>
      ) : null}
      {/* Empre AI aparte: es de pago, no vive en el buscador ni en el filtro. Un servicio no tiene existencias que dictar,
          y sin nada en la pestaña no hay qué actualizar. */}
      {tab !== 'service' && (tc?.total ?? 0) > 0 && !q && !section ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Actualizar con Empre AI: dicta lo que llegó o se acabó"
          onPress={() => setVoiceOpen(true)}
          style={({ pressed }) => [styles.aiEntry, pressed && { backgroundColor: colors.well }]}
        >
          <View style={styles.chispa}>
            <Ionicons name="sparkles" size={16} color={colors.ink} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={styles.aiTitle}>Actualizar con Empre AI</Text>
            <Text style={styles.aiSub}>Dicta lo que llegó o se acabó</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      ) : null}
      {few && rows.length > 0 ? (
        <Text style={styles.meta}>
          {tab === 'supply'
            ? `Lo que gastas para atender o preparar; tus clientes no lo ven. Con menos de ${FEW_BUSINESSES}, todo se ve de una vez.`
            : `Con menos de ${FEW_BUSINESSES} no hace falta buscar ni filtrar: todo se ve de una vez.`}
        </Text>
      ) : null}
    </View>
  );

  const footer = (
    <View style={{ gap: spacing.sm, paddingTop: spacing.md }}>
      {pages.isFetchingNextPage ? <Text style={styles.loadingMore}>{`Cargando los siguientes ${PAGE}…`}</Text> : null}
      {tab !== 'supply' && rows.length > 0 && !pages.hasNextPage && !q && !state && !section ? (
        <>
          {note ? <Text style={styles.meta}>{note}</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => void catalogApi.confirm(entityId).then(refresh, () => setError('No pudimos confirmar los precios'))} style={styles.confirm}>
            <Ionicons name="checkmark-circle-outline" size={20} color={colors.ink} />
            <Text style={styles.confirmText}>Mis precios siguen vigentes</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );

  // Nunca «Aún no tienes…» con un 0 viejo: mientras llegan los conteos o la página, se espera.
  const empty = pages.isFetching || (counts.isFetching && tabTotal === 0) ? (
    <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.ink} />
  ) : pages.isError ? (
    <EmptyState icon="cloud-offline-outline" title="No pudimos cargar tu inventario" body="Revisa tu conexión e inténtalo de nuevo." action={{ title: 'Reintentar', onPress: refresh }} />
  ) : q || state || section ? (
    <Text style={[styles.meta, { paddingVertical: spacing.lg }]}>Nada por aquí con esta búsqueda o este filtro.</Text>
  ) : tab === 'supply' ? (
    <EmptyState
      icon="cube-outline"
      title="Aún no tienes insumos"
      body="Lo que gastas para atender o preparar: ingredientes, vasos, bolsas. Agrégalos con «Nuevo insumo» y te avisamos cuando se acaben. Si no usas, puede quedar vacío."
    />
  ) : (
    <EmptyState icon="cube-outline" title={`Aún no tienes ${meta.many}`} body={`Agrega el primero con «Nuevo ${meta.one}»: queda en tu perfil y, si lo cuentas, en tu inventario.`} />
  );

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Inventario" />
      <View style={styles.top}>
        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((t) => {
            const n = counts.data?.[t.counts].total;
            const on = tab === t.key;
            return (
              <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={n != null ? `${t.label}, ${n}` : t.label} onPress={() => pickTab(t.key)} style={[styles.tab, on && styles.tabOn]}>
                <Text style={styles.tabText}>{t.label}</Text>
                {n != null ? <Text style={styles.tabCount}>{n}</Text> : null}
              </Pressable>
            );
          })}
        </View>
        {tc && !few ? (
          <View style={styles.bar}>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={section ? `Buscar en ${section}` : `Buscar en ${tc.total} ${tc.total === 1 ? meta.one : meta.many}`}
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                accessibilityLabel={`Buscar ${meta.many}`}
                returnKeyType="search"
              />
              {search ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Borrar la búsqueda" onPress={() => setSearch('')} style={styles.clear}>
                  <Ionicons name="close-circle" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={activeFilters ? `Filtro: ${filterLabel}. Cambiar` : 'Filtrar'}
              onPress={() => setFilterOpen(true)}
              style={[styles.filterPill, activeFilters > 0 && styles.filterOn]}
            >
              <Text style={styles.filterText} numberOfLines={1}>
                {filterLabel}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.ink} />
            </Pressable>
          </View>
        ) : null}
        {tc && !few && tc.sections.length > 1 ? <SectionRail sections={tc.sections} total={tc.total} selected={section} onPick={setSection} /> : null}
      </View>

      <SectionList
        // Otra pestaña, búsqueda o filtro es otra lista: arranca desde arriba.
        key={`${tab}|${q}|${state ?? ''}|${section ?? ''}|${sort ?? ''}`}
        sections={sections}
        keyExtractor={(r) => r.ref}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={empty}
        initialNumToRender={14}
        windowSize={9}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
        }}
        renderSectionHeader={({ section: s }) =>
          s.title ? (
            <View style={styles.secHead}>
              <Text style={styles.secTitle} accessibilityRole="header">
                {s.title}
              </Text>
              {headCount(s.title, s.data.length) != null ? <Text style={styles.secCount}>{headCount(s.title, s.data.length)}</Text> : null}
            </View>
          ) : null
        }
        renderItem={({ item: i, index, section: s }) => {
          const open = expanded[i.ref] ?? Boolean(q);
          const supplyRow = tab === 'supply';
          return (
            <View style={few ? [styles.fewCard, index === 0 && styles.fewFirst, index === s.data.length - 1 && styles.fewLast] : undefined}>
              <ItemRow
                item={i}
                first={index === 0}
                cover={i.photo}
                icon={safeIcon(supplyRow ? supplyIcons.get(i.group ?? '') : sellIcons.get(i.section ?? ''), supplyRow ? 'cube-outline' : 'pricetag-outline')}
                group={i.children.length > 0 ? { pill: variantPill(i), open, from: Math.min(...i.children.map((c) => c.price ?? Infinity)) } : undefined}
                showSold={sort === 'sales'}
                showSection={!grouped && !supplyRow && mixedSections}
                showUnassigned={someAssigned}
                supplyView={supplyRow}
                onOpen={() => (i.kind === 'supply' ? setSheet(i) : openDetail(i.item_id ?? i.ref))}
                onPill={() => (i.children.length > 0 ? setExpanded((m) => ({ ...m, [i.ref]: !open })) : setSheet(i))}
              />
              {i.children.length > 0 && open
                ? i.children.map((c) => <ItemRow key={c.ref} item={c} first={false} child onOpen={() => openDetail(c.item_id ?? c.ref)} onPill={() => setSheet(c)} />)
                : null}
            </View>
          );
        }}
      />

      {/* Crear lo de la pestaña: producto, servicio o insumo */}
      <View style={[styles.createBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button title={`Nuevo ${meta.one}`} onPress={create} />
      </View>

      <FilterSheet
        visible={filterOpen}
        tab={tab}
        counts={tc}
        total={pages.isPlaceholderData ? undefined : total}
        searching={Boolean(q)}
        state={state}
        section={section}
        sort={sort}
        onState={setState}
        onSort={setSort}
        onClear={() => {
          setState(undefined);
          setSort(undefined);
        }}
        onClose={() => setFilterOpen(false)}
      />
      <NewSupplySheet visible={newSupply} entityId={entityId} existing={(names.data ?? []).filter((n) => n.kind === 'supply').map((n) => n.name)} onClose={() => setNewSupply(false)} onAdded={refresh} />
      <QuickStockSheet
        entityId={entityId}
        item={sheet}
        onClose={() => setSheet(null)}
        onChanged={refresh}
        onOpenDetail={(i) => {
          setSheet(null);
          openDetail(i.item_id ?? i.ref);
        }}
      />
      <VoiceSheet entityId={entityId} visible={voiceOpen} onClose={() => setVoiceOpen(false)} defaultMode="inventory" hints={(names.data ?? []).map((n) => n.name)} onConfirmed={() => refresh()} />
    </View>
  );
}

type SectionCountRow = InventoryTabCounts['sections'][number];

/**
 * La fila de secciones (tablero «Inventario», v97): ir directo a una sección sin bajar por las demás. Tocar una muestra
 * solo esa (se filtra en el servidor, así sirve igual con 50 que con 5.000); «Todas» vuelve a la lista completa. El punto
 * rojo dice que algo de esa sección se acaba o se acabó. Se desliza de lado si son muchas.
 */
function SectionRail({ sections, total, selected, onPick }: { sections: SectionCountRow[]; total: number; selected?: string; onPick: (name: string | undefined) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railWrap} contentContainerStyle={styles.rail} accessibilityLabel="Secciones" keyboardShouldPersistTaps="handled">
      <RailChip label="Todas" n={total} on={!selected} onPress={() => onPick(undefined)} />
      {sections.map((s) => (
        <RailChip key={s.name} label={s.name} n={s.count} alert={(s.low ?? 0) + (s.out ?? 0) > 0} on={selected === s.name} onPress={() => onPick(selected === s.name ? undefined : s.name)} />
      ))}
    </ScrollView>
  );
}

function RailChip({ label, n, alert, on, onPress }: { label: string; n: number; alert?: boolean; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}, ${n}${alert ? ', algo se acaba' : ''}`}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [styles.railChip, on && styles.railChipOn, pressed && !on && { backgroundColor: colors.well }]}
    >
      <Text style={styles.railText}>{label}</Text>
      <Text style={styles.railCount}>{n}</Text>
      {alert ? <View style={styles.railDot} /> : null}
    </Pressable>
  );
}

/** Una ficha del filtro (tablero «Inventario»): arena si está elegida, borde si no. */
function FilterChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={({ pressed }) => [styles.fChip, on && styles.fChipOn, pressed && !on && { backgroundColor: colors.well }]}>
      <Text style={styles.fChipText}>{label}</Text>
    </Pressable>
  );
}

/**
 * Un solo filtro (tablero «Inventario», teléfono 2): cómo están, sección y orden, cada uno con su número. Reemplaza las
 * tres filas de fichas de antes. Cada elección se aplica al tocarla (tocarla otra vez la quita) y el botón dice cuántos
 * quedan.
 */
function FilterSheet({
  visible,
  tab,
  counts,
  total,
  searching,
  state,
  section,
  sort,
  onState,
  onSort,
  onClear,
  onClose,
}: {
  visible: boolean;
  tab: InventoryTab;
  counts?: InventoryTabCounts;
  /** Lo que devolvió el servidor con este filtro; vacío mientras llega (no se muestra un número viejo). */
  total?: number;
  searching: boolean;
  state?: InventoryState;
  section?: string;
  sort?: InventorySort;
  onState: (s: InventoryState | undefined) => void;
  onSort: (s: InventorySort | undefined) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const meta = TABS.find((t) => t.key === tab) ?? TABS[0];
  // Con una sección elegida en la fila, los números son los de esa sección (no los de toda la pestaña). «Sin foto» no se
  // cuenta por sección: va sin número.
  const sec = section ? counts?.sections.find((s) => s.name === section) : undefined;
  const base: { total: number; low: number; out: number; nophoto?: number } | undefined = sec
    ? { total: sec.count, low: sec.low ?? 0, out: sec.out ?? 0 }
    : counts
      ? { total: counts.total, low: counts.low, out: counts.out, nophoto: counts.no_photo }
      : undefined;
  const states: { key: InventoryState; n?: number }[] = base
    ? [
        { key: 'low' as const, n: base.low },
        { key: 'out' as const, n: base.out },
        ...(tab !== 'supply' ? [{ key: 'nophoto' as const, n: base.nophoto }] : []),
      ].filter((s) => s.n == null || s.n > 0 || s.key === state)
    : [];
  const any = Boolean(state || sort);
  // Lo que ya se sabe por los conteos sale al instante; lo demás (buscando, o «Sin foto» en una sección) espera al servidor.
  const known = !base || searching ? undefined : !state ? base.total : { low: base.low, out: base.out, nophoto: base.nophoto }[state];
  const n = total ?? known;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar el filtro" style={styles.sheetVeil} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            {section ? `Filtrar ${section}` : `Filtrar ${meta.many}`}
          </Text>
          {any ? (
            <Pressable accessibilityRole="button" onPress={onClear} style={styles.linkRow}>
              <Text style={styles.link}>Quitar filtros</Text>
            </Pressable>
          ) : null}
        </View>
        {states.length > 0 ? (
          <>
            <Text style={styles.sheetLabel}>Cómo están</Text>
            <View style={styles.chips}>
              <FilterChip label={base ? `Todos ${base.total}` : 'Todos'} on={!state} onPress={() => onState(undefined)} />
              {states.map((s) => (
                <FilterChip key={s.key} label={s.n != null ? `${STATE_LABEL[s.key]} ${s.n}` : STATE_LABEL[s.key]} on={state === s.key} onPress={() => onState(state === s.key ? undefined : s.key)} />
              ))}
            </View>
          </>
        ) : null}
        <Text style={styles.sheetLabel}>Ordenar</Text>
        <View style={styles.chips}>
          {SORTS.filter((s) => !(tab === 'supply' && s.key === 'sales')).map((s) => (
            <FilterChip key={s.key} label={s.label} on={sort === s.key} onPress={() => onSort(sort === s.key ? undefined : s.key)} />
          ))}
        </View>
        <Button title={n != null ? `Ver ${n} ${n === 1 ? meta.one : meta.many}` : `Ver ${meta.many}`} onPress={onClose} />
      </View>
    </Modal>
  );
}

/**
 * Una fila del inventario (tablero «Inventario»): foto o unidad, nombre, una línea de detalle y, a la derecha, cómo
 * está (en rojo si se acaba o se acabó). Tocar la fila abre la ficha; tocar lo de la derecha lo ajusta en un toque o, en
 * un producto con variantes, las muestra.
 */
function ItemRow({
  item,
  first,
  onOpen,
  onPill,
  supplyView,
  group,
  child,
  cover,
  icon,
  showSold,
  showSection,
  showUnassigned,
}: {
  item: InventoryItem;
  /** Id de la foto de portada y el ícono de su sección (lo que se ve sin foto). */
  cover?: string;
  icon?: IconName;
  first: boolean;
  onOpen: () => void;
  onPill: () => void;
  supplyView?: boolean;
  /** Producto con variantes: su resumen a la derecha (la flecha las muestra) y el precio más bajo. */
  group?: { pill: { label: string; tone: PillTone }; open: boolean; from: number };
  /** Una variante, dentro de su producto. */
  child?: boolean;
  /** Con «Más vendidos», cuánto se vendió explica por qué va ahí. */
  showSold?: boolean;
  /** Sin títulos de sección (buscando u ordenando), la sección va en la línea de detalle. */
  showSection?: boolean;
  /** Insumos: decir «Sin asignar» solo si otros sí están asignados. */
  showUnassigned?: boolean;
}) {
  const service = item.is_service && !group;
  const pill = group ? group.pill : stockPill(item);
  const urgent = pill.tone === 'out' || pill.tone === 'low';
  const quiet = pill.tone === 'muted' || pill.tone === 'service';
  const right = service ? (item.price ? formatPesos(item.price) : 'Sin precio') : pill.label;
  const missing = missingIngredients(item);
  const usedIn = item.used_in ?? [];
  const daysNote = item.days_left != null && item.days_left > 0 && item.days_left <= 10 ? `~${Math.max(1, Math.round(item.days_left))} d` : null;
  const ingCount = item.ingredients?.length ?? 0;
  const price = group ? (Number.isFinite(group.from) ? `desde ${formatPesos(group.from)}` : null) : item.price ? formatPesos(item.price) : 'Sin precio';
  const detail = supplyView
    ? [item.kind === 'product' ? 'También se vende' : null, usedIn.length ? `Se usa en ${usedIn.length} ${usedIn.length === 1 ? 'producto' : 'productos'}` : showUnassigned ? 'Sin asignar' : null, daysNote]
    : service
      ? [showSection ? item.section : null]
      : [showSection && !child ? item.section : null, price, item.servings != null ? `alcanza para ${item.servings}` : daysNote, ingCount > 0 ? `usa ${ingCount} ${ingCount === 1 ? 'insumo' : 'insumos'}` : null];
  const line = [showSold && item.sold_28 > 0 ? `${fmtQty(item.sold_28)} ${item.sold_28 === 1 ? 'vendido' : 'vendidos'}` : null, ...detail].filter(Boolean).join(' · ');
  const warnAt = supplyView && urgent && item.low_at != null ? `Avisa en ${fmtQty(item.low_at)} ${unitFor(item.unit, item.low_at)}` : null;
  return (
    <View style={[styles.itemRow, !first && styles.itemLine, child && styles.childRow]}>
      {!child ? (
        cover ? (
          <Image source={{ uri: mediaUrl(cover) }} style={styles.thumb} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            {item.kind === 'supply' ? <Text style={styles.thumbUnit}>{unitShort(item.unit)}</Text> : <Ionicons name={icon ?? 'pricetag-outline'} size={18} color={colors.muted} />}
          </View>
        )
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}. ${right}. Abrir`} onPress={onOpen} style={styles.itemMain}>
        <Text style={styles.itemName} numberOfLines={1}>
          {child && item.variant_label ? item.variant_label : item.name}
        </Text>
        {line ? (
          <Text style={styles.meta} numberOfLines={1}>
            {line}
          </Text>
        ) : null}
        {warnAt ? <Text style={styles.warn}>{warnAt}</Text> : null}
        {missing.out.length > 0 ? <Text style={styles.warn}>Falta insumo: {missing.out.join(', ')}</Text> : missing.low.length > 0 ? <Text style={styles.warnSoft}>Queda poco insumo: {missing.low.join(', ')}</Text> : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={group ? `${item.name}: ${pill.label}. ${group.open ? 'Ocultar' : 'Ver'} variantes` : service ? `${item.name}: ${right}` : `${item.name}: ${pill.label}. Ajustar`}
        accessibilityState={group ? { expanded: group.open } : undefined}
        disabled={service}
        onPress={onPill}
        style={styles.right}
      >
        <Text style={[styles.rightText, urgent && styles.rightUrgent, quiet && !service && styles.rightQuiet]}>{right}</Text>
        {group ? <Ionicons name={group.open ? 'chevron-up' : 'chevron-down'} size={14} color={urgent ? colors.primaryDark : colors.ink} /> : null}
      </Pressable>
    </View>
  );
}

/** Sin el módulo de administración: solo el catálogo (nombre y precio). */
function PlainList({ items, onOpen }: { items: ServiceItem[]; onOpen: (it: ServiceItem) => void }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.card}>
      {items.map((it, n) => (
        <Pressable key={it.id} accessibilityRole="button" onPress={() => onOpen(it)} style={[styles.itemRow, n > 0 && styles.itemLine]}>
          <View style={styles.itemMain}>
            <Text style={styles.itemName}>{it.name}</Text>
            <Text style={styles.meta}>{priceText(it) ?? 'Sin precio publicado'}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/** Ítems de antes que la app clasificó sola: el dueño confirma en un toque si son servicio o producto. */
function KindReview({ entityId, items, total, onChanged }: { entityId: string; items: { id: string; name: string; kind: ItemKind }[]; total: number; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const set = async (it: { id: string; kind: ItemKind }, kind: ItemKind) => {
    if (it.kind === kind) return;
    setBusy(true);
    try {
      await catalogApi.setKind(entityId, it.id, kind);
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    setBusy(true);
    try {
      await catalogApi.confirmKinds(entityId);
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.review}>
      <Text style={styles.setupTitle}>Revisa qué es cada cosa</Text>
      <Text style={styles.meta}>Un servicio no se agota; un producto se cuenta. Los clasificamos solos: corrige lo que no esté bien.</Text>
      {items.slice(0, 8).map((it) => (
        <View key={it.id} style={styles.reviewRow}>
          <Text style={[styles.itemName, { flex: 1 }]} numberOfLines={1}>
            {it.name}
          </Text>
          <Chip label="Servicio" selected={it.kind === 'service'} onPress={() => void set(it, 'service')} />
          <Chip label="Producto" selected={it.kind === 'product'} onPress={() => void set(it, 'product')} />
        </View>
      ))}
      {total > items.length ? <Text style={styles.meta}>Y {total - items.length} más: los ves en la lista.</Text> : null}
      <Button title="Todo está bien" loading={busy} onPress={() => void confirm()} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  // Pestañas (tablero): un riel de arena; la elegida, blanca y apenas levantada.
  tabs: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: radius.md, backgroundColor: colors.sand },
  tab: { flex: 1, minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  tabOn: { backgroundColor: colors.bg, shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  tabCount: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted, fontVariant: ['tabular-nums'] },
  bar: { flexDirection: 'row', gap: spacing.sm },
  search: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: 14, paddingRight: 2, borderRadius: radius.pill, backgroundColor: colors.well },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 0, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink },
  clear: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  filterPill: { maxWidth: 170, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  filterOn: { backgroundColor: colors.sand, borderColor: colors.sand },
  filterText: { flexShrink: 1, fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  listHead: { gap: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
  meta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  // Arena, no verde: el verde es de Finance y el dinero.
  setup: { gap: spacing.sm, backgroundColor: colors.well, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.md },
  setupTitle: { fontSize: 15.5, fontFamily: fonts.display.bold, color: colors.ink },
  row: { flexDirection: 'row', gap: spacing.sm },
  linkRow: { minHeight: 44, justifyContent: 'center', alignSelf: 'center' },
  link: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
  news: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 14, paddingRight: 6, borderRadius: 20, backgroundColor: colors.surface },
  newsTitle: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  newsText: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.muted },
  newsClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  alertCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: '#F2C9A0', overflow: 'hidden' },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  alertIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  alertLine: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  alertFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, borderTopWidth: 1, borderTopColor: '#F5E6D6' },
  alertLink: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  // Empre AI: su propia entrada, aparte del buscador (tablero, teléfono 1).
  aiEntry: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  // La chispa del tablero: círculo de arena con la chispa en tinta (sin relleno negro). El anillo de usos del tablero
  // espera el contador de Empre AI, que aún no existe.
  chispa: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  aiTitle: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  aiSub: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  loadingMore: { textAlign: 'center', fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted, paddingVertical: spacing.xs },
  confirm: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: colors.surface },
  confirmText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  // Título de sección pegado arriba mientras bajas, con su número real (no el de la página).
  secHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: spacing.md, paddingBottom: spacing.xs, backgroundColor: colors.bg },
  secTitle: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  secCount: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted, fontVariant: ['tabular-nums'] },
  // Con pocos, la lista va en una sola tarjeta (tablero, teléfono 5).
  fewCard: { paddingHorizontal: spacing.md, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  fewFirst: { borderTopWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  fewLast: { borderBottomWidth: 1, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  createBar: { paddingTop: spacing.md, paddingHorizontal: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  // La fila de secciones: llega al borde derecho para que se note que se desliza.
  railWrap: { marginHorizontal: -spacing.lg },
  rail: { gap: 6, paddingHorizontal: spacing.lg },
  railChip: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  railChipOn: { backgroundColor: colors.sand, borderColor: colors.sand },
  railText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  railCount: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, fontVariant: ['tabular-nums'] },
  railDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brandRef },
  fChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  fChipOn: { backgroundColor: colors.sand, borderColor: colors.sand },
  fChipText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  sheetVeil: { flex: 1, backgroundColor: 'rgba(43,38,34,0.28)' },
  sheet: { gap: 14, paddingTop: 10, paddingHorizontal: spacing.lg, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.bg },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  sheetTitle: { fontSize: 18, fontFamily: fonts.ui.semibold, color: colors.ink },
  sheetLabel: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: 20, overflow: 'hidden' },
  // Fila (tablero): foto de 48, nombre, una línea y lo de la derecha; sin tarjeta, con una línea entre filas.
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64 },
  itemLine: { borderTopWidth: 1, borderTopColor: colors.line },
  childRow: { marginLeft: 60 },
  thumb: { width: 48, height: 48, borderRadius: 12 },
  thumbEmpty: { backgroundColor: colors.well, alignItems: 'center', justifyContent: 'center' },
  thumbUnit: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  itemMain: { flex: 1, minWidth: 0, minHeight: 56, paddingVertical: spacing.sm, justifyContent: 'center', gap: 1 },
  itemName: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  warn: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.primaryDark },
  warnSoft: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.ink },
  right: { minWidth: 44, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, paddingLeft: spacing.sm },
  rightText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink, fontVariant: ['tabular-nums'], textAlign: 'right' },
  rightUrgent: { color: colors.primaryDark },
  rightQuiet: { fontFamily: fonts.ui.medium, color: colors.muted },
  review: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.brandRef },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
