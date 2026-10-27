import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogApi } from '@/api/catalog';
import { entitiesApi } from '@/api/endpoints';
import { ledgerApi, type InventoryItem, type SetupChoice } from '@/api/ledger';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { QuickStockSheet } from '@/components/inventory/QuickStockSheet';
import { NewSupplySheet } from '@/components/inventory/NewSupplySheet';
import { Chip } from '@/components/ledger/parts';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { FEATURES } from '@/config';
import { catalogCopy, freshnessNote, listTitle, priceText, type ItemKind, type ServiceItem } from '@/lib/catalog';
import {
  COLLAPSE_OVER,
  groupInventory,
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
import { formatPesos } from '@/lib/ledger';
import { alertsLine, inventoryAlerts } from '@/lib/alerts';
import { blocksByGroup, filterByStatus, groupSummary, knownGroups, searchSupplies, type SupplyFilter } from '@/lib/supplies';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';

type Filter = 'all' | 'urgent' | 'service' | 'product';

/**
 * Lo que vendes y tus insumos, en una sola lista. Cada fila dice en una pastilla cómo está (hay, queda poco, 12 und…);
 * tocar la pastilla la ajusta en un toque y tocar la fila abre la ficha, donde vive todo lo demás.
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
  // Insumos: null = automático («Atención» si algo se acaba; si no, todos).
  const [supFilter, setSupFilter] = useState<SupplyFilter | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => catalog.data ?? [], [catalog.data]);
  const tabs = useMemo(() => splitTabs(inv.data?.items ?? []), [inv.data]);
  const mixed = items.some((i) => i.kind === 'service') && items.some((i) => i.kind === 'product');
  const unchecked = items.filter((i) => i.kind_checked === false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['catalog', entityId] });
    void qc.invalidateQueries({ queryKey: ['ledger', entityId] });
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
  const blocks = useMemo(() => (filter === 'urgent' ? [] : sectionize(q ? sellBase.filter((i) => !urgentRefs.has(i.ref)) : sellBase)), [filter, sellBase, urgentRefs, q]);
  const attention = useMemo(() => filterByStatus(tabs.supplies, 'attention').length, [tabs.supplies]);
  const supFilterNow: SupplyFilter = supFilter ?? (attention > 0 && tabs.supplies.length > COLLAPSE_OVER ? 'attention' : 'all');
  const supplyList = useMemo(() => filterByStatus(q ? searchSupplies(tabs.supplies, search) : tabs.supplies, q ? 'all' : supFilterNow), [tabs.supplies, q, search, supFilterNow]);
  const supplyBlocks = useMemo(() => blocksByGroup(supplyList), [supplyList]);
  const supplyGroups = useMemo(() => knownGroups(tabs.supplies.filter((i) => i.kind === 'supply')), [tabs.supplies]);
  const outCount = useMemo(() => filterByStatus(tabs.supplies, 'out').length, [tabs.supplies]);
  const urgentCount = useMemo(() => groupInventory(nested).urgent.length, [nested]);
  const alerts = useMemo(() => inventoryAlerts(inv.data?.items ?? []), [inv.data]);

  const defaultOpen = sellBase.length <= COLLAPSE_OVER || q !== '';
  const isOpen = (key: string) => openMap[key] ?? defaultOpen;
  const toggle = (key: string) => setOpenMap((m) => ({ ...m, [key]: !(m[key] ?? defaultOpen) }));
  const more = (key: string) => setShown((m) => ({ ...m, [key]: (m[key] ?? PAGE_SIZE) + PAGE_SIZE }));

  const openDetail = (itemId?: string) =>
    router.push({ pathname: '/business/products/item', params: itemId ? { entityId, itemId } : { entityId } });

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
                group={i.children.length > 0 ? { pill: variantPill(i), open } : undefined}
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
        {(tab === 'sell' ? tabs.sell.length : tabs.supplies.length) > 6 ? (
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
        {tab === 'sell' && tabs.sell.length > 6 && !q ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            <Chip label="Todos" selected={filter === 'all'} onPress={() => setFilter('all')} />
            {urgentCount > 0 ? <Chip label={`Se acaban · ${urgentCount}`} selected={filter === 'urgent'} onPress={() => setFilter('urgent')} /> : null}
            {mixed ? <Chip label="Servicios" selected={filter === 'service'} onPress={() => setFilter('service')} /> : null}
            {mixed ? <Chip label="Productos" selected={filter === 'product'} onPress={() => setFilter('product')} /> : null}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        {error ? <Text style={styles.error}>{error}</Text> : null}

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

            {groups.urgent.length > 0 && (filter === 'urgent' || q !== '') ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={[styles.blockTitle, { color: '#B3261E' }]}>Se acaba o ya se acabó · {groups.urgent.length}</Text>
                {rowsOf(groups.urgent, 'urgent')}
              </View>
            ) : null}

            {filter !== 'urgent'
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
                <Button
                  title="Confirmar que los precios siguen vigentes"
                  variant="secondary"
                  onPress={() => void catalogApi.confirm(entityId).then(refresh, () => setError('No pudimos confirmar los precios'))}
                />
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
                {supplyBlocks.map((b) => {
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
        <Pressable accessibilityRole="button" accessibilityLabel="Agregar un producto o servicio" onPress={() => openDetail()} style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.fabText}>Agregar</Text>
        </Pressable>
      ) : null}

      <NewSupplySheet
        visible={newSupply}
        entityId={entityId}
        groups={supplyGroups}
        existing={tabs.supplies.map((i) => i.name)}
        onClose={() => setNewSupply(false)}
        onAdded={refresh}
      />
      <QuickStockSheet
        entityId={entityId}
        item={sheet}
        groups={supplyGroups}
        onClose={() => setSheet(null)}
        onChanged={refresh}
        onOpenDetail={(i) => {
          setSheet(null);
          openDetail(i.item_id ?? i.ref);
        }}
      />
    </View>
  );
}

const PILL: Record<PillTone, { bg: string; fg: string }> = {
  ok: { bg: '#E5F5EC', fg: '#1D6B3D' },
  low: { bg: colors.accentSoft, fg: colors.accentInk },
  out: { bg: '#FDE8E8', fg: '#B3261E' },
  neutral: { bg: '#EEF2F7', fg: colors.ink },
  muted: { bg: 'transparent', fg: colors.muted },
  service: { bg: '#F1F4F9', fg: colors.muted },
};

function ItemRow({
  item,
  first,
  onOpen,
  onPill,
  supplyView,
  group,
  child,
}: {
  item: InventoryItem;
  first: boolean;
  onOpen: () => void;
  onPill: () => void;
  supplyView?: boolean;
  /** Producto con variantes: su pastilla resume y la flecha las muestra. */
  group?: { pill: { label: string; tone: PillTone }; open: boolean };
  /** Una variante, dentro de su producto. */
  child?: boolean;
}) {
  const pill = group ? group.pill : stockPill(item);
  const tone = PILL[pill.tone];
  const missing = missingIngredients(item);
  const usedIn = item.used_in ?? [];
  const meta = supplyView
    ? [item.kind === 'product' ? 'También se vende' : null, usedIn.length ? `Lo usan ${usedIn.length}` : 'Sin asignar'].filter(Boolean).join(' · ')
    : [item.price ? formatPesos(item.price) : 'Sin precio', item.servings != null ? `alcanza para ${item.servings}` : null].filter(Boolean).join(' · ');
  return (
    <View style={[styles.itemRow, !first && styles.itemLine, child && styles.childRow]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}. ${pill.label}. Abrir`} onPress={onOpen} style={styles.itemMain}>
        <Text style={styles.itemName} numberOfLines={1}>
          {child && item.variant_label ? item.variant_label : item.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
        {missing.out.length > 0 ? <Text style={styles.warn}>Falta: {missing.out.join(', ')}</Text> : missing.low.length > 0 ? <Text style={styles.warnSoft}>Queda poco: {missing.low.join(', ')}</Text> : null}
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
  top: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  segment: { flexDirection: 'row', backgroundColor: '#EEF2F7', borderRadius: 12, padding: 4 },
  segBtn: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.surface },
  segText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.muted },
  segTextOn: { color: colors.ink, fontFamily: fonts.ui.extrabold },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 46, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.bg },
  searchInput: { flex: 1, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
  meta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  setup: { gap: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: spacing.md },
  setupTitle: { fontSize: 15.5, fontFamily: fonts.display.bold, color: colors.ink },
  row: { flexDirection: 'row', gap: spacing.sm },
  linkRow: { minHeight: 40, justifyContent: 'center', alignSelf: 'center' },
  link: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.primary },
  alertCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: '#F2C9A0', overflow: 'hidden' },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  alertIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  alertLine: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.accentInk },
  alertFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, borderTopWidth: 1, borderTopColor: '#F5E6D6' },
  alertLink: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primary },
  blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  blockTitle: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.md, minHeight: 62 },
  itemLine: { borderTopWidth: 1, borderTopColor: colors.line },
  itemMain: { flex: 1, paddingVertical: spacing.sm, paddingLeft: spacing.md, minHeight: 56, justifyContent: 'center' },
  itemName: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  warn: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: '#B3261E' },
  warnSoft: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.accentInk },
  pill: { minHeight: 32, paddingHorizontal: 12, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  childRow: { marginLeft: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line },
  pillMuted: { borderWidth: 1, borderColor: colors.line },
  groupSum: { fontSize: 12, fontFamily: fonts.ui.extrabold },
  pillText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold },
  emptySupplies: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  review: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fab: { position: 'absolute', right: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 56, paddingHorizontal: 22, borderRadius: 28, backgroundColor: colors.primary, elevation: 4, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  fabText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: '#fff' },
});
