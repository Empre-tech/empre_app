import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { catalogApi } from '@/api/catalog';
import { ledgerApi } from '@/api/ledger';
import { Button } from '@/components/Button';
import { Chip } from '@/components/ledger/parts';
import { TextField } from '@/components/TextField';
import { FEATURES } from '@/config';
import { parsePriceInput, type CatalogCopy, type ServiceItem } from '@/lib/catalog';
import { newClientId } from '@/lib/ledger';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  entityId: string;
  copy: CatalogCopy;
  /** Producto que se edita; null = uno nuevo. */
  editing: ServiceItem | null;
  /** Secciones que ya usa el negocio (para elegirlas de un toque). */
  usedSections: string[];
  /** Se guardó: el texto es lo que se le dice al dueño. */
  /** Insumos del negocio y los que ya usa este plato (para elegirlos de un toque). */
  supplies?: { ref: string; name: string }[];
  currentIngredients?: string[];
  onSaved: (message: string) => void;
  onCancel: () => void;
}

/**
 * Un solo formulario para crear o editar un producto (o plato, o servicio). Pide solo lo que corresponde al tipo de
 * negocio: tienda → costo y cuántos hay; platos → costo; servicios → duración y reserva. El costo y las existencias se
 * guardan con el mismo producto: no hay un segundo registro.
 */
export function ProductForm({ entityId, copy, editing, usedSections, supplies = [], currentIngredients = [], onSaved, onCancel }: Props) {
  const withLedger = FEATURES.ledger;
  const showCost = withLedger && copy.kind !== 'service';
  const showStock = withLedger && copy.kind === 'shop' && !editing;
  // Solo los platos llevan ingredientes: así Empre avisa «se acabó la carne» y dice qué platos afecta.
  const showIngredients = withLedger && copy.kind === 'food';
  const showSchedule = copy.kind === 'service' || Boolean(editing?.duration_min || editing?.bookable);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [from, setFrom] = useState(false);
  const [section, setSection] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('');
  const [duration, setDuration] = useState('');
  const [bookable, setBookable] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [created, setCreated] = useState<{ ref: string; name: string }[]>([]);
  const [newSupply, setNewSupply] = useState('');
  const [addingSupply, setAddingSupply] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Al cambiar de producto, el formulario se llena con sus datos (o queda vacío si es uno nuevo).
  useEffect(() => {
    setName(editing?.name ?? '');
    setDescription(editing?.description ?? '');
    setPrice(editing?.price == null ? '' : String(editing.price));
    setFrom(editing?.price_from ?? false);
    setSection(editing?.section ?? '');
    setDuration(editing?.duration_min ? String(editing.duration_min) : '');
    setBookable(Boolean(editing?.bookable));
    setCost('');
    setStock('');
    setPicked(currentIngredients);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de producto
  }, [editing]);

  const allSupplies = useMemo(() => [...supplies, ...created.filter((c) => !supplies.some((x) => x.ref === c.ref))], [supplies, created]);
  const toggle = (ref: string) => setPicked((p) => (p.includes(ref) ? p.filter((r) => r !== ref) : [...p, ref]));
  const addSupply = async () => {
    const name = newSupply.trim();
    if (name.length < 2) return;
    setAddingSupply(true);
    setError(null);
    try {
      const sp = await ledgerApi.createSupply(entityId, { client_id: newClientId(), name, mode: 'light' });
      setCreated((c) => [...c, { ref: sp.id, name: sp.name }]);
      setPicked((p) => (p.includes(sp.id) ? p : [...p, sp.id]));
      setNewSupply('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos agregar el insumo');
    } finally {
      setAddingSupply(false);
    }
  };

  const sectionChoices = useMemo(() => [...new Set([...usedSections, ...copy.suggest])].slice(0, 8), [usedSections, copy.suggest]);

  const save = async () => {
    const parsed = parsePriceInput(price);
    if (name.trim().length < 2) return setError(`Escribe el nombre del ${copy.one} (mínimo 2 letras)`);
    if (parsed === undefined) return setError('El precio debe ser un número, por ejemplo 25.000');
    const dur = !showSchedule || duration.trim() === '' ? 0 : Number(duration.trim());
    if (!Number.isInteger(dur) || (dur !== 0 && (dur < 5 || dur > 480))) return setError('La duración va en minutos, de 5 a 480');
    if (showSchedule && bookable && dur === 0) return setError('Para reservar por Empre, escribe cuánto dura');
    const costValue = showCost ? parsePriceInput(cost) : null;
    if (costValue === undefined) return setError('El costo debe ser un número, por ejemplo 18.000');
    const stockText = showStock ? stock.trim().replace(',', '.') : '';
    const stockValue = stockText === '' ? null : Number(stockText);
    if (stockValue !== null && (!Number.isFinite(stockValue) || stockValue < 0)) return setError('Escribe cuántos tienes como un número, por ejemplo 12');

    setSaving(true);
    setError(null);
    try {
      const input = {
        name: name.trim(),
        description: description.trim(),
        price: parsed,
        price_from: parsed === null ? false : from,
        section: section.trim(),
        // Un negocio que no vende servicios no manda duración ni reserva: el servidor deja lo que ya hubiera.
        ...(showSchedule ? { duration_min: dur, bookable: FEATURES.agenda ? bookable && dur > 0 : undefined } : {}),
      };
      const saved = editing ? await catalogApi.update(entityId, editing.id, input) : await catalogApi.create(entityId, input);
      let extra = '';
      try {
        if (costValue !== null && costValue > 0) await ledgerApi.setItemCost(entityId, saved.id, costValue);
        if (stockValue !== null) await ledgerApi.adjust(entityId, { client_id: newClientId(), ref: saved.id, counted: stockValue });
        if (showIngredients && (picked.length > 0 || currentIngredients.length > 0)) await ledgerApi.setIngredients(entityId, saved.id, picked);
      } catch {
        extra = ' No pudimos guardar el costo o la cantidad: ponlos desde la lista.';
      }
      onSaved(`${editing ? 'Actualizado' : 'Añadido'}: ${saved.name}.${extra}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : `No pudimos guardar el ${copy.one}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>{editing ? `Editar ${copy.one}` : `Agregar ${copy.one}`}</Text>
      <TextField label="Nombre" placeholder={copy.example} value={name} onChangeText={setName} autoCapitalize="sentences" maxLength={80} />
      <TextField label="Precio de venta (opcional)" placeholder="25.000" value={price} onChangeText={setPrice} keyboardType="numeric" />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>El precio es «desde»</Text>
        <Switch value={from} onValueChange={setFrom} disabled={parsePriceInput(price) === null} accessibilityLabel="El precio es desde" />
      </View>
      {showCost ? <TextField label="¿Cuánto te cuesta? (opcional, solo lo ves tú)" placeholder="18.000" value={cost} onChangeText={setCost} keyboardType="numeric" /> : null}
      {showIngredients ? (
        <View style={styles.ingredients}>
          <Text style={styles.switchLabel}>¿Qué insumos usa? (opcional)</Text>
          <Text style={styles.hint}>Así te avisamos cuando se acabe alguno y sabes qué platos afecta.</Text>
          <View style={styles.wrap}>
            {allSupplies.map((sp) => (
              <Chip key={sp.ref} label={sp.name} selected={picked.includes(sp.ref)} onPress={() => toggle(sp.ref)} />
            ))}
          </View>
          <View style={styles.supplyRow}>
            <TextInput value={newSupply} onChangeText={setNewSupply} placeholder="Otro insumo (ej. arroz)" placeholderTextColor={colors.muted} style={styles.supplyInput} maxLength={60} accessibilityLabel="Nombre de un insumo nuevo" />
            <Button title="Agregar" variant="secondary" loading={addingSupply} disabled={newSupply.trim().length < 2} onPress={() => void addSupply()} />
          </View>
        </View>
      ) : null}
      {showStock ? <TextField label="¿Cuántos tienes hoy? (opcional)" placeholder="12" value={stock} onChangeText={setStock} keyboardType="decimal-pad" maxLength={7} /> : null}
      {showSchedule ? <TextField label="Duración en minutos (opcional)" placeholder="30" value={duration} onChangeText={setDuration} keyboardType="number-pad" maxLength={3} /> : null}
      {showSchedule && FEATURES.agenda ? (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Se puede reservar en Empre</Text>
          <Switch value={bookable} onValueChange={setBookable} disabled={duration.trim() === ''} accessibilityLabel="Se puede reservar en Empre" />
        </View>
      ) : null}
      <TextField label="Descripción (opcional)" placeholder={copy.kind === 'service' ? 'Con tijera y máquina' : 'Marca, tamaño, sabor…'} value={description} onChangeText={setDescription} autoCapitalize="sentences" maxLength={240} />
      <TextField label="Sección (opcional)" placeholder={copy.suggest[0] ?? 'Por ejemplo, Principales'} value={section} onChangeText={setSection} autoCapitalize="sentences" maxLength={40} />
      {sectionChoices.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionChips} keyboardShouldPersistTaps="handled">
          {sectionChoices.map((s) => {
            const on = s === section.trim();
            return (
              <Pressable key={s} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setSection(on ? '' : s)} style={[styles.sectionChip, on && styles.sectionChipOn]}>
                <Text style={[styles.sectionChipText, on && styles.sectionChipTextOn]}>{s}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.buttons}>
        <Button title={editing ? 'Guardar cambios' : 'Agregar'} onPress={() => void save()} loading={saving} style={styles.grow} />
        <Button title="Cancelar" variant="secondary" onPress={onCancel} disabled={saving} />
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  form: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  formTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  switchLabel: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  ingredients: { gap: spacing.sm },
  hint: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  supplyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  supplyInput: { flex: 1, minHeight: 48, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink, backgroundColor: colors.bg },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  error: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.danger },
  sectionChips: { gap: 6 },
  sectionChip: { minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' },
  sectionChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  sectionChipText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  sectionChipTextOn: { color: '#fff' },
});
