import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FEATURES } from '@/config';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { catalogApi } from '@/api/catalog';
import { entitiesApi } from '@/api/endpoints';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { catalogCopy, freshnessNote, parsePriceInput, priceText, type ServiceItem } from '@/lib/catalog';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * Catálogo del negocio (dueño): los servicios que ofrece habitualmente con su precio habitual. Un solo
 * formulario sirve para añadir y para editar. «Confirmar precios» da por vigente todo el catálogo hoy.
 * Las ofertas y promociones usan estos servicios; un precio temporal nunca se escribe aquí.
 *
 * Cada ítem puede llevar una sección («Almuerzos», «Cortes», «Calzado») para que el catálogo se agrupe en el perfil; se
 * sugieren las del tipo de negocio y las que ya usa (3.27). El nombre del catálogo cambia según el negocio.
 */
export default function CatalogEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const now = useNow(60_000);

  const catalog = useQuery({ queryKey: ['catalog', id], queryFn: () => catalogApi.list(id ?? ''), enabled: Boolean(id) });
  const business = useQuery({ queryKey: ['entity', id], queryFn: () => entitiesApi.get(id ?? ''), enabled: Boolean(id) });
  const items = useMemo(() => catalog.data ?? [], [catalog.data]);
  const copy = catalogCopy(business.data?.category?.name);
  // Secciones para elegir de un toque: las que ya usa y las sugeridas para su tipo de negocio, sin repetir.
  const sectionChoices = useMemo(() => {
    const used = items.map((i) => (i.section ?? '').trim()).filter(Boolean);
    return [...new Set([...used, ...copy.suggest])].slice(0, 8);
  }, [items, copy.suggest]);

  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [from, setFrom] = useState(false);
  const [section, setSection] = useState('');
  // Agenda (D2): duración y «se puede reservar» viven en el mismo servicio del catálogo.
  const [duration, setDuration] = useState('');
  const [bookable, setBookable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reset = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setPrice('');
    setFrom(false);
    setSection('');
    setDuration('');
    setBookable(false);
    setError(null);
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['catalog', id] });

  const startEdit = (item: ServiceItem) => {
    setEditing(item);
    setName(item.name);
    setDescription(item.description);
    setPrice(item.price === null ? '' : String(item.price));
    setFrom(item.price_from);
    setSection(item.section ?? '');
    setDuration(item.duration_min ? String(item.duration_min) : '');
    setBookable(Boolean(item.bookable));
    setError(null);
    setMessage(null);
  };

  const onSave = async () => {
    const parsed = parsePriceInput(price);
    if (name.trim().length < 2) return setError('Escribe el nombre del servicio (mínimo 2 letras)');
    if (parsed === undefined) return setError('El precio debe ser un número, por ejemplo 25.000');
    const dur = duration.trim() === '' ? 0 : Number(duration.trim());
    if (!Number.isInteger(dur) || (dur !== 0 && (dur < 5 || dur > 480))) return setError('La duración va en minutos, de 5 a 480');
    if (bookable && dur === 0) return setError('Para reservar por Empre, escribe cuánto dura');
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const input = { name: name.trim(), description: description.trim(), price: parsed, price_from: parsed === null ? false : from, section: section.trim(), duration_min: dur, bookable: FEATURES.agenda ? bookable && dur > 0 : undefined };
      if (editing) await catalogApi.update(id ?? '', editing.id, input);
      else await catalogApi.create(id ?? '', input);
      await refresh();
      setMessage(editing ? 'Servicio actualizado' : 'Servicio añadido');
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar el servicio');
    } finally {
      setSaving(false);
    }
  };

  const onRetire = (item: ServiceItem) => {
    Alert.alert('Quitar servicio', `«${item.name}» dejará de mostrarse en tu perfil.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          try {
            await catalogApi.retire(id ?? '', item.id);
            if (editing?.id === item.id) reset();
            await refresh();
          } catch (e) {
            Alert.alert('No pudimos quitar el servicio', e instanceof Error ? e.message : 'Inténtalo de nuevo.');
          }
        },
      },
    ]);
  };

  const onConfirm = async () => {
    try {
      await catalogApi.confirm(id ?? '');
      await refresh();
      setMessage('Precios confirmados hoy');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos confirmar los precios');
    }
  };

  const note = freshnessNote(items, now);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>{copy.noun === 'Servicios' ? 'Servicios y precios' : `${copy.noun} y precios`}</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>
          Lo que ofreces habitualmente y su precio habitual. Las ofertas y promociones se arman con estos servicios sin cambiar su precio.
        </Text>

        <View style={styles.form}>
          <Text style={styles.formTitle}>{editing ? 'Editar servicio' : 'Añadir servicio'}</Text>
          <TextField label="Nombre" placeholder="Corte clásico" value={name} onChangeText={setName} autoCapitalize="sentences" maxLength={80} />
          <TextField
            label="Precio habitual (opcional)"
            placeholder="25.000"
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>El precio es «desde»</Text>
            <Switch value={from} onValueChange={setFrom} disabled={parsePriceInput(price) === null} accessibilityLabel="El precio es desde" />
          </View>
          <TextField label="Duración en minutos (opcional)" placeholder="30" value={duration} onChangeText={setDuration} keyboardType="number-pad" maxLength={3} />
          {FEATURES.agenda ? (
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Se puede reservar en Empre</Text>
              <Switch value={bookable} onValueChange={setBookable} disabled={duration.trim() === ''} accessibilityLabel="Se puede reservar en Empre" />
            </View>
          ) : null}
          <TextField label="Descripción (opcional)" placeholder="Con tijera y máquina" value={description} onChangeText={setDescription} autoCapitalize="sentences" maxLength={240} />
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
          <View style={styles.formButtons}>
            <Button title={editing ? 'Guardar cambios' : 'Añadir'} onPress={() => void onSave()} loading={saving} style={styles.grow} />
            {editing ? <Button title="Cancelar" variant="secondary" onPress={reset} /> : null}
          </View>
        </View>

        {message ? (
          <Text style={styles.ok} accessibilityLiveRegion="polite">
            {message}
          </Text>
        ) : null}

        <Text style={styles.listTitle}>Tu catálogo ({items.length})</Text>
        {catalog.isLoading ? <Text style={styles.hint}>Cargando…</Text> : null}
        {!catalog.isLoading && items.length === 0 ? <Text style={styles.hint}>Aún no hay servicios. Añade el primero arriba.</Text> : null}
        {items.map((item) => {
          const priceLabel = priceText(item);
          return (
            <View key={item.id} style={styles.row}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${item.name}`} onPress={() => startEdit(item)} style={styles.rowMain}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>{[item.section, priceLabel ?? 'Sin precio publicado', item.duration_min ? `${item.duration_min} min` : null, item.bookable ? 'Se reserva' : null].filter(Boolean).join(' · ')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${item.name}`} onPress={() => onRetire(item)} style={styles.remove}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
          );
        })}

        {items.length > 0 ? (
          <View style={styles.confirmBox}>
            {note ? <Text style={styles.hint}>{note}</Text> : null}
            <Button title="Confirmar que los precios siguen vigentes" variant="secondary" onPress={() => void onConfirm()} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  content: { padding: spacing.lg, gap: spacing.md },
  hint: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  form: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  formTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  switchLabel: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  formButtons: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  error: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.danger },
  ok: { fontSize: 14, fontFamily: fonts.ui.bold, color: '#1D6B3D' },
  listTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink, marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  rowMain: { flex: 1, minHeight: 56, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  rowName: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  rowMeta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  remove: { width: 48, height: 56, alignItems: 'center', justifyContent: 'center' },
  confirmBox: { gap: spacing.sm, marginTop: spacing.sm },
  sectionChips: { gap: 6 },
  sectionChip: { minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' },
  sectionChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  sectionChipText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  sectionChipTextOn: { color: '#fff' },
});
