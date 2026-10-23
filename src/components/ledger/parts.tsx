import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ledgerApi, type PartyKind } from '@/api/ledger';
import { amountField, formatPesos, METHOD_LABEL, newClientId, parseAmountInput, type PayMethod } from '@/lib/ledger';
import { pesosInWords } from '@/lib/ledgerWords';
import { queueParty } from '@/ledger/ledgerStore';
import { colors, fonts, radius, spacing } from '@/theme';

export function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && { opacity: 0.85 }]}
    >
      {icon ? <Ionicons name={icon} size={15} color={selected ? '#fff' : colors.primary} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const METHOD_ICON: Record<PayMethod, keyof typeof Ionicons.glyphMap> = {
  cash: 'cash-outline',
  transfer: 'phone-portrait-outline',
  card: 'card-outline',
  credit: 'time-outline',
};

/** Medios de pago. En un gasto, «Fiado» se llama «A crédito». */
export function MethodChips({ value, onChange, expense = false, noCredit = false }: { value: PayMethod; onChange: (m: PayMethod) => void; expense?: boolean; noCredit?: boolean }) {
  const order: PayMethod[] = noCredit ? ['cash', 'transfer', 'card'] : ['cash', 'transfer', 'card', 'credit'];
  return (
    <View style={styles.wrap}>
      {order.map((m) => (
        <Chip key={m} icon={METHOD_ICON[m]} label={expense && m === 'credit' ? 'A crédito' : METHOD_LABEL[m]} selected={value === m} onPress={() => onChange(m)} />
      ))}
    </View>
  );
}

/** Campo de monto grande, con el valor escrito en letras debajo: así un cero de más salta a la vista. */
export function AmountField({ value, onChange, autoFocus }: { value: number; onChange: (n: number) => void; autoFocus?: boolean }) {
  return (
    <View style={styles.amountBox}>
      <View style={styles.amountRow}>
        <Text style={styles.amountSign}>$</Text>
        <TextInput
          value={amountField(value)}
          onChangeText={(t) => onChange(parseAmountInput(t))}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={colors.muted}
          autoFocus={autoFocus}
          style={styles.amountInput}
          accessibilityLabel="Monto en pesos"
          maxLength={13}
        />
      </View>
      <Text style={styles.amountWords} accessibilityLiveRegion="polite">
        {value > 0 ? pesosInWords(value) : ' '}
      </Text>
    </View>
  );
}

export interface PartyChoice {
  id: string;
  name: string;
}

/** Elegir (o crear al vuelo) el cliente de un fiado o el proveedor de una compra a crédito. Funciona sin señal. */
export function PartyPicker({ entityId, kind, value, onChange, onNew }: { entityId: string; kind: PartyKind; value: PartyChoice | null; onChange: (p: PartyChoice | null) => void; onNew?: (name: string) => void }) {
  const [query, setQuery] = useState('');
  const [created, setCreated] = useState<PartyChoice[]>([]);
  const parties = useQuery({ queryKey: ['ledger', entityId, 'parties', kind], queryFn: () => ledgerApi.parties(entityId, { kind }), staleTime: 30_000 });

  const all = useMemo<PartyChoice[]>(() => {
    const server = (parties.data ?? []).map((p) => ({ id: p.id, name: p.name }));
    return [...created.filter((c) => !server.some((s) => s.id === c.id)), ...server];
  }, [parties.data, created]);

  const q = query.trim().toLowerCase();
  const matches = q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all;
  const exact = q ? all.some((p) => p.name.toLowerCase() === q) : true;
  const label = kind === 'customer' ? 'cliente' : 'proveedor';

  if (value) {
    return (
      <View style={styles.picked}>
        <Ionicons name="person-circle-outline" size={22} color={colors.primary} />
        <Text style={styles.pickedName} numberOfLines={1}>
          {value.name}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Cambiar ${label}`} onPress={() => onChange(null)} hitSlop={8}>
          <Text style={styles.link}>Cambiar</Text>
        </Pressable>
      </View>
    );
  }

  const add = () => {
    const name = query.trim();
    if (!name) return;
    if (onNew) {
      // El tercero lo crea el servidor al confirmar (la tarjeta de voz no depende de la cola).
      onNew(name);
      setQuery('');
      return;
    }
    const clientId = newClientId();
    queueParty(entityId, { client_id: clientId, kind, name });
    const choice = { id: clientId, name };
    setCreated((c) => [choice, ...c]);
    onChange(choice);
    setQuery('');
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={kind === 'customer' ? '¿A quién le fías? Busca o escribe un nombre' : '¿A qué proveedor? Busca o escribe un nombre'}
        placeholderTextColor={colors.muted}
        style={styles.search}
        autoCapitalize="words"
        accessibilityLabel={`Buscar ${label}`}
      />
      <View style={styles.wrap}>
        {matches.slice(0, 8).map((p) => (
          <Chip key={p.id} label={p.name} selected={false} onPress={() => onChange(p)} />
        ))}
        {query.trim() && !exact ? <Chip icon="add" label={`Agregar «${query.trim()}»`} selected={false} onPress={add} /> : null}
      </View>
    </View>
  );
}

/** Un número con su título (Vendiste / Gastaste / Utilidad). */
export function Stat({ title, value, tone = 'ink', big = false }: { title: string; value: number; tone?: 'ink' | 'good' | 'bad'; big?: boolean }) {
  const color = tone === 'good' ? colors.success : tone === 'bad' ? colors.danger : colors.ink;
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[big ? styles.statBig : styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatPesos(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.primary },
  chipTextOn: { color: '#fff' },
  amountBox: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  amountSign: { fontSize: 34, fontFamily: fonts.display.bold, color: colors.muted, marginRight: 6 },
  amountInput: { flex: 1, fontSize: 40, fontFamily: fonts.display.bold, color: colors.ink, paddingVertical: 0, minHeight: 56 },
  amountWords: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted, minHeight: 20 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md },
  pickedName: { flex: 1, fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  link: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.primary },
  search: { minHeight: 48, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink, backgroundColor: colors.bg },
  statTitle: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  statValue: { fontSize: 20, fontFamily: fonts.display.bold },
  statBig: { fontSize: 34, fontFamily: fonts.display.bold },
});
