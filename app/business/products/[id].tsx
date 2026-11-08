import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogApi } from '@/api/catalog';
import { entitiesApi } from '@/api/endpoints';
import { ledgerApi, type InventoryItem, type SetupChoice } from '@/api/ledger';
import { useAudienceEnabled, useEntitySections } from '@/api/sections';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { QuickStockSheet } from '@/components/inventory/QuickStockSheet';
import { SectionDeck } from '@/components/inventory/SectionDeck';
import { NewSupplySheet } from '@/components/inventory/NewSupplySheet';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { Chip } from '@/components/ledger/parts';
import { VoiceSheet } from '@/components/ledger/VoiceSheet';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { FEATURES } from '@/config';
import { audienceChips, catalogCopy, freshnessNote, listTitle, matchesAudience, priceText, withoutPhoto, type Audience, type ItemKind, type ServiceItem } from '@/lib/catalog';
import {
  COLLAPSE_OVER,
  groupInventory,
  stockState,
  withStock,
  bestSellers,
  canRankBySales,
  fmtQty,
  type StockState,
  missingIngredients,
  nestVariants,
  normalize,
  PAGE_SIZE,
  recommendationText,
  sectionize,
  splitTabs,
  stockPill,
  variantPill,
  type PillTone,
} from '@/lib/inventory';
import { addDays, todayCO } from '@/lib/finance';
import { formatPesos } from '@/lib/ledger';
import { getPhoneFlag, setPhoneFlag } from '@/lib/phoneFlags';
import { stockNews } from '@/lib/stockNews';
import { alertsLine, inventoryAlerts } from '@/lib/alerts';
import { blocksByGroup, filterByStatus, groupSummary, searchSupplies, type SupplyFilter } from '@/lib/supplies';
import { safeIcon, type IconName } from '@/lib/icons';
import { deckAlert, deckCountText, wantsSectionDeck } from '@/lib/sectionDeck';
import { mediaUrl } from '@/lib/image';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';

type Filter = 'all' | 'urgent' | 'service' | 'product' | 'nophoto' | StockState;
const STOCK_TITLE: Record<StockState, string> = { ok: 'Hay', low: 'Queda poco', out: 'Agotado' };

/**
 * Lo que vendes y tus insumos. Lo que vendes arranca por tus secciones (una fila por sección con cuántos tiene y si algo
 * se acaba); al tocar una entras solo a sus productos, con las otras secciones como fichas para saltar y, en ropa,
 * «Para: Hombre · Mujer · Niños». El buscador busca en todo. Cada fila dice en una pastilla cómo está (hay, queda poco,
 * 12 und…); tocar la pastilla la ajusta en un toque y tocar la fila abre la ficha, donde vive todo lo demás.
 */
export default function ProductsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const now = useNow(60_000);

  const business = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId) });
  const copy = catalogCopy(business.data?.category?.name, business.data?.business_profile);
  const catalog = useQuery({ queryKey: ['catalog', entityId], queryFn: () => catalogApi.list(entityId), enabled: Boolean(entityId) });
  const invKey = ['ledger', entityId, 'inventory'];
  const inv = useQuery({ queryKey: invKey, queryFn: () => ledgerApi.inventory(entityId), enabled: Boolean(entityId) && FEATURES.ledger, staleTime: 0 });
  const { refetch: refetchInv } = inv;
  const { refetch: refetchCatalog } = catalog;
  useFocusEffect(
    useCallback(() => {
      void refetchCatalog();
      if (FEATURES.ledger) void refetchInv();
    }, [refetchCatalog, refetchInv]),
  );

  const [tab, setTab] = useState<'sell' | 'supplies'>('sell');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [shown, setShown] = useState<Record<string, number>>({});
  const [sheet, setSheet] = useState<InventoryItem | null>(null);
  const [newSupply, setNewSupply] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  // Insumos: null = automático («Atención» si algo se acaba; si no, todos).
  const [supFilter, setSupFilter] = useState<SupplyFilter | null>(null);
  const [error, setError] = useState<string | null>(null);
  // La sección abierta en «Lo que vendes» (null = la lista de secciones) y el filtro «Para».
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [aud, setAud] = useState<Audience | null>(null);
  const [bySales, setBySales] = useState(false);
  // Con muchas secciones, cada una es un mazo y solo una va abierta. Al abrir, la lista la lleva arriba.
  const [deckOpen, setDeckOpen] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const pickDeck = (key: string) => setDeckOpen((o) => (o === key ? null : key));
  const revealDeck = (node: View) => {
    const list = scrollRef.current;
    if (!list) return;
    node.measureLayout(
      list.getInnerViewNode(),
      (_x, y) => list.scrollTo({ y: Math.max(0, y - 8), animated: true }),
      () => undefined,
    );
  };

  const items = useMemo(() => catalog.data ?? [], [catalog.data]);
  const tabs = useMemo(() => splitTabs(inv.data?.items ?? []), [inv.data]);
  const unchecked = items.filter((i) => i.kind_checked === false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['catalog', entityId] });
    void qc.invalidateQueries({ queryKey: ['ledger', entityId] });
    void qc.invalidateQueries({ queryKey: ['sections', entityId] });
  };
  const setup = useMutation({
    mutationFn: (choice: SetupChoice) => ledgerApi.setupInventory(entityId, choice),
    onSuccess: (data) => {
      qc.setQueryData(invKey, data);
      refresh();
    },
    onError: () => setError('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.'),
  });

  const q = normalize(search);
  // Las variantes van dentro de su producto; el producto toma su estado.
  const nested = useMemo(() => nestVariants(tabs.sell), [tabs.sell]);
  const sellBase = useMemo(() => {
    let list = nested;
    if (filter === 'service') list = list.filter((i) => i.is_service);
    if (filter === 'product') list = list.filter((i) => !i.is_service);
    return q ? list.filter((i) => normalize(i.name).includes(q) || i.children.some((c) => normalize(c.name).includes(q))) : list;
  }, [nested, filter, q]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => groupInventory(sellBase), [sellBase]);
  const urgentRefs = useMemo(() => new Set(groups.urgent.map((i) => i.ref)), [groups]);
  // Con búsqueda, lo urgente va aparte arriba; sin búsqueda, cada cosa en su sección (el aviso lleva a lo urgente).
  const sellSections = useEntitySections(entityId, 'sell');
  const sectionOrder = useMemo(() => (sellSections.data ?? []).map((s) => s.name), [sellSections.data]);
  const blocks = useMemo(
    () => (filter === 'urgent' ? [] : sectionize(q ? sellBase.filter((i) => !urgentRefs.has(i.ref)) : sellBase, sectionOrder)),
    [filter, sellBase, urgentRefs, q, sectionOrder],
  );
  const attention = useMemo(() => filterByStatus(tabs.supplies, 'attention').length, [tabs.supplies]);
  const supFilterNow: SupplyFilter = supFilter ?? (attention > 0 && tabs.supplies.length > COLLAPSE_OVER ? 'attention' : 'all');
  const supplyList = useMemo(() => filterByStatus(q ? searchSupplies(tabs.supplies, search) : tabs.supplies, q ? 'all' : supFilterNow), [tabs.supplies, q, search, supFilterNow]);
  const supplyBlocks = useMemo(() => blocksByGroup(supplyList), [supplyList]);
  const outCount = useMemo(() => filterByStatus(tabs.supplies, 'out').length, [tabs.supplies]);
  const urgentCount = useMemo(() => groupInventory(nested).urgent.length, [nested]);
  const alerts = useMemo(() => inventoryAlerts(inv.data?.items ?? []), [inv.data]);

  const semCounts = useMemo(() => {
    const source = tab === 'sell' ? nested.filter((i) => !i.is_service && (i.mode === 'light' || i.mode === 'exact')) : tabs.supplies.filter((i) => i.mode === 'light' || i.mode === 'exact');
    let ok = 0;
    let low = 0;
    let out = 0;
    for (const i of source) {
      const s = stockState(i);
      if (s === 'out') out += 1;
      else if (s === 'low') low += 1;
      else if (s === 'ok') ok += 1;
    }
    return { ok, low, out, total: ok + low + out };
  }, [tab, nested, tabs.supplies]);

  // Hay, Poco y Agotado: cada uno muestra solo lo suyo, en toda la lista. Tocarlo otra vez lo quita.
  const stockOn: StockState | null = filter === 'ok' || filter === 'low' || filter === 'out' ? filter : null;
  const stockRows = useMemo(() => (stockOn ? withStock(sellBase, stockOn) : []), [sellBase, stockOn]);
  const pickStock = (s: StockState) => {
    if (tab === 'sell') setFilter(filter === s ? 'all' : s);
    else setSupFilter(supFilterNow === s ? 'all' : s);
  };
  const stockIs = (s: StockState) => (tab === 'sell' ? filter === s : supFilterNow === s);

  // Navegar por secciones (sin búsqueda ni los filtros de existencias).
  const audOn = useAudienceEnabled(entityId);
  const audienceOf = useMemo(() => new Map(items.map((i) => [i.id, i.audience ?? []])), [items]);
  const sectionBlocks = useMemo(() => sectionize(sellBase, sectionOrder), [sellBase, sectionOrder]);
  const browsing = q === '' && filter !== 'urgent' && filter !== 'nophoto' && !stockOn;
  // Fotos e íconos: la portada de cada producto y el ícono de cada sección (lo que se ve sin foto).
  const coverOf = useMemo(() => new Map(items.map((i) => [i.id, i.photos?.[0]])), [items]);
  const sellIcons = useMemo(() => new Map((sellSections.data ?? []).map((s) => [s.name, s.icon])), [sellSections.data]);
  const supplySections = useEntitySections(entityId, 'supply');
  const supplyIcons = useMemo(() => new Map((supplySections.data ?? []).map((s) => [s.name, s.icon])), [supplySections.data]);
  const noPhoto = useMemo(() => new Set(withoutPhoto(items).map((i) => i.id)), [items]);
  const noPhotoRows = useMemo(() => nested.filter((i) => noPhoto.has(i.item_id ?? i.ref)), [nested, noPhoto]);
  const current = openSection && sectionBlocks.some((b) => b.title === openSection) ? openSection : null;
  const currentItems = useMemo(() => (current ? sectionBlocks.find((b) => b.title === current)?.items ?? [] : []), [current, sectionBlocks]);
  const audChips = useMemo(
    () => (audOn && current ? audienceChips(currentItems.map((i) => ({ audience: audienceOf.get(i.item_id ?? i.ref) }))) : []),
    [audOn, current, currentItems, audienceOf],
  );
  // «Más vendidos primero» aparece cuando ya hay ventas que comparar; sin ellas, el orden no diría nada.
  const canSort = useMemo(() => canRankBySales(nested), [nested]);
  const salesOn = bySales && canSort && browsing;
  const salesRows = useMemo(() => (salesOn && !current ? bestSellers(sellBase) : []), [salesOn, current, sellBase]);
  const shownItems = useMemo(() => {
    const list = currentItems.filter((i) => matchesAudience(audienceOf.get(i.item_id ?? i.ref), aud));
    return salesOn ? bestSellers(list) : list;
  }, [currentItems, audienceOf, aud, salesOn]);
  const openOne = (title: string | null) => {
    setOpenSection(title);
    setAud(null);
  };
  // El botón atrás del teléfono vuelve de una sección a la lista de secciones.
  useEffect(() => {
    if (!browsing || !current || tab !== 'sell') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpenSection(null);
      return true;
    });
    return () => sub.remove();
  }, [browsing, current, tab]);

  // Aviso cuando una venta en Empre Finance cambia tus existencias; se cierra hasta la siguiente venta.
  const today = todayCO();
  const salesToday = useQuery({
    queryKey: ['ledger', entityId, 'sales', 'stock-news', today],
    queryFn: () => ledgerApi.sales(entityId, { from: `${today}T00:00:00-05:00`, to: `${addDays(today, 1)}T00:00:00-05:00`, limit: 100 }),
    enabled: Boolean(entityId) && FEATURES.ledger,
    staleTime: 30_000,
  });
  const [seenSale, setSeenSale] = useState<string | null>(null);
  useEffect(() => {
    void getPhoneFlag(`stock-news-${entityId}`).then(setSeenSale);
  }, [entityId]);
  const tracked = useMemo(() => (inv.data?.items ?? []).filter((i) => !i.is_service && (i.mode === 'light' || i.mode === 'exact')).map((i) => ({ ids: [i.ref, i.item_id].filter((x): x is string => Boolean(x)), name: i.name, qty: i.qty })), [inv.data]);
  const news = useMemo(() => stockNews(salesToday.data ?? [], tracked, seenSale), [salesToday.data, tracked, seenSale]);
  const dismissNews = () => {
    if (!news) return;
    setSeenSale(news.id);
    void setPhoneFlag(`stock-news-${entityId}`, news.id);
  };

  const defaultOpen = sellBase.length <= COLLAPSE_OVER || q !== '';
  const isOpen = (key: string) => openMap[key] ?? defaultOpen;
  const toggle = (key: string) => setOpenMap((m) => ({ ...m, [key]: !(m[key] ?? defaultOpen) }));
  const more = (key: string) => setShown((m) => ({ ...m, [key]: (m[key] ?? PAGE_SIZE) + PAGE_SIZE }));

  const openDetail = (itemId?: string) => {
    if (itemId) return router.push({ pathname: '/business/products/item', params: { entityId, itemId } });
    // Agregar desde una sección: el producto nuevo ya nace en ella.
    const sec = current ? (sellSections.data ?? []).find((s) => s.name === current) : undefined;
    router.push({ pathname: '/business/products/item', params: sec ? { entityId, sectionId: sec.id, sectionName: sec.name } : { entityId } });
  };

  const title = listTitle(items, copy);
  const loading = catalog.isLoading || (FEATURES.ledger && inv.isLoading);
  if (loading) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title={title} />
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </View>
    );
  }
  if (catalog.isError || (FEATURES.ledger && inv.isError)) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title={title} />
        <EmptyState
          icon="cloud-offline-outline"
          title="No pudimos cargar tu lista"
          body="Revisa tu conexión e inténtalo de nuevo."
          action={{ title: 'Reintentar', onPress: () => { void catalog.refetch(); void inv.refetch(); } }}
        />
      </View>
    );
  }

  const unset = inv.data?.unset ?? 0;
  const note = freshnessNote(items, now);
  const rowOf = (i: InventoryItem & { children: InventoryItem[] }, n: number) => {
    const open = expanded[i.ref] ?? q !== '';
    return (
      <View key={i.ref}>
        <ItemRow
          item={i}
          first={n === 0}
          cover={coverOf.get(i.item_id ?? i.ref)}
          icon={safeIcon(sellIcons.get(i.section ?? ''), 'pricetag-outline')}
          group={i.children.length > 0 ? { pill: variantPill(i), open } : undefined}
          showSold={salesOn}
          onOpen={() => openDetail(i.item_id ?? i.ref)}
          onPill={() => (i.children.length > 0 ? setExpanded((m) => ({ ...m, [i.ref]: !open })) : setSheet(i))}
        />
        {i.children.length > 0 && open
          ? i.children.map((c) => <ItemRow key={c.ref} item={c} first={false} child onOpen={() => openDetail(c.item_id ?? c.ref)} onPill={() => setSheet(c)} />)
          : null}
      </View>
    );
  };
  const sellDeck = browsing && !current && !salesOn && wantsSectionDeck(nested.length, sectionBlocks.length);
  const supplyDeck = !q && wantsSectionDeck(supplyList.length, supplyBlocks.length);
  const moreBtn = (len: number, key: string) =>
    len > (shown[key] ?? PAGE_SIZE) ? (
      <View style={styles.deckMore}>
        <Button title={`Ver más (${len - (shown[key] ?? PAGE_SIZE)})`} variant="secondary" onPress={() => more(key)} />
      </View>
    ) : undefined;
  const rowsOf = (list: (InventoryItem & { children: InventoryItem[] })[], key: string) => (
    <>
      <View style={styles.card}>
        {list.slice(0, shown[key] ?? PAGE_SIZE).map((i, n) => {
          const open = expanded[i.ref] ?? q !== '';
          return (
            <View key={i.ref}>
              <ItemRow
                item={i}
                first={n === 0}
                cover={coverOf.get(i.item_id ?? i.ref)}
                icon={safeIcon(sellIcons.get(i.section ?? ''), 'pricetag-outline')}
                group={i.children.length > 0 ? { pill: variantPill(i), open } : undefined}
                showSold={salesOn}
                onOpen={() => openDetail(i.item_id ?? i.ref)}
                onPill={() => (i.children.length > 0 ? setExpanded((m) => ({ ...m, [i.ref]: !open })) : setSheet(i))}
              />
              {i.children.length > 0 && open
                ? i.children.map((c) => (
                    <ItemRow key={c.ref} item={c} first={false} child onOpen={() => openDetail(c.item_id ?? c.ref)} onPill={() => setSheet(c)} />
                  ))
                : null}
            </View>
          );
        })}
      </View>
      {list.length > (shown[key] ?? PAGE_SIZE) ? (
        <Button title={`Ver más (${list.length - (shown[key] ?? PAGE_SIZE)})`} variant="secondary" onPress={() => more(key)} />
      ) : null}
    </>
  );

  return (
    <View style={styles.screen}>
      <SubScreenHeader title={title} />
      <View style={styles.top}>
        {FEATURES.ledger ? (
          <View style={styles.segment} accessibilityRole="tablist">
            {(
              [
                ['sell', 'Lo que vendes'],
                ['supplies', `Insumos${tabs.supplies.length ? ` · ${tabs.supplies.length}` : ''}`],
              ] as const
            ).map(([k, label]) => (
              <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && styles.segOn]}>
                <Text style={[styles.segText, tab === k && styles.segTextOn]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {FEATURES.ledger && semCounts.total > 0 ? (
          <View style={styles.semRow} accessibilityLabel={`Inventario: ${semCounts.ok} con existencias, ${semCounts.low} quedan poco, ${semCounts.out} agotados`}>
            <SemChip label="Hay" n={semCounts.ok} dot="#14B8B0" on={stockIs('ok')} onPress={() => pickStock('ok')} />
            <SemChip label="Poco" n={semCounts.low} dot={colors.accent} on={stockIs('low')} onPress={() => pickStock('low')} />
            <SemChip label="Agotado" n={semCounts.out} dot={colors.brand} on={stockIs('out')} onPress={() => pickStock('out')} />
          </View>
        ) : null}
        {FEATURES.ledger ? (
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={tab === 'sell' ? 'Buscar o dictar existencias con Empre AI' : 'Buscar o dictar un insumo'}
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              accessibilityLabel="Buscar"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hablar con Empre AI para actualizar inventario"
              onPress={() => setVoiceOpen(true)}
              style={styles.aiVoiceBtn}
            >
              <Ionicons name="mic-outline" size={18} color="#fff" />
              <Text style={styles.aiVoiceBtnText}>IA</Text>
            </Pressable>
          </View>
        ) : (tab === 'sell' ? tabs.sell.length : tabs.supplies.length) > 6 ? (
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput value={search} onChangeText={setSearch} placeholder={tab === 'sell' ? 'Buscar' : 'Buscar un insumo'} placeholderTextColor={colors.muted} style={styles.searchInput} accessibilityLabel="Buscar" />
          </View>
        ) : null}
        {tab === 'supplies' && tabs.supplies.length > 6 && !q ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {attention > 0 ? <Chip label={`Atención · ${attention}`} selected={supFilterNow === 'attention'} onPress={() => setSupFilter('attention')} /> : null}
            {outCount > 0 ? <Chip label={`Se acabó · ${outCount}`} selected={supFilterNow === 'out'} onPress={() => setSupFilter('out')} /> : null}
            {attention - outCount > 0 ? <Chip label={`Queda poco · ${attention - outCount}`} selected={supFilterNow === 'low'} onPress={() => setSupFilter('low')} /> : null}
            <Chip label={`Todos · ${tabs.supplies.length}`} selected={supFilterNow === 'all'} onPress={() => setSupFilter('all')} />
          </ScrollView>
        ) : null}
        {tab === 'sell' && !q && (sectionBlocks.length > 1 || urgentCount > 0) ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }} accessibilityLabel="Filtrar por sección">
            <Chip label={`Todas ${nested.length}`} selected={!current && filter === 'all'} onPress={() => { setFilter('all'); openOne(null); }} />
            {urgentCount > 0 ? <Chip label={`Se acaban ${urgentCount}`} selected={filter === 'urgent'} onPress={() => setFilter('urgent')} /> : null}
            {sectionBlocks.map((b) => (
              <Chip key={b.title} label={`${b.title} ${b.items.length}`} selected={filter === 'all' && b.title === current} onPress={() => { setFilter('all'); openOne(b.title); }} />
            ))}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
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

        {alerts.total > 0 && !q ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Tienes ${alerts.total} cosas por revisar: ${alertsLine(alerts)}. Ver los avisos`}
            onPress={() => router.push({ pathname: '/business/products/alerts', params: { entityId } })}
            style={({ pressed }) => [styles.alertCard, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.alertHead}>
              <View style={styles.alertIcon}>
                <Ionicons name="warning-outline" size={18} color={colors.accentInk} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>{alerts.total === 1 ? 'Tienes 1 cosa por revisar' : `Tienes ${alerts.total} cosas por revisar`}</Text>
                <Text style={styles.alertLine}>{copy.kind === 'food' ? alertsLine(alerts) : alertsLine(alerts, 'producto', 'productos')}</Text>
              </View>
            </View>
            <View style={styles.alertFoot}>
              <Text style={styles.alertLink}>{alerts.total === 1 ? 'Ver el aviso' : `Ver los ${alerts.total} avisos`}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </View>
          </Pressable>
        ) : null}

        {tab === 'sell' ? (
          <>
            {unchecked.length > 0 ? <KindReview entityId={entityId} items={unchecked} onChanged={refresh} /> : null}

            {unset > 0 && inv.data ? (
              <View style={styles.setup}>
                <Text style={styles.setupTitle}>¿Quieres saber cuándo se acaba algo?</Text>
                <Text style={styles.meta}>{recommendationText(inv.data.kind, inv.data.category)}</Text>
                <View style={styles.row}>
                  <Button title="Sí, empezar" loading={setup.isPending} onPress={() => setup.mutate('recommended')} style={{ flex: 1 }} />
                  <Button title="Más simple" variant="secondary" disabled={setup.isPending} onPress={() => setup.mutate('simple')} style={{ flex: 1 }} />
                </View>
                <Pressable accessibilityRole="button" onPress={() => setup.mutate('none')} style={styles.linkRow}>
                  <Text style={styles.link}>No quiero llevar inventario</Text>
                </Pressable>
              </View>
            ) : null}

            {stockOn ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.blockTitle}>{STOCK_TITLE[stockOn]} · {stockRows.length}</Text>
                {stockRows.length > 0 ? rowsOf(stockRows, `stock:${stockOn}`) : <Text style={styles.meta}>Nada por aquí con este filtro.</Text>}
              </View>
            ) : null}

            {groups.urgent.length > 0 && !stockOn && (filter === 'urgent' || q !== '') ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={[styles.blockTitle, { color: '#B3261E' }]}>Se acaba o ya se acabó · {groups.urgent.length}</Text>
                {rowsOf(groups.urgent, 'urgent')}
              </View>
            ) : null}

            {browsing && !current && noPhotoRows.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${noPhotoRows.length} sin foto. Ver cuáles`}
                onPress={() => setFilter('nophoto')}
                style={({ pressed }) => [styles.photoNudge, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="camera-outline" size={18} color={colors.ink} />
                <Text style={styles.photoNudgeText}>
                  {noPhotoRows.length === 1 ? '1 producto sin foto' : `${noPhotoRows.length} productos sin foto`}
                </Text>
                <Text style={styles.link}>Agregar fotos</Text>
              </Pressable>
            ) : null}

            {browsing && canSort ? (
              <View style={styles.audRow}>
                <Chip label="Más vendidos primero" selected={bySales} onPress={() => setBySales(!bySales)} />
              </View>
            ) : null}

            {filter === 'nophoto' ? (
              <View style={{ gap: spacing.sm }}>
                <Pressable accessibilityRole="button" accessibilityLabel="Ver toda la lista" onPress={() => setFilter('all')} style={styles.backRow}>
                  <Ionicons name="chevron-back" size={18} color={colors.ink} />
                  <Text style={styles.link}>Toda la lista</Text>
                </Pressable>
                <Text style={styles.blockTitle}>Sin foto · {noPhotoRows.length}</Text>
                <Text style={styles.meta}>Toca uno para agregarle fotos. Con foto, tu producto se ve mejor en tu perfil.</Text>
                {noPhotoRows.length > 0 ? rowsOf(noPhotoRows, 'nophoto') : <Text style={styles.meta}>¡Todos tus productos tienen foto!</Text>}
              </View>
            ) : null}

            {salesOn && !current ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.blockTitle}>Más vendidos · 4 semanas</Text>
                {rowsOf(salesRows, 'sales')}
              </View>
            ) : null}

            {sellDeck
              ? sectionBlocks.map((b) => {
                  const key = `deck:${b.title}`;
                  const states = b.items.map((i) => stockState(i));
                  return (
                    <SectionDeck
                      key={b.title}
                      title={b.title}
                      countText={deckCountText(b.items.length, copy.one, copy.plural)}
                      alert={deckAlert(states.filter((s) => s === 'out').length, states.filter((s) => s === 'low').length)}
                      faces={b.items.slice(0, 3).reverse().map((i) => ({ cover: coverOf.get(i.item_id ?? i.ref), letter: i.name.slice(0, 1).toUpperCase() }))}
                      open={deckOpen === key}
                      onToggle={() => pickDeck(key)}
                      onReveal={revealDeck}
                      rows={b.items.slice(0, shown[key] ?? PAGE_SIZE).map((i) => rowOf(i, 1))}
                      footer={moreBtn(b.items.length, key)}
                    />
                  );
                })
              : null}

            {browsing && !current && !salesOn && !sellDeck
              ? sectionBlocks.map((b) => (
                  <View key={b.title} style={{ gap: spacing.sm }}>
                    <Text style={styles.blockTitle}>
                      {b.title} · {b.items.length}
                    </Text>
                    {rowsOf(b.items, `all:${b.title}`)}
                  </View>
                ))
              : null}

            {browsing && current ? (
              <View style={{ gap: spacing.sm }}>
                {audChips.length > 0 ? (
                  <View style={styles.audRow}>
                    <Text style={styles.audLabel}>Para</Text>
                    <Chip label="Todos" selected={aud === null} onPress={() => setAud(null)} />
                    {audChips.map((a) => (
                      <Chip key={a.key} label={`${a.label} ${a.count}`} selected={aud === a.key} onPress={() => setAud(aud === a.key ? null : a.key)} />
                    ))}
                  </View>
                ) : null}
                {shownItems.length > 0 ? rowsOf(shownItems, `s:${current}:${aud ?? ''}`) : <Text style={styles.meta}>Nada por aquí con este filtro.</Text>}
              </View>
            ) : null}

            {!browsing && filter !== 'urgent' && filter !== 'nophoto' && !stockOn
              ? blocks.map((b) => {
                  const list = b.items;
                  return (
                    <View key={b.title} style={{ gap: spacing.sm }}>
                      <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen(b.title) }} onPress={() => toggle(b.title)} style={styles.blockHead}>
                        <Text style={styles.blockTitle}>
                          {b.title} · {list.length}
                        </Text>
                        <Ionicons name={isOpen(b.title) ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
                      </Pressable>
                      {isOpen(b.title) ? rowsOf(list, b.title) : null}
                    </View>
                  );
                })
              : null}

            {tabs.sell.length === 0 && items.length === 0 ? (
              <EmptyState icon="cube-outline" title={`Aún no tienes ${copy.plural}`} body="Agrega el primero: queda en tu perfil y, si lo cuentas, en tu inventario." action={{ title: 'Agregar', onPress: () => openDetail() }} />
            ) : null}
            {!FEATURES.ledger ? <PlainList items={items} onOpen={(it) => openDetail(it.id)} /> : null}

            {items.length > 0 ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                {note ? <Text style={styles.meta}>{note}</Text> : null}
                <Pressable accessibilityRole="button" onPress={() => void catalogApi.confirm(entityId).then(refresh, () => setError('No pudimos confirmar los precios'))} style={styles.confirm}>
                  <Ionicons name="checkmark-circle-outline" size={20} color={colors.ink} />
                  <Text style={styles.confirmText}>Mis precios siguen vigentes</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.meta}>Lo que gastas para atender o preparar y no vendes solo. Tus clientes no lo ven.</Text>
            {supplyBlocks.length > 0 ? (
              <>
                {supFilterNow !== 'all' && !q ? (
                  <Text style={styles.meta}>
                    {supFilterNow === 'attention' ? `Mostrando ${supplyList.length} que necesitan atención, por grupo.` : `Mostrando ${supplyList.length}, por grupo.`}
                  </Text>
                ) : null}
                {supplyDeck
                  ? supplyBlocks.map((b) => {
                      const key = `sdeck:${b.title}`;
                      return (
                        <SectionDeck
                          key={b.title}
                          title={b.title}
                          countText={deckCountText(b.items.length, 'insumo', 'insumos')}
                          alert={deckAlert(b.items.filter((i) => i.status === 'out').length, b.items.filter((i) => i.status === 'low').length)}
                          faces={b.items.slice(0, 3).reverse().map((i) => ({ letter: i.name.slice(0, 1).toUpperCase() }))}
                          open={deckOpen === key}
                          onToggle={() => pickDeck(key)}
                          onReveal={revealDeck}
                          rows={b.items.slice(0, shown[key] ?? PAGE_SIZE).map((i) => (
                            <ItemRow
                              key={i.ref}
                              item={i}
                              first={false}
                              icon={safeIcon(i.kind === 'supply' ? supplyIcons.get(i.group ?? '') : sellIcons.get(i.section ?? ''), 'cube-outline')}
                              cover={i.kind === 'product' ? coverOf.get(i.item_id ?? i.ref) : undefined}
                              supplyView
                              onOpen={() => (i.kind === 'supply' ? setSheet(i) : openDetail(i.item_id ?? i.ref))}
                              onPill={() => setSheet(i)}
                            />
                          ))}
                          footer={moreBtn(b.items.length, key)}
                        />
                      );
                    })
                  : null}
                {!supplyDeck && supplyBlocks.map((b) => {
                  // Un solo grupo, búsqueda o filtro corto: todo abierto. Muchos insumos: los grupos arrancan plegados.
                  const key = `g:${b.title}`;
                  const open = openMap[key] ?? (supplyBlocks.length === 1 || q !== '' || supplyList.length <= COLLAPSE_OVER);
                  const sum = groupSummary(b.items);
                  return (
                    <View key={b.title} style={{ gap: spacing.sm }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                        onPress={() => setOpenMap((m) => ({ ...m, [key]: !open }))}
                        style={styles.blockHead}
                      >
                        <Text style={styles.blockTitle}>
                          {b.title} · {b.items.length}
                        </Text>
                        <View style={styles.row}>
                          {sum.tone !== 'muted' ? <Text style={[styles.groupSum, { color: sum.tone === 'out' ? '#B3261E' : colors.accentInk }]}>{sum.text}</Text> : null}
                          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
                        </View>
                      </Pressable>
                      {open ? (
                        <>
                          <View style={styles.card}>
                            {b.items.slice(0, shown[key] ?? PAGE_SIZE).map((i, n) => (
                              <ItemRow
                                key={i.ref}
                                item={i}
                                first={n === 0}
                                icon={safeIcon(i.kind === 'supply' ? supplyIcons.get(i.group ?? '') : sellIcons.get(i.section ?? ''), 'cube-outline')}
                                cover={i.kind === 'product' ? coverOf.get(i.item_id ?? i.ref) : undefined}
                                supplyView
                                onOpen={() => (i.kind === 'supply' ? setSheet(i) : openDetail(i.item_id ?? i.ref))}
                                onPill={() => setSheet(i)}
                              />
                            ))}
                          </View>
                          {b.items.length > (shown[key] ?? PAGE_SIZE) ? (
                            <Button title={`Ver más (${b.items.length - (shown[key] ?? PAGE_SIZE)})`} variant="secondary" onPress={() => more(key)} />
                          ) : null}
                        </>
                      ) : null}
                    </View>
                  );
                })}
              </>
            ) : tabs.supplies.length > 0 ? (
              <View style={styles.emptySupplies}>
                <Text style={styles.meta}>{q ? 'Ningún insumo se llama así.' : 'Nada por aquí: todo está bien con este filtro.'}</Text>
              </View>
            ) : (
              <View style={styles.emptySupplies}>
                <Text style={styles.meta}>¿Gastas ingredientes, vasos o bolsas? Agrégalos con «+ Insumo» y te avisamos cuando se acaben. Si no usas, esta lista puede quedar vacía.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {tab === 'supplies' ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Agregar un insumo" onPress={() => setNewSupply(true)} style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.fabText}>Insumo</Text>
        </Pressable>
      ) : null}
      {tab === 'sell' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={browsing && current ? `Agregar en ${current}` : 'Agregar un producto o servicio'}
          onPress={() => openDetail()}
          style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
        >
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.fabText} numberOfLines={1}>
            Agregar
          </Text>
        </Pressable>
      ) : null}

      <NewSupplySheet
        visible={newSupply}
        entityId={entityId}
        existing={tabs.supplies.map((i) => i.name)}
        onClose={() => setNewSupply(false)}
        onAdded={refresh}
      />
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
      <VoiceSheet
        entityId={entityId}
        visible={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        defaultMode="inventory"
        hints={(inv.data?.items ?? []).map((i) => i.name)}
        onConfirmed={() => refresh()}
      />
    </View>
  );
}

const PILL: Record<PillTone, { bg: string; fg: string }> = {
  ok: { bg: colors.selectedSoft, fg: colors.ink },
  low: { bg: colors.selectedSoft, fg: colors.ink },
  out: { bg: colors.selectedSoft, fg: colors.ink },
  neutral: { bg: colors.selectedSoft, fg: colors.ink },
  muted: { bg: 'transparent', fg: colors.muted },
  service: { bg: 'transparent', fg: colors.muted },
};
const SEM_DOT = { ok: '#14B8B0', low: colors.accent, out: colors.brand } as const;

function SemChip({ label, n, dot, on, onPress }: { label: string; n: number; dot: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on, disabled: n === 0 && !on }} accessibilityLabel={`${label}: ${n}`} disabled={n === 0 && !on} onPress={onPress} style={[styles.semPill, on && styles.semPillOn, n === 0 && !on && { opacity: 0.5 }]}>
      <View style={[styles.semDot, { backgroundColor: dot }]} />
      <Text style={styles.semLabel}>{label}</Text>
      <Text style={styles.semNum}>{n}</Text>
    </Pressable>
  );
}

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
}: {
  item: InventoryItem;
  /** Id de la foto de portada (productos) y el ícono de su sección (lo que se ve sin foto). */
  cover?: string;
  icon?: IconName;
  first: boolean;
  onOpen: () => void;
  onPill: () => void;
  supplyView?: boolean;
  /** Producto con variantes: su pastilla resume y la flecha las muestra. */
  group?: { pill: { label: string; tone: PillTone }; open: boolean };
  /** Una variante, dentro de su producto. */
  child?: boolean;
  /** Con «Más vendidos primero», cuánto se vendió explica por qué va ahí. */
  showSold?: boolean;
}) {
  const pill = group ? group.pill : stockPill(item);
  const semLevel: 'ok' | 'low' | 'out' | null =
    pill.tone === 'out'
      ? 'out'
      : pill.tone === 'low'
        ? 'low'
        : pill.tone === 'ok' || (pill.tone === 'neutral' && !group && item.status === 'ok')
          ? 'ok'
          : null;
  const tone = semLevel ? PILL[semLevel] : PILL[pill.tone];
  const missing = missingIngredients(item);
  const usedIn = item.used_in ?? [];
  const daysNote = item.days_left != null && item.days_left > 0 && item.days_left <= 10 ? `~${Math.max(1, Math.round(item.days_left))} d` : null;
  const ingCount = item.ingredients?.length ?? 0;
  const meta = supplyView
    ? [item.kind === 'product' ? 'También se vende' : null, usedIn.length ? `Usado en ${usedIn.length}` : 'Sin asignar', daysNote].filter(Boolean).join(' · ')
    : [item.price ? formatPesos(item.price) : 'Sin precio', item.servings != null ? `alcanza para ${item.servings}` : daysNote, ingCount > 0 ? `usa ${ingCount} ${ingCount === 1 ? 'insumo' : 'insumos'}` : null].filter(Boolean).join(' · ');
  return (
    <View style={[styles.itemRow, !first && styles.itemLine, child && styles.childRow]}>
      {!child ? (
        cover ? (
          <Image source={{ uri: mediaUrl(cover) }} style={styles.thumb} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.thumb, styles.thumbIcon]}>
            <Ionicons name={icon ?? 'pricetag-outline'} size={18} color={colors.muted} />
          </View>
        )
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}. ${pill.label}. Abrir`} onPress={onOpen} style={styles.itemMain}>
        <Text style={styles.itemName} numberOfLines={1}>
          {child && item.variant_label ? item.variant_label : item.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {showSold && item.sold_28 > 0 ? `${fmtQty(item.sold_28)} ${item.sold_28 === 1 ? 'vendido' : 'vendidos'} · ${meta}` : meta}
        </Text>
        {missing.out.length > 0 ? <Text style={styles.warn}>Falta insumo: {missing.out.join(', ')}</Text> : missing.low.length > 0 ? <Text style={styles.warnSoft}>Queda poco insumo: {missing.low.join(', ')}</Text> : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          group ? `${item.name}: ${pill.label}. ${group.open ? 'Ocultar' : 'Ver'} variantes` : item.is_service ? `${item.name} es un servicio` : `${item.name}: ${pill.label}. Ajustar`
        }
        accessibilityState={group ? { expanded: group.open } : undefined}
        disabled={item.is_service && !group}
        onPress={onPill}
        hitSlop={6}
        style={[styles.pill, { backgroundColor: tone.bg }, pill.tone === 'muted' && styles.pillMuted]}
      >
        {semLevel ? <View style={[styles.semDot, { backgroundColor: SEM_DOT[semLevel] }]} /> : null}
        <Text style={[styles.pillText, { color: tone.fg }]}>{pill.label}</Text>
        {group ? <Ionicons name={group.open ? 'chevron-up' : 'chevron-down'} size={14} color={tone.fg} /> : null}
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
function KindReview({ entityId, items, onChanged }: { entityId: string; items: ServiceItem[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const set = async (it: ServiceItem, kind: ItemKind) => {
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
      {items.length > 8 ? <Text style={styles.meta}>Y {items.length - 8} más: los ves en la lista.</Text> : null}
      <Button title="Todo está bien" loading={busy} onPress={() => void confirm()} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 16, padding: 4 },
  segBtn: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segOn: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.selectedSoft },
  segText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.muted },
  segTextOn: { color: colors.ink, fontFamily: fonts.ui.extrabold },
  semRow: { flexDirection: 'row', gap: 6 },
  semPill: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.selectedSoft },
  semPillOn: { borderWidth: 2, borderColor: colors.ink },
  semDot: { width: 8, height: 8, borderRadius: 4 },
  semLabel: { flex: 1, fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  semNum: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink, fontVariant: ['tabular-nums'] },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingLeft: spacing.md, paddingRight: 6, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  searchInput: { flex: 1, fontSize: 14.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  aiVoiceBtn: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, borderRadius: 12, backgroundColor: colors.primary },
  aiVoiceBtnText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: '#fff' },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
  meta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  setup: { gap: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: spacing.md },
  setupTitle: { fontSize: 15.5, fontFamily: fonts.display.bold, color: colors.ink },
  row: { flexDirection: 'row', gap: spacing.sm },
  linkRow: { minHeight: 40, justifyContent: 'center', alignSelf: 'center' },
  link: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
  news: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 14, paddingRight: 6, borderRadius: 20, backgroundColor: colors.surface },
  newsTitle: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  newsText: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.muted },
  newsClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  confirm: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: colors.surface },
  confirmText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  alertCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: '#F2C9A0', overflow: 'hidden' },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  alertIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  alertLine: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.accentInk },
  alertFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, borderTopWidth: 1, borderTopColor: '#F5E6D6' },
  alertLink: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primary },
  blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  blockTitle: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  card: { backgroundColor: colors.surface, borderRadius: 20, overflow: 'hidden' },
  deckMore: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.md, minHeight: 72 },
  itemLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  itemMain: { flex: 1, minWidth: 0, paddingVertical: spacing.sm, paddingLeft: 4, minHeight: 56, justifyContent: 'center' },
  itemName: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  warn: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: '#B3261E' },
  warnSoft: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.accentInk },
  pill: { minHeight: 36, paddingHorizontal: 10, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  childRow: { marginLeft: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line },
  pillMuted: { borderWidth: 1, borderColor: colors.line },
  groupSum: { fontSize: 12, fontFamily: fonts.ui.extrabold },
  pillText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold },
  emptySupplies: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  review: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fab: { position: 'absolute', right: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 56, paddingHorizontal: 22, borderRadius: 28, backgroundColor: colors.primary, elevation: 4, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  fabText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: '#fff', maxWidth: 220 },
  thumb: { width: 52, height: 52, borderRadius: 12, marginLeft: 10, marginVertical: 10 },
  thumbIcon: { backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  photoNudge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: 16, backgroundColor: colors.surface },
  photoNudgeText: { flex: 1, fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 40, alignSelf: 'flex-start' },
  audRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  audLabel: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
});
