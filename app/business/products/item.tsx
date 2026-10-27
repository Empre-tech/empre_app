import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogApi } from '@/api/catalog';
import { entitiesApi } from '@/api/endpoints';
import { ledgerApi, type InventoryItem, type StockMode } from '@/api/ledger';
import { Button } from '@/components/Button';
import { SectionSheet } from '@/components/catalog/SectionSheet';
import { QuickStockSheet } from '@/components/inventory/QuickStockSheet';
import { SupplyPicker, type NewSupply, type PickerChoice } from '@/components/inventory/SupplyPicker';
import { Chip } from '@/components/ledger/parts';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { TextField } from '@/components/TextField';
import { FEATURES } from '@/config';
import { catalogCopy, defaultItemKind, parsePriceInput, type ItemKind } from '@/lib/catalog';
import { fmtQty, itemLine, MODE_LABEL, splitTabs } from '@/lib/inventory';
import { formatPesos, newClientId } from '@/lib/ledger';
import { groupOf, marginOf, NO_GROUP, sectionCounts } from '@/lib/supplies';
import { colors, fonts, radius, spacing } from '@/theme';

const DURATIONS = [15, 30, 45, 60, 90];
const DOT: Record<string, string> = { ok: colors.success, low: colors.accent, out: colors.danger };

const TRACK: { mode: StockMode; label: string; hint: string }[] = [
  { mode: 'exact', label: 'Cuento', hint: 'cuántos hay' },
  { mode: 'light', label: 'Semáforo', hint: 'hay · poco · no' },
  { mode: 'none', label: 'No llevo', hint: 'siempre hay' },
];

/**
 * La ficha de un producto o servicio. Arriba, lo que ven los clientes (con una vista previa); después, lo que es solo
 * del dueño (costo con su ganancia y cómo lleva la cuenta); y plegado en «Más opciones», lo que usan pocos negocios.
 * Todo se guarda con un botón; los ajustes de existencias de un producto que ya existe se guardan al instante.
 */
export default function ItemScreen() {
  const { entityId: rawEntity, itemId } = useLocalSearchParams<{ entityId: string; itemId?: string }>();
  const entityId = rawEntity ?? '';
  const isNew = !itemId;
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();

  const business = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId) });
  const copy = catalogCopy(business.data?.category?.name, business.data?.business_profile);
  const catalog = useQuery({ queryKey: ['catalog', entityId], queryFn: () => catalogApi.list(entityId), enabled: Boolean(entityId) });
  const inv = useQuery({ queryKey: ['ledger', entityId, 'inventory'], queryFn: () => ledgerApi.inventory(entityId), enabled: Boolean(entityId) && FEATURES.ledger });

  const existing = useMemo(() => (itemId ? (catalog.data ?? []).find((i) => i.id === itemId) ?? null : null), [catalog.data, itemId]);
  const stock: InventoryItem | null = useMemo(() => (itemId ? (inv.data?.items ?? []).find((i) => i.ref === itemId) ?? null : null), [inv.data, itemId]);
  const supplyChoices = useMemo(() => splitTabs(inv.data?.items ?? []).supplies.filter((s) => s.ref !== itemId), [inv.data, itemId]);
  const parent = useMemo(() => (existing?.parent_id ? (catalog.data ?? []).find((i) => i.id === existing.parent_id) ?? null : null), [catalog.data, existing]);
  const variants = useMemo(() => (itemId ? (inv.data?.items ?? []).filter((i) => i.parent_id === itemId) : []), [inv.data, itemId]);
  const sections = useMemo(() => sectionCounts((catalog.data ?? []).filter((i) => i.id !== itemId)), [catalog.data, itemId]);

  const [kind, setKind] = useState<ItemKind>('product');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [from, setFrom] = useState(false);
  const [section, setSection] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState<number | null>(null);
  const [customDuration, setCustomDuration] = useState('');
  const [bookable, setBookable] = useState(false);
  const [cost, setCost] = useState('');
  const [track, setTrack] = useState<StockMode>('light');
  const [initialCount, setInitialCount] = useState('');
  const [alsoSupply, setAlsoSupply] = useState(false);
  const [recipe, setRecipe] = useState<Record<string, string>>({});
  const [newVariant, setNewVariant] = useState('');
  const [addingVariant, setAddingVariant] = useState(false);
  // Insumos nuevos elegidos aquí: se crean recién al guardar (si cancelas, no queda nada suelto).
  const [pendingSupplies, setPendingSupplies] = useState<NewSupply[]>([]);
  const [picker, setPicker] = useState(false);
  const [sectionSheet, setSectionSheet] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Llena el formulario una vez que llegan los datos (o con los valores por defecto si es nuevo).
  useEffect(() => {
    if (loaded || business.isLoading || catalog.isLoading || (FEATURES.ledger && inv.isLoading)) return;
    if (isNew) {
      // Llenado único al llegar los datos (lo protege «loaded»): no hay cascada de renders.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setKind(defaultItemKind(copy));
      // Cómo llevar la cuenta: lo que recomendamos para este tipo de negocio.
      setTrack(inv.data?.mode === 'exact' ? 'exact' : inv.data?.mode === 'none' ? 'none' : 'light');
    } else if (existing) {
      setKind(existing.kind ?? (existing.duration_min || existing.bookable ? 'service' : 'product'));
      setName(existing.parent_id ? existing.variant_label ?? '' : existing.name);
      setPrice(existing.price == null || existing.price_inherited ? '' : String(existing.price));
      setFrom(existing.price_from);
      setSection(existing.section ?? '');
      setDescription(existing.description ?? '');
      const d = existing.duration_min ?? null;
      setDuration(d);
      if (d && !DURATIONS.includes(d)) setCustomDuration(String(d));
      setBookable(Boolean(existing.bookable));
    }
    if (stock) {
      setCost(stock.cost == null ? '' : String(stock.cost));
      setAlsoSupply(Boolean(stock.also_supply));
      setRecipe(Object.fromEntries((stock.ingredients ?? []).map((g) => [g.ref, g.qty != null ? fmtQty(g.qty) : ''])));
      if (stock.also_supply) setMoreOpen(true);
    }
    setLoaded(true);
  }, [loaded, business.isLoading, catalog.isLoading, inv.isLoading, inv.data, isNew, existing, stock, copy]);

  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ['catalog', entityId] }), qc.invalidateQueries({ queryKey: ['ledger', entityId] })]);
  };

  if (!loaded) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title={isNew ? 'Agregar' : 'Cargando…'} />
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </View>
    );
  }
  if (!isNew && !existing) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="No encontrado" />
        <Text style={[styles.meta, { padding: spacing.lg }]}>Este ítem ya no está en tu lista.</Text>
      </View>
    );
  }

  const isService = kind === 'service';
  const isVariant = Boolean(existing?.parent_id);
  const isGroup = variants.length > 0;
  const withLedger = FEATURES.ledger;
  const parsedPrice = parsePriceInput(price);
  const parsedCost = parsePriceInput(cost);
  const margin = marginOf(parsedPrice ?? null, parsedCost ?? null);
  const picked = Object.keys(recipe);
  const original = stock?.ingredients ?? [];
  const recipeChanged =
    picked.length !== original.length ||
    original.some((g) => !(g.ref in recipe) || (recipe[g.ref] ?? '') !== (g.qty != null ? fmtQty(g.qty) : ''));
  const ingredientWord = copy.kind === 'food' && !isService ? 'Ingredientes' : 'Insumos que usa';
  // En restaurantes y servicios los insumos son parte del día a día: van a la vista. En una tienda, plegados.
  const suppliesUpFront = copy.kind === 'food' || isService || original.length > 0;
  const showSupplies = withLedger && !isGroup;
  const showAlsoSupply = withLedger && !isService && !isGroup;
  const sectionInfo = sections.find((s) => s.name.trim().toLowerCase() === section.trim().toLowerCase());
  const previewPrice = parsedPrice == null || parsedPrice === undefined ? 'Pregunta el precio' : `${from ? 'Desde ' : ''}${parsedPrice === 0 ? 'Gratis' : formatPesos(parsedPrice)}`;

  const choiceOf = (ref: string): PickerChoice | undefined => {
    const s = supplyChoices.find((x) => x.ref === ref);
    if (s) return { ref: s.ref, name: s.name, group: s.group, status: s.status };
    const p = pendingSupplies.find((x) => x.key === ref);
    return p ? { ref: p.key, name: p.name, group: p.group, status: 'none', pending: true } : undefined;
  };
  const pickerChoices: PickerChoice[] = [
    ...supplyChoices.map((s) => ({ ref: s.ref, name: s.name, group: s.group, status: s.status })),
    ...pendingSupplies.map((p) => ({ ref: p.key, name: p.name, group: p.group, status: 'none', pending: true })),
  ];
  const onPicked = (refs: string[], created: NewSupply[]) => {
    setRecipe((r) => Object.fromEntries(refs.map((ref) => [ref, r[ref] ?? ''])));
    setPendingSupplies((p) => [...p.filter((x) => refs.includes(x.key)), ...created]);
    setPicker(false);
  };
  const removeSupply = (ref: string) => {
    setRecipe((r) => {
      const next = { ...r };
      delete next[ref];
      return next;
    });
    setPendingSupplies((p) => p.filter((x) => x.key !== ref));
  };

  const save = async () => {
    const dur = isService ? (customDuration.trim() ? Number(customDuration.trim()) : duration ?? 0) : 0;
    if (name.trim().length < (isVariant ? 1 : 2)) return setError(isVariant ? 'Escribe la variante, por ejemplo Chocolate o Talla M.' : 'Escribe el nombre (mínimo 2 letras).');
    if (parsedPrice === undefined) return setError('El precio debe ser un número, por ejemplo 25.000.');
    if (parsedCost === undefined) return setError('El costo debe ser un número, por ejemplo 18.000.');
    if (isService && (!Number.isInteger(dur) || (dur !== 0 && (dur < 5 || dur > 480)))) return setError('La duración va en minutos, de 5 a 480.');
    if (isService && bookable && !dur) return setError('Para reservar por Empre, elige cuánto dura.');
    const countText = initialCount.trim().replace(',', '.');
    const count = countText === '' ? null : Number(countText);
    if (count !== null && (!Number.isFinite(count) || count < 0)) return setError('Escribe cuántos tienes como un número, por ejemplo 12.');
    for (const ref of picked) {
      const t = recipe[ref].trim().replace(',', '.');
      if (t !== '' && !(Number(t) > 0)) return setError('La cantidad de cada insumo debe ser un número mayor que cero.');
    }

    setSaving(true);
    setError(null);
    try {
      const input = {
        name: name.trim(),
        description: description.trim(),
        price: parsedPrice,
        price_from: parsedPrice === null ? false : from,
        section: section.trim(),
        ...(isService ? { duration_min: dur, bookable: FEATURES.agenda ? bookable && dur > 0 : undefined } : {}),
        ...(isVariant ? { variant_label: name.trim() } : {}),
      };
      const saved = isNew ? await catalogApi.create(entityId, { ...input, kind }) : await catalogApi.update(entityId, existing!.id, input);
      const problems: string[] = [];
      if (withLedger) {
        const tries: Promise<unknown>[] = [];
        if (!isService && parsedCost !== null && parsedCost !== (stock?.cost ?? null)) tries.push(ledgerApi.setItemCost(entityId, saved.id, parsedCost));
        if (!isService && isNew) {
          // Primero el modo y después el conteo (el conteo solo vale contando exacto).
          tries.push(
            ledgerApi.stockSettings(entityId, saved.id, { mode: track }).then(() =>
              track === 'exact' && count !== null ? ledgerApi.adjust(entityId, { client_id: newClientId(), ref: saved.id, counted: count }) : null,
            ),
          );
        }
        if (recipeChanged || (isNew && picked.length > 0)) {
          // Primero se crean los insumos nuevos; uno que choque con un producto (mismo nombre) se avisa y se omite.
          const lines: { ref: string; qty: number | null }[] = [];
          for (const ref of picked) {
            let real = ref;
            if (ref.startsWith('new:')) {
              const p = pendingSupplies.find((x) => x.key === ref);
              try {
                const sp = await ledgerApi.createSupply(entityId, { client_id: newClientId(), name: p?.name ?? '', mode: 'light', group: p?.group || undefined });
                real = sp.id;
              } catch (e) {
                problems.push(e instanceof Error ? e.message : `No pudimos crear «${p?.name ?? 'el insumo'}»`);
                continue;
              }
            }
            const t = (recipe[ref] ?? '').trim().replace(',', '.');
            lines.push({ ref: real, qty: t === '' ? null : Number(t) });
          }
          tries.push(ledgerApi.setRecipe(entityId, saved.id, lines));
        }
        if (!isService && alsoSupply !== Boolean(stock?.also_supply)) tries.push(ledgerApi.stockSettings(entityId, saved.id, { also_supply: alsoSupply }));
        const results = await Promise.allSettled(tries);
        results.forEach((r) => r.status === 'rejected' && problems.push(r.reason instanceof Error ? r.reason.message : 'error'));
      }
      await refresh();
      if (problems.length > 0) {
        setError(`Se guardó, pero no todo: ${problems[0]}`);
        setSaving(false);
        return;
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar.');
      setSaving(false);
    }
  };

  const addVariant = async () => {
    const label = newVariant.trim();
    if (!existing || label.length < 1) return;
    setAddingVariant(true);
    setError(null);
    try {
      await catalogApi.create(entityId, { name: label, price: null, price_from: false, parent_id: existing.id, variant_label: label });
      await refresh();
      setNewVariant('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos agregar la variante.');
    } finally {
      setAddingVariant(false);
    }
  };

  const changeKind = () => {
    if (!existing) return;
    const to: ItemKind = isService ? 'product' : 'service';
    Alert.alert(
      to === 'service' ? 'Cambiar a servicio' : 'Cambiar a producto',
      to === 'service'
        ? 'Un servicio no lleva inventario: sus existencias se guardan aparte (no se borran) y deja de verse agotado.'
        : 'Un producto se cuenta. Si antes tenía existencias, vuelven con su historia. Pierde la duración y la reserva.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cambiar',
          onPress: async () => {
            try {
              await catalogApi.setKind(entityId, existing.id, to);
              await refresh();
              setKind(to);
              if (to === 'product') {
                setDuration(null);
                setCustomDuration('');
                setBookable(false);
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : 'No pudimos cambiarlo.');
            }
          },
        },
      ],
    );
  };

  const retire = () => {
    if (!existing) return;
    Alert.alert('Quitar', `«${existing.name}» dejará de mostrarse en tu perfil. Sus ventas pasadas se conservan.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          try {
            await catalogApi.retire(entityId, existing.id);
            await refresh();
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'No pudimos quitarlo.');
          }
        },
      },
    ]);
  };

  const step = (d: number) => {
    const n = Number(initialCount.replace(',', '.'));
    setInitialCount(fmtQty(Math.max(0, (Number.isFinite(n) ? n : 0) + d)));
  };

  const suppliesBlock = (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.meta}>
        {copy.kind === 'food' && !isService
          ? 'Te avisamos cuando falte alguno para prepararlo.'
          : isService
            ? 'Lo que gastas al atender (tinte, champú…). Te avisamos si se acaba.'
            : 'Para productos que armas tú, como una canasta o un combo. Te avisamos si falta alguno.'}{' '}
        Si pones cuánto lleva cada {isService ? 'servicio' : 'uno'}, también se descuenta al vender.
      </Text>
      {picked.map((ref) => {
        const c = choiceOf(ref);
        const s = supplyChoices.find((x) => x.ref === ref);
        const unit = !s?.unit || s.unit === 'unidad' ? 'und' : s.unit;
        const label = c?.name ?? 'Insumo';
        return (
          <View key={ref} style={styles.supplyRow}>
            <View style={[styles.dot, { backgroundColor: DOT[c?.status ?? ''] ?? colors.line }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel} numberOfLines={1}>
                {label}
              </Text>
              <Text style={styles.metaSmall} numberOfLines={1}>
                {c?.pending ? `Nuevo${c.group ? ` · ${c.group}` : ''} · se crea al guardar` : groupOf(c ?? { name: '' }) === NO_GROUP ? 'Sin grupo' : groupOf(c!)}
              </Text>
            </View>
            <TextInput
              value={recipe[ref]}
              onChangeText={(t) => setRecipe((r) => ({ ...r, [ref]: t }))}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor={colors.muted}
              style={styles.qty}
              accessibilityLabel={`Cuánto ${label} lleva cada uno`}
            />
            <Text style={[styles.metaSmall, { width: 34 }]}>{unit}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${label}`} onPress={() => removeSupply(ref)} hitSlop={6} style={styles.remove}>
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>
        );
      })}
      {picked.some((ref) => recipe[ref].trim() !== '') ? <Text style={styles.metaSmall}>La cantidad es opcional. Solo se descuenta de los insumos que cuentas en cantidad exacta.</Text> : null}
      <Pressable accessibilityRole="button" onPress={() => setPicker(true)} style={styles.pickBtn}>
        <Ionicons name="search" size={18} color={colors.primary} />
        <Text style={styles.pickText}>{picked.length ? 'Buscar o agregar insumos' : 'Elegir insumos'}</Text>
      </Pressable>
    </View>
  );

  const alsoSupplyRow = (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.switchLabel}>También lo uso yo</Text>
        <Text style={styles.metaSmall}>
          Lo vendes y además lo gastas en tu trabajo ({copy.kind === 'food' ? 'ej.: la gaseosa de tus combos' : 'ej.: el champú con el que lavas'}). Es una sola existencia: baja al venderlo y al usarlo.
        </Text>
      </View>
      <Switch value={alsoSupply} onValueChange={setAlsoSupply} accessibilityLabel="También lo uso yo" />
    </View>
  );

  const moreItems = [!suppliesUpFront && showSupplies ? 'insumos que lleva' : null, showAlsoSupply ? 'si también lo usas tú' : null].filter(Boolean) as string[];

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubScreenHeader title={isNew ? 'Agregar' : isVariant ? existing!.variant_label ?? existing!.name : existing!.name} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        {isNew ? (
          <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel="Qué vas a agregar">
            {(
              [
                ['product', 'Producto', 'Se cuenta y se agota'],
                ['service', 'Servicio', 'Un corte, una clase'],
              ] as const
            ).map(([k, label, hint]) => (
              <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: kind === k }} onPress={() => setKind(k)} style={[styles.segBtn, kind === k && styles.segOn]}>
                <Text style={[styles.segLabel, kind === k && { color: colors.primary }]}>{label}</Text>
                <Text style={styles.segHint}>{hint}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Ionicons name="eye-outline" size={17} color={colors.muted} />
            <Text style={styles.cardTitle}>Lo que ven tus clientes</Text>
          </View>
          {isVariant && parent ? <Text style={styles.meta}>Variante de «{parent.name}»</Text> : null}
          <TextField
            label={isVariant ? 'Variante' : 'Nombre'}
            placeholder={isVariant ? 'Chocolate' : isService ? 'Corte clásico' : copy.kind === 'food' ? 'Bandeja paisa' : 'Arroz 500 g'}
            value={name}
            onChangeText={setName}
            autoCapitalize="sentences"
            maxLength={isVariant ? 40 : 80}
          />

          <View style={{ gap: spacing.xs }}>
            <Text style={styles.fieldLabel}>{isVariant ? 'Precio (si es distinto)' : 'Precio'}</Text>
            <View style={styles.priceRow}>
              <View style={styles.money}>
                <Text style={styles.moneySign}>$</Text>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                  placeholder={isVariant && parent?.price != null ? `${fmtQty(parent.price)} (igual)` : '25.000'}
                  placeholderTextColor={colors.muted}
                  style={styles.moneyInput}
                  accessibilityLabel="Precio"
                />
              </View>
              <View style={styles.miniSeg} accessibilityRole="radiogroup" accessibilityLabel="Tipo de precio">
                {(
                  [
                    [false, 'Fijo'],
                    [true, 'Desde'],
                  ] as const
                ).map(([v, label]) => (
                  <Pressable
                    key={label}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: from === v, disabled: parsedPrice == null }}
                    disabled={parsedPrice == null}
                    onPress={() => setFrom(v)}
                    style={[styles.miniBtn, from === v && styles.miniOn]}
                  >
                    <Text style={[styles.miniText, from === v && styles.miniTextOn]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Text style={styles.metaSmall}>
              {parsedPrice == null ? 'Vacío: tu perfil dice «Pregunta el precio».' : from ? `Tu perfil dice «Desde ${formatPesos(parsedPrice)}»: el precio final puede ser mayor.` : 'Siempre cuesta eso.'}
            </Text>
          </View>

          {!isVariant ? (
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.fieldLabel}>Sección</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Sección: ${section.trim() || 'sin sección'}. Cambiar`} onPress={() => setSectionSheet(true)} style={styles.select}>
                {section.trim() ? (
                  <>
                    <View style={styles.sectionPill}>
                      <Text style={styles.sectionPillText}>{section.trim()}</Text>
                    </View>
                    <Text style={[styles.metaSmall, { flex: 1 }]} numberOfLines={1}>
                      {sectionInfo ? `con ${sectionInfo.count} ${sectionInfo.count === 1 ? 'producto más' : 'productos más'}` : 'sección nueva'}
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.placeholder, { flex: 1 }]}>{sections.length ? 'Elige una de tus secciones' : 'Elige o crea una sección'}</Text>
                )}
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            </View>
          ) : null}

          <TextField
            label="Descripción (opcional)"
            placeholder={isService ? 'Con tijera y máquina' : 'Marca, tamaño, sabor…'}
            value={description}
            onChangeText={setDescription}
            autoCapitalize="sentences"
            maxLength={240}
            multiline
            style={{ minHeight: 72, textAlignVertical: 'top', paddingTop: spacing.sm }}
          />

          {name.trim().length >= 2 ? (
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.metaSmall}>Así se ve en tu perfil</Text>
              <View style={styles.preview}>
                <View style={styles.previewIcon}>
                  <Ionicons name={isService ? 'cut-outline' : 'cube-outline'} size={20} color={colors.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewName} numberOfLines={1}>
                    {isVariant && parent ? `${parent.name} · ${name.trim()}` : name.trim()}
                  </Text>
                  {description.trim() ? (
                    <Text style={styles.metaSmall} numberOfLines={1}>
                      {description.trim()}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.previewPrice, parsedPrice == null && { color: colors.muted, fontSize: 12.5 }]}>{previewPrice}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {isService ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Agenda</Text>
            <Text style={styles.meta}>Cuánto dura</Text>
            <View style={styles.wrap}>
              {DURATIONS.map((d) => (
                <Chip
                  key={d}
                  label={d < 60 ? `${d} min` : d === 60 ? '1 h' : `${d / 60} h`.replace('.', ',')}
                  selected={!customDuration && duration === d}
                  onPress={() => {
                    setCustomDuration('');
                    setDuration(duration === d ? null : d);
                  }}
                />
              ))}
            </View>
            <TextField label="Otra duración, en minutos (opcional)" placeholder="40" value={customDuration} onChangeText={setCustomDuration} keyboardType="number-pad" maxLength={3} />
            {FEATURES.agenda ? (
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Se puede reservar en Empre</Text>
                  <Text style={styles.metaSmall}>Tus clientes eligen la hora desde tu perfil</Text>
                </View>
                <Switch value={bookable} onValueChange={setBookable} disabled={!duration && !customDuration.trim()} accessibilityLabel="Se puede reservar en Empre" />
              </View>
            ) : null}
          </View>
        ) : null}

        {!isService && withLedger ? (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.muted} />
              <Text style={styles.cardTitle}>Solo para ti · tus clientes no lo ven</Text>
            </View>

            <View style={{ gap: spacing.xs }}>
              <Text style={styles.fieldLabel}>¿Cuánto te cuesta a ti?</Text>
              <View style={styles.money}>
                <Text style={styles.moneySign}>$</Text>
                <TextInput value={cost} onChangeText={setCost} keyboardType="numeric" placeholder="18.000" placeholderTextColor={colors.muted} style={styles.moneyInput} accessibilityLabel="Cuánto te cuesta" />
                <Text style={styles.metaSmall}>por unidad</Text>
              </View>
              {margin ? (
                <View style={[styles.margin, margin.amount < 0 ? styles.marginBad : styles.marginOk]}>
                  <Ionicons name={margin.amount < 0 ? 'alert-circle-outline' : 'trending-up'} size={18} color={margin.amount < 0 ? '#B3261E' : '#1D6B3D'} />
                  <Text style={[styles.marginText, { color: margin.amount < 0 ? '#B3261E' : '#1D6B3D' }]}>
                    {margin.amount < 0
                      ? `Pierdes ${formatPesos(-margin.amount)} en cada uno. ¿Revisas el precio?`
                      : margin.amount === 0
                        ? 'Lo vendes al mismo precio que te cuesta: no ganas nada.'
                        : `Ganas ${formatPesos(margin.amount)} por cada uno (${margin.pct} %)`}
                  </Text>
                </View>
              ) : parsedPrice == null && parsedCost ? (
                <Text style={styles.metaSmall}>Ponle precio y te decimos cuánto ganas.</Text>
              ) : null}
            </View>

            <View style={styles.divider} />

            {isGroup ? (
              <Text style={styles.meta}>Cada variante se cuenta por separado: ajústalas abajo, en Variantes.</Text>
            ) : isNew ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.fieldLabel}>¿Cómo llevas la cuenta?</Text>
                <View style={styles.trackRow} accessibilityRole="radiogroup">
                  {TRACK.map((t) => (
                    <Pressable key={t.mode} accessibilityRole="radio" accessibilityState={{ checked: track === t.mode }} onPress={() => setTrack(t.mode)} style={[styles.trackBtn, track === t.mode && styles.trackOn]}>
                      <Text style={[styles.trackLabel, track === t.mode && { color: colors.primaryDark }]}>{t.label}</Text>
                      <Text style={[styles.trackHint, track === t.mode && { color: colors.primaryDark }]}>{t.hint}</Text>
                    </Pressable>
                  ))}
                </View>
                {track === 'exact' ? (
                  <>
                    <View style={styles.stepper}>
                      <Pressable accessibilityRole="button" accessibilityLabel="Uno menos" onPress={() => step(-1)} style={styles.stepBtn}>
                        <Ionicons name="remove" size={22} color={colors.ink} />
                      </Pressable>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <TextInput
                          value={initialCount}
                          onChangeText={setInitialCount}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={colors.muted}
                          style={styles.count}
                          maxLength={7}
                          accessibilityLabel="Cuántos tienes hoy"
                        />
                        <Text style={styles.metaSmall}>tienes hoy</Text>
                      </View>
                      <Pressable accessibilityRole="button" accessibilityLabel="Uno más" onPress={() => step(1)} style={styles.stepBtn}>
                        <Ionicons name="add" size={22} color={colors.ink} />
                      </Pressable>
                    </View>
                    <Text style={[styles.metaSmall, { textAlign: 'center' }]}>Baja solo cada vez que vendes uno.</Text>
                  </>
                ) : (
                  <Text style={styles.metaSmall}>
                    {track === 'light' ? 'Marcas «hay», «queda poco» o «se acabó» cuando cambie. Si se acaba, tus clientes lo ven agotado.' : 'No te avisamos cuándo se acaba. Puedes cambiarlo cuando quieras.'}
                  </Text>
                )}
              </View>
            ) : stock ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.fieldLabel}>Cuántos tienes</Text>
                <Pressable accessibilityRole="button" onPress={() => setSheet(true)} style={styles.stockRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stockBig}>{stock.mode === 'none' || stock.mode === 'unset' ? 'Sin control' : itemLine(stock)}</Text>
                    <Text style={styles.metaSmall}>
                      {stock.mode === 'none' || stock.mode === 'unset' ? 'Toca para saber cuándo se acaba' : `Control: ${MODE_LABEL[stock.mode]} · se actualiza solo al vender`}
                    </Text>
                  </View>
                  <Text style={styles.link}>Ajustar</Text>
                </Pressable>
                {stock.servings != null ? (
                  <Text style={styles.meta}>
                    Con tus insumos alcanza para {stock.servings}. Lo que limita: {stock.limit}.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {!isService && !isNew && !isVariant ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Variantes (opcional)</Text>
            <Text style={styles.meta}>Sabores, tallas o tamaños. Cada una lleva su propia cantidad; si no le pones precio, usa el del producto.</Text>
            {variants.map((v) => (
              <Pressable
                key={v.ref}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/business/products/item', params: { entityId, itemId: v.ref } })}
                style={styles.variantRow}
              >
                <Text style={[styles.switchLabel, { flex: 1 }]} numberOfLines={1}>
                  {v.variant_label ?? v.name}
                </Text>
                <Text style={styles.metaSmall}>{v.mode === 'none' || v.mode === 'unset' ? 'Sin control' : itemLine(v)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ))}
            <View style={styles.inlineRow}>
              <TextInput
                value={newVariant}
                onChangeText={setNewVariant}
                placeholder={variants.length ? 'Otra variante' : 'Ej. Chocolate, Talla M'}
                placeholderTextColor={colors.muted}
                style={styles.input}
                maxLength={40}
                accessibilityLabel="Nombre de una variante nueva"
              />
              <Button title="Agregar" variant="secondary" loading={addingVariant} disabled={newVariant.trim().length < 1} onPress={() => void addVariant()} />
            </View>
            {variants.length === 0 && stock?.counted ? <Text style={styles.metaSmall}>Al agregar variantes, el producto deja de contarse: cuenta cada variante.</Text> : null}
          </View>
        ) : null}

        {showSupplies && suppliesUpFront ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {ingredientWord}
              {picked.length ? ` · ${picked.length}` : ' (opcional)'}
            </Text>
            {suppliesBlock}
          </View>
        ) : null}

        {moreItems.length > 0 ? (
          <View style={[styles.card, { padding: 0, gap: 0 }]}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: moreOpen }} onPress={() => setMoreOpen((v) => !v)} style={styles.moreHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.moreTitle}>Más opciones</Text>
                {!moreOpen ? <Text style={styles.metaSmall}>{moreItems.join(' · ').replace(/^./, (c) => c.toUpperCase())}</Text> : null}
              </View>
              {!moreOpen ? <Text style={styles.metaSmall}>{[!suppliesUpFront && picked.length ? `${picked.length} insumos` : null, alsoSupply ? 'Lo usas tú' : null].filter(Boolean).join(' · ') || 'Ninguna'}</Text> : null}
              <Ionicons name={moreOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
            </Pressable>
            {moreOpen ? (
              <View style={styles.moreBody}>
                {!suppliesUpFront && showSupplies ? (
                  <View style={{ gap: spacing.sm }}>
                    <Text style={styles.fieldLabel}>¿Lleva insumos?</Text>
                    {suppliesBlock}
                  </View>
                ) : null}
                {!suppliesUpFront && showSupplies && showAlsoSupply ? <View style={styles.divider} /> : null}
                {showAlsoSupply ? alsoSupplyRow : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {stock && stock.sold_28 > 0 ? <Text style={styles.meta}>Vendiste {fmtQty(stock.sold_28)} en las últimas 4 semanas.</Text> : null}

        {!isNew ? (
          <View style={{ gap: spacing.xs }}>
            {!isVariant && !isGroup ? <Button title={isService ? 'Cambiar a producto' : 'Cambiar a servicio'} variant="secondary" onPress={changeKind} /> : null}
            <Button title="Quitar" variant="ghost" onPress={retire} />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title={isNew ? (isService ? 'Agregar servicio' : 'Agregar producto') : 'Guardar'} loading={saving} onPress={() => void save()} />
      </View>

      <QuickStockSheet entityId={entityId} item={sheet ? stock : null} onClose={() => setSheet(false)} onChanged={() => void refresh()} />
      <SupplyPicker visible={picker} forName={name.trim()} choices={pickerChoices} selected={picked} onClose={() => setPicker(false)} onDone={onPicked} />
      <SectionSheet visible={sectionSheet} value={section} sections={sections} ideas={copy.suggest} onPick={setSection} onClose={() => setSectionSheet(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  fieldLabel: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  meta: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  metaSmall: { fontSize: 12, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.muted },
  placeholder: { fontSize: 15, fontFamily: fonts.ui.medium, color: colors.muted },
  segment: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.md, backgroundColor: '#E8EEF6' },
  segBtn: { flex: 1, minHeight: 52, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.surface, elevation: 1, shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segLabel: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  segHint: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: '#55657C' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  money: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 50, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  moneySign: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.muted },
  moneyInput: { flex: 1, fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.ink, paddingVertical: 0 },
  miniSeg: { flexDirection: 'row', padding: 3, borderRadius: radius.md, backgroundColor: '#E8EEF6' },
  miniBtn: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  miniOn: { backgroundColor: colors.surface },
  miniText: { fontSize: 13, fontFamily: fonts.ui.bold, color: '#55657C' },
  miniTextOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  select: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, paddingHorizontal: spacing.md },
  sectionPill: { minHeight: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.primarySoft, justifyContent: 'center' },
  sectionPillText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  preview: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.bg },
  previewIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  previewName: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  previewPrice: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  margin: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md },
  marginOk: { backgroundColor: '#E7F5EC' },
  marginBad: { backgroundColor: '#FDE8E8' },
  marginText: { flex: 1, fontSize: 13.5, fontFamily: fonts.ui.extrabold },
  divider: { height: 1, backgroundColor: '#EEF2F7' },
  trackRow: { flexDirection: 'row', gap: 6 },
  trackBtn: { flex: 1, minHeight: 56, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', padding: 6 },
  trackOn: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  trackLabel: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  trackHint: { fontSize: 11, fontFamily: fonts.ui.bold, color: '#55657C' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: { width: 52, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 30, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center', minWidth: 120, paddingVertical: 0 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  switchLabel: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.bg, minHeight: 64 },
  stockBig: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  link: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primary },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  supplyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  remove: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pickBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pickText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.primary },
  variantRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, borderTopWidth: 1, borderTopColor: colors.line },
  qty: { width: 64, minHeight: 42, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.xs, fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink, textAlign: 'center', backgroundColor: colors.bg },
  input: { flex: 1, minHeight: 48, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink, backgroundColor: colors.bg },
  moreHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 64, paddingHorizontal: spacing.md },
  moreTitle: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  moreBody: { gap: spacing.md, padding: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: '#EEF2F7' },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
});
