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
import { EmpreButton, EMPRE_BUTTON_INLINE, type EmpreHere } from '@/components/EmpreButton';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { Chip } from '@/components/ledger/parts';
import { VoiceSheet } from '@/components/ledger/VoiceSheet';
import { GoProSheet } from '@/components/pro/GoProSheet';
import { LOCKED_OPACITY, ProTag } from '@/components/pro/ProTag';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { FEATURES } from '@/config';
import { catalogCopy, priceNote, priceText, type ItemKind, type ServiceItem } from '@/lib/catalog';
import { fmtQty, missingIngredients, recommendationText, stockPill, unitFor, variantPill, type PillTone } from '@/lib/inventory';
import { addDays, todayCO } from '@/lib/finance';
import { FEW_BUSINESSES } from '@/lib/fewBusinesses';
import { formatPesos } from '@/lib/ledger';
import { getPhoneFlag, setPhoneFlag } from '@/lib/phoneFlags';
import { countDraftKey, countedAgo, readDraft, staleSection, type CountDraft } from '@/lib/inventoryCount';
import { stockNews } from '@/lib/stockNews';
import { countsLine } from '@/lib/alerts';
import { safeIcon, type IconName } from '@/lib/icons';
import { mediaUrl } from '@/lib/image';
import { useNow } from '@/lib/useNow';
import { useEntityPlan } from '@/lib/useProPlan';
import { colors, fonts, radius, spacing } from '@/theme';

type Row = InventoryItem & { children: InventoryItem[] };
// La lista con el índice (tablero «Inventario», v102): cada sección es un título plegable; la abierta trae, antes de sus
// filas, la línea de contar y, al final, «Ver más» si quedan. Las filas de mentira se marcan con `pseudo`.
type Pseudo = { pseudo: 'count' | 'loading' | 'more' };
type ListItem = Row | Pseudo;
type ListSection = { title: string; count: number; alert: boolean; open: boolean; data: ListItem[] };
const isPseudo = (i: ListItem): i is Pseudo => 'pseudo' in i;

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
// Con más de 8 secciones el índice se alarga: el filtro también las lista; con más de 20, con su buscador.
const SECTIONS_IN_FILTER = 8;
const SECTION_SEARCH = 20;
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
  // La sección abierta, una a la vez. Sin tocar: la primera; null: todas plegadas.
  const [openPick, setOpenPick] = useState<string | null | undefined>(undefined);
  const [sort, setSort] = useState<InventorySort | undefined>();
  // La sección elegida en el filtro (solo cuando son muchas): la lista sale corrida, solo con esa.
  const [filterSection, setFilterSection] = useState<string | undefined>();
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

  const meta = TABS.find((t) => t.key === tab) ?? TABS[0];
  const tc: InventoryTabCounts | undefined = counts.data?.[meta.counts];
  const tabTotal = tc?.total;
  // Pocos: sin barra ni filtro, todo de una vez y cada uno una vez (como Inicio con pocos negocios).
  const few = tc ? tc.total < FEW_BUSINESSES && !q && !state : false;
  // Con tu orden y sin buscar ni filtrar, la lista es el índice: las secciones se pliegan y solo se pide la abierta.
  // Buscando, filtrando u ordenando, la lista sale corrida, de todas las secciones.
  const grouped = Boolean(tc && tc.sections.length > 0) && !few && !sort && !q && !state && !filterSection;
  const openSection = openPick === undefined ? tc?.sections[0]?.name : (openPick ?? undefined);
  const section = grouped ? openSection : filterSection;
  const pages = useInfiniteQuery({
    queryKey: pageKey(entityId, tab, q, section, state, sort),
    queryFn: ({ pageParam }) => ledgerApi.inventoryPage(entityId, { tab, q, section, state, sort, cursor: pageParam, limit: PAGE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor || undefined,
    // Espera los conteos (dicen si hay algo y qué secciones hay). Una pestaña en 0 no pide nada (su vacío se ve al
    // instante) y, con todas las secciones plegadas, tampoco.
    enabled: ledgerOn && Boolean(counts.data) && (tabTotal ?? 0) > 0 && (!grouped || Boolean(openSection)),
    // Mientras llega otra búsqueda u otro filtro de la misma pestaña y la misma sección se queda lo de antes; al cambiar
    // de pestaña o de sección no, para no mostrar filas bajo otro título.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[4] === tab && prevQuery?.queryKey[6] === (section ?? '') ? keepPreviousData(prev) : undefined),
  });

  // Las otras pestañas se piden de una vez, en paralelo, para que cambiar de pestaña no espere.
  useEffect(() => {
    if (!ledgerOn || !counts.data) return;
    for (const t of TABS) {
      const c = counts.data[t.counts];
      if (c.total === 0) continue;
      // Lo que se ve al entrar a esa pestaña: su primera sección abierta (o todo, si son pocos).
      const sec = c.total >= FEW_BUSINESSES ? c.sections[0]?.name : undefined;
      void qc.prefetchInfiniteQuery({
        queryKey: pageKey(entityId, t.key, '', sec),
        queryFn: ({ pageParam }) => ledgerApi.inventoryPage(entityId, { tab: t.key, section: sec, cursor: pageParam, limit: PAGE }),
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
  // El conteo a medias que guardó el teléfono (se lee cada vez que vuelves, por si lo dejaste o lo guardaste).
  const [countDraft, setCountDraft] = useState<CountDraft | null>(null);
  useFocusEffect(
    useCallback(() => {
      void getPhoneFlag(countDraftKey(entityId)).then((raw) => setCountDraft(readDraft(raw)));
    }, [entityId]),
  );
  const openCount = (sec: string, t: InventoryTab = tab) => router.push({ pathname: '/business/products/count', params: { entityId, tab: t, section: sec } });
  // El botón Empre: lo usado de Empre AI se pide solo al abrir su menú (es de pago; el número sale de datos reales).
  // Base y Empre Pro: contar por sección es de Pro; en Base se ve en gris con la corona y abre «Pásate a Empre Pro».
  const plan = useEntityPlan(entityId, ledgerOn);
  const [goPro, setGoPro] = useState(false);
  const startCount = (sec: string, t: InventoryTab = tab) => (plan.base ? setGoPro(true) : openCount(sec, t));

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
  // La lista: con el índice, cada sección con su número y su punto; solo la abierta trae filas. Si no, una sola corrida.
  const sections: ListSection[] = useMemo(() => {
    if (grouped && tc) {
      return tc.sections.map((sc) => {
        const open = sc.name === openSection;
        const data: ListItem[] = [];
        if (open) {
          if (tab !== 'service') data.push({ pseudo: 'count' });
          if (rows.length) data.push(...rows);
          else if (pages.isFetching) data.push({ pseudo: 'loading' });
          if (pages.hasNextPage) data.push({ pseudo: 'more' });
        }
        return { title: sc.name, count: sc.count, alert: (sc.low ?? 0) + (sc.out ?? 0) > 0, open, data };
      });
    }
    return rows.length ? [{ title: '', count: 0, alert: false, open: true, data: rows }] : [];
  }, [grouped, tc, openSection, tab, rows, pages.isFetching, pages.hasNextPage]);
  const listRef = useRef<SectionList<ListItem, ListSection>>(null);
  // Tocar una sección la abre y cierra la que estaba abierta (y la deja arriba); tocar la abierta la pliega.
  const toggleSection = (name: string) => {
    const opening = name !== openSection;
    setOpenPick(opening ? name : null);
    const idx = tc?.sections.findIndex((x) => x.name === name) ?? -1;
    if (opening && idx >= 0) {
      requestAnimationFrame(() => {
        try {
          listRef.current?.scrollToLocation({ sectionIndex: idx, itemIndex: 0, viewOffset: 0, animated: true });
        } catch {
          // Si aún no se midió, se queda donde está.
        }
      });
    }
  };
  // Sin títulos de sección (pocos, buscando u ordenando) la sección va en cada fila, salvo que todas compartan la misma:
  // lo que comparten todas no se repite debajo de cada una.
  const mixedSections = useMemo(() => new Set(rows.map((r) => r.section || '')).size > 1, [rows]);
  // «Sin asignar» (un insumo que ningún producto usa) solo dice algo si otros sí están asignados.
  const someAssigned = useMemo(() => rows.some((r) => (r.used_in ?? []).length > 0), [rows]);

  // Lo del conteo: la sección elegida, si el conteo a medias es de ella y la que más tiempo lleva sin contarse.
  const sectionRow = openSection ? tc?.sections.find((x) => x.name === openSection) : undefined;
  const draftLeft = countDraft && Object.keys(countDraft.entries).length > 0 ? { done: countDraft.rows.filter((r) => countDraft.entries[r.ref]).length, total: countDraft.rows.length } : null;
  const draftHere = Boolean(draftLeft && countDraft && countDraft.section === openSection && countDraft.tab === tab);
  const stale = tc ? staleSection(tc.sections, now) : null;

  // Lo de Inventario en el botón Empre (tablero v103, teléfono 15): contar la sección que más tiempo lleva sin contarse
  // (o la abierta). Lo que llegó o se acabó se dice en «Habla con Empre AI» (una sola entrada, tablero «Base y Empre
  // Pro»), que aquí abre en modo inventario. En Servicios no hay existencias: el menú de siempre.
  const countTarget = stale?.name ?? openSection ?? tc?.sections[0]?.name;
  const countTargetRow = countTarget ? tc?.sections.find((x) => x.name === countTarget) : undefined;
  const here: EmpreHere | undefined =
    tab === 'service' || !tc || tc.total === 0
      ? undefined
      : {
          label: 'En Inventario',
          items: [
            ...(countTarget
              ? [
                  {
                    key: 'count',
                    title: 'Contar una sección',
                    sub: stale ? `${stale.name} no se cuenta hace ${stale.days} días` : `${countTarget} · ${countedAgo(countTargetRow?.counted_at, now) ?? 'nunca contada'}`,
                    icon: 'list-outline' as const,
                    tone: 'plain' as const,
                    locked: plan.base,
                    onPress: () => openCount(countTarget),
                  },
                ]
              : []),
          ],
          onTalk: () => setVoiceOpen(true),
        };
  // La barra de abajo mide lo que el botón «Nuevo …» (el botón Empre queda centrado en ella).
  const createBarHeight = 52;

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
    setOpenPick(undefined);
    setFilterSection(undefined);
    setSort(undefined);
    setSearch('');
    setQ('');
  };
  // Un solo lugar para elegir: el filtro (cómo están y el orden). Sin nada elegido dice «Filtrar»; si no, lo elegido.
  const activeFilters = [state, sort, filterSection].filter(Boolean).length;
  const filterLabel = [filterSection, state ? STATE_LABEL[state] : null, sort ? SORTS.find((x) => x.key === sort)?.label : null].filter(Boolean).join(' · ') || 'Filtrar';
  // Con un filtro o una búsqueda, cuántos salieron (y de cuántas secciones, cuando ya llegaron todos).
  const flatSecs = new Set(rows.map((r) => (tab === 'supply' ? r.group || r.section : r.section) || '')).size;
  const flatLine = state ? `${total} ${STATE_LABEL[state].toLowerCase()}${!pages.hasNextPage && flatSecs > 1 ? ` · en ${flatSecs} secciones` : ''}` : `${total} ${total === 1 ? 'resultado' : 'resultados'}`;

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
      {/* Contar (tablero «Inventario», teléfonos 9 y 12): seguir el conteo a medias, contar la sección elegida o la que
          más tiempo lleva sin contarse. */}
      {draftLeft && countDraft && !draftHere ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Seguir contando ${countDraft.section}: vas en ${draftLeft.done} de ${draftLeft.total}`}
          onPress={() => openCount(countDraft.section, countDraft.tab)}
          style={({ pressed }) => [styles.resume, pressed && { backgroundColor: colors.well }]}
        >
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={styles.aiTitle}>{`Seguir contando ${countDraft.section}`}</Text>
            <Text style={styles.aiSub}>{`Vas en ${draftLeft.done} de ${draftLeft.total}`}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      ) : null}
      {!q && !state && tab !== 'service' && !plan.base && stale && stale.name !== openSection ? (
        <View style={styles.countCard}>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={styles.aiTitle}>{`${stale.name} no se cuenta hace ${stale.days} días`}</Text>
            <Text style={styles.aiSub}>Contar seguido evita sorpresas al cerrar el mes</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Contar ${stale.name}`} onPress={() => startCount(stale.name)} style={styles.countBtn}>
            <Text style={styles.countBtnText}>Contar</Text>
          </Pressable>
        </View>
      ) : null}
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
      {/* Buscando, primero lo que pediste (los avisos son de todo el negocio). */}
      {alerts.total > 0 && !q && tab !== 'service' ? (
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
      {!grouped && !few && (q || state) && rows.length > 0 ? <Text style={styles.meta}>{flatLine}</Text> : null}
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
      {!grouped && pages.isFetchingNextPage ? <Text style={styles.loadingMore}>{`Cargando los siguientes ${PAGE}…`}</Text> : null}
      {tab !== 'supply' && (tc?.total ?? 0) > 0 && !q && !state && !sort && (grouped || !pages.hasNextPage) ? (
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
  const empty = pages.isFetching || !counts.data || (counts.isFetching && tabTotal === 0) ? (
    <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.ink} />
  ) : pages.isError ? (
    <EmptyState icon="cloud-offline-outline" title="No pudimos cargar tu inventario" body="Revisa tu conexión e inténtalo de nuevo." action={{ title: 'Reintentar', onPress: refresh }} />
  ) : q || state || filterSection ? (
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
                placeholder={`Buscar en ${tc.total} ${tc.total === 1 ? meta.one : meta.many}`}
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
              {activeFilters ? null : <Ionicons name="options-outline" size={16} color={colors.ink} />}
              <Text style={[styles.filterText, activeFilters > 0 && { color: colors.onPrimary }]} numberOfLines={1}>
                {filterLabel}
              </Text>
              {activeFilters ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Quitar el filtro"
                  hitSlop={10}
                  onPress={() => {
                    setState(undefined);
                    setSort(undefined);
                    setFilterSection(undefined);
                  }}
                >
                  <Ionicons name="close" size={16} color={colors.ink} />
                </Pressable>
              ) : null}
            </Pressable>
          </View>
        ) : null}
      </View>

      <SectionList<ListItem, ListSection>
        ref={listRef}
        // Otra pestaña, búsqueda o filtro es otra lista: arranca desde arriba.
        key={`${tab}|${q}|${state ?? ''}|${sort ?? ''}`}
        sections={sections}
        keyExtractor={(r) => (isPseudo(r) ? r.pseudo : r.ref)}
        onScrollToIndexFailed={() => {}}
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
          // Con el índice, la sección abierta pide más con «Ver más» (el final de la lista son las otras secciones).
          if (!grouped && pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
        }}
        renderSectionHeader={({ section: s }) =>
          s.title ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: s.open }}
              accessibilityLabel={`${s.title}, ${s.count}${s.alert ? ', algo se acaba' : ''}. ${s.open ? 'Plegar' : 'Abrir'}`}
              onPress={() => toggleSection(s.title)}
              style={({ pressed }) => [styles.accHead, s.open && styles.accOpen, pressed && !s.open && { backgroundColor: colors.well }]}
            >
              <Ionicons name={s.open ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.ink} />
              <Text style={styles.accName} numberOfLines={1}>
                {s.title}
              </Text>
              {s.alert ? <View style={styles.accDot} /> : null}
              <Text style={styles.accCount}>{s.count}</Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item, index, section: s }) => {
          if (isPseudo(item)) {
            if (item.pseudo === 'count') {
              const ago = countedAgo(sectionRow?.counted_at, now);
              return (
                <View style={styles.countLine}>
                  <Text style={styles.meta}>{ago ? ago[0].toUpperCase() + ago.slice(1) : 'Nunca contada'}</Text>
                  {plan.base && !draftHere ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Contar ${s.title}. Es de Empre Pro`} accessibilityHint="Abre Pásate a Empre Pro" onPress={() => setGoPro(true)} style={[styles.countBtn, styles.countBtnLocked]}>
                      <View style={[styles.countBtnBody, { opacity: LOCKED_OPACITY }]}>
                        <Ionicons name="checkmark" size={16} color={colors.ink} />
                        <Text style={styles.countBtnText}>Contar</Text>
                      </View>
                      <ProTag />
                    </Pressable>
                  ) : (
                    <Pressable accessibilityRole="button" accessibilityLabel={draftHere ? `Seguir contando ${s.title}` : `Contar ${s.title}`} onPress={() => startCount(s.title)} style={styles.countBtn}>
                      <Ionicons name="checkmark" size={16} color={colors.ink} />
                      <Text style={styles.countBtnText}>{draftHere ? 'Seguir' : 'Contar'}</Text>
                    </Pressable>
                  )}
                </View>
              );
            }
            if (item.pseudo === 'loading') return <ActivityIndicator style={{ marginVertical: spacing.md }} color={colors.ink} />;
            const left = Math.max(0, s.count - rows.length);
            return (
              <Pressable accessibilityRole="button" onPress={() => void pages.fetchNextPage()} disabled={pages.isFetchingNextPage} style={styles.moreBtn}>
                {pages.isFetchingNextPage ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.moreText}>{`Ver ${Math.min(PAGE, left || PAGE)} más de ${s.title}`}</Text>}
              </Pressable>
            );
          }
          const i = item;
          const prev = index > 0 ? s.data[index - 1] : undefined;
          const firstRow = index === 0 || (prev !== undefined && isPseudo(prev));
          const open = expanded[i.ref] ?? Boolean(q);
          const supplyRow = tab === 'supply';
          return (
            <View style={few ? [styles.fewCard, index === 0 && styles.fewFirst, index === s.data.length - 1 && styles.fewLast] : undefined}>
              <ItemRow
                item={i}
                first={firstRow}
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

      {/* Crear lo de la pestaña y, a la derecha, el botón Empre: Empre AI va ahí, no en una tarjeta (tablero v103). */}
      <View style={[styles.createBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button title={`Nuevo ${meta.one}`} onPress={create} style={{ flex: 1 }} />
        {ledgerOn ? <EmpreButton inline bottom={insets.bottom + spacing.md + (createBarHeight - EMPRE_BUTTON_INLINE) / 2} entityId={entityId} here={here} /> : null}
      </View>

      <FilterSheet
        visible={filterOpen}
        tab={tab}
        counts={tc}
        total={pages.isPlaceholderData || !pages.data ? undefined : total}
        searching={Boolean(q)}
        state={state}
        sort={sort}
        onState={setState}
        onSort={setSort}
        sections={tc && tc.sections.length > SECTIONS_IN_FILTER ? tc.sections : []}
        section={filterSection}
        onSection={setFilterSection}
        onClear={() => {
          setState(undefined);
          setSort(undefined);
          setFilterSection(undefined);
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
      <GoProSheet visible={goPro} onClose={() => setGoPro(false)} businesses={[{ id: entityId, name: business.data?.name ?? '' }]} />
      <VoiceSheet entityId={entityId} visible={voiceOpen} onClose={() => setVoiceOpen(false)} module="inventory" hints={(names.data ?? []).map((n) => n.name)} onConfirmed={() => refresh()} />
    </View>
  );
}

/** Una ficha del filtro (tablero «Inventario»): arena si está elegida, borde si no. */
function FilterChip({ label, on, onPress, dot }: { label: string; on: boolean; onPress: () => void; dot?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={dot ? `${label}, algo se acaba` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.fChip, on && styles.fChipOn, pressed && !on && { backgroundColor: colors.well }]}
    >
      <Text style={[styles.fChipText, on && { color: colors.onPrimary }]}>{label}</Text>
      {dot ? <View style={styles.accDot} /> : null}
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
  sections,
  onSection,
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
  /** Las secciones, solo cuando son más de 8 (si no, el índice basta y no se repiten aquí). */
  sections: InventoryTabCounts['sections'];
  onState: (s: InventoryState | undefined) => void;
  onSort: (s: InventorySort | undefined) => void;
  onSection: (s: string | undefined) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [findSec, setFindSec] = useState('');
  const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const shownSecs = findSec.trim() ? sections.filter((x) => fold(x.name).includes(fold(findSec.trim())) || x.name === section) : sections;
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
  const any = Boolean(state || sort || section);
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
            {`Filtrar ${meta.many}`}
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
        {sections.length > 0 ? (
          <>
            <Text style={styles.sheetLabel}>{`Sección · ${sections.length}`}</Text>
            {sections.length > SECTION_SEARCH ? (
              <TextInput value={findSec} onChangeText={setFindSec} placeholder="Buscar sección" placeholderTextColor={colors.muted} style={styles.findSec} accessibilityLabel="Buscar sección" />
            ) : null}
            <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
              <FilterChip label="Todas" on={!section} onPress={() => onSection(undefined)} />
              {shownSecs.map((x) => (
                <FilterChip
                  key={x.name}
                  label={`${x.name} ${x.count}`}
                  dot={(x.low ?? 0) + (x.out ?? 0) > 0}
                  on={section === x.name}
                  onPress={() => onSection(section === x.name ? undefined : x.name)}
                />
              ))}
            </ScrollView>
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
  filterOn: { backgroundColor: colors.primary, borderColor: colors.primary },
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
  aiTitle: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  // Contar: la tarjeta de la sección (arena) con su botón en contorno rojo, y «Seguir contando» (blanca, con flecha).
  countCard: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: 16, backgroundColor: colors.well },
  countBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 12, borderWidth: 2, borderColor: colors.brandRef, backgroundColor: colors.surface },
  // Contar en Base: sin el aro rojo (no invita a lo que no tienes), el contenido en gris y la corona de Pro.
  countBtnLocked: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.well, paddingHorizontal: 10 },
  countBtnBody: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countBtnText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  resume: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  aiSub: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  loadingMore: { textAlign: 'center', fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted, paddingVertical: spacing.xs },
  confirm: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: colors.surface },
  confirmText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  // El índice: cada sección es un título plegable (la abierta, en arena) con su punto y su número.
  accHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  accOpen: { marginTop: 4, paddingHorizontal: 10, borderTopWidth: 0, borderRadius: 12, backgroundColor: colors.well },
  accName: { flex: 1, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  accDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brandRef },
  accCount: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted, fontVariant: ['tabular-nums'] },
  // La primera línea de la sección abierta: cuándo se contó y contarla (alineada con el nombre).
  countLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 52, paddingLeft: 28 },
  moreBtn: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.line },
  moreText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink, textDecorationLine: 'underline' },
  // Con pocos, la lista va en una sola tarjeta (tablero, teléfono 5).
  fewCard: { paddingHorizontal: spacing.md, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  fewFirst: { borderTopWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  fewLast: { borderBottomWidth: 1, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  createBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: spacing.md, paddingHorizontal: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  findSec: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.well, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink },
  fChip: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  fChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
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
