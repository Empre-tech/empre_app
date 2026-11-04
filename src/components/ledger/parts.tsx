import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type PartyKind } from '@/api/ledger';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { amountField, formatPesos, METHOD_LABEL, newClientId, parseAmountInput, type PayMethod } from '@/lib/ledger';
import { pesosInWords } from '@/lib/ledgerWords';
import { queueParty } from '@/ledger/ledgerStore';
import { colors, fonts, radius, softShadow, spacing } from '@/theme';

const STEP_NAMES = ['Qué', 'Cuánto', 'Cómo se pagó', 'Listo'] as const;

/** Cabecera de Venta y Gasto con el selector Venta | Gasto y los 4 pasos numerados del lienzo. */
export function LedgerStepHeader({
  title,
  kind,
  entityId,
  step,
}: {
  title: string;
  kind: 'sale' | 'expense';
  entityId: string;
  step: 1 | 2 | 3 | 4;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const switchTo = (target: 'sale' | 'expense') => {
    if (target === kind) return;
    router.replace({
      pathname: target === 'sale' ? '/business/ledger/sale/[id]' : '/business/ledger/expense/[id]',
      params: { id: entityId },
    });
  };
  return (
    <View style={[styles.headerWrap, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.headerTop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver a Finanzas"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.kindTabs} accessibilityRole="tablist" accessibilityLabel="Qué vas a registrar">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: kind === 'sale' }}
            onPress={() => switchTo('sale')}
            style={[styles.kindTab, kind === 'sale' && styles.kindTabOn]}
          >
            <Text style={[styles.kindTabText, kind === 'sale' && styles.kindTabTextOn]}>Venta</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: kind === 'expense' }}
            onPress={() => switchTo('expense')}
            style={[styles.kindTab, kind === 'expense' && styles.kindTabOn]}
          >
            <Text style={[styles.kindTabText, kind === 'expense' && styles.kindTabTextOn]}>Gasto</Text>
          </Pressable>
        </View>
      </View>

      <View
        style={styles.stepsRow}
        accessible
        accessibilityLabel={`Paso ${step} de 4: ${STEP_NAMES[step - 1]}`}
      >
        {STEP_NAMES.map((name, i) => {
          const n = i + 1;
          const past = n < step;
          const cur = n === step;
          return (
            <View key={name} style={[styles.stepCol, i < 3 && { flex: 1 }]}>
              <View style={styles.stepTopLine}>
                <View style={[styles.stepDot, past && styles.stepDotPast, cur && styles.stepDotCur]}>
                  {past ? (
                    <Ionicons name="checkmark" size={13} color={colors.surface} />
                  ) : (
                    <Text style={[styles.stepDotText, cur && styles.stepDotTextCur]}>{n}</Text>
                  )}
                </View>
                {i < 3 ? <View style={[styles.stepBar, past && styles.stepBarPast]} /> : null}
              </View>
              <Text style={[styles.stepLabel, cur && styles.stepLabelCur]} numberOfLines={1}>
                {name}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Comprobante integrado de 4 pasos (el mismo de Venta, Gasto, Canje y Agenda en el lienzo). */
export function LedgerReceipt({
  title,
  subtitle,
  voided,
  onVoid,
}: {
  title: string;
  subtitle: string;
  voided: boolean;
  onVoid?: () => void;
}) {
  return (
    <View style={[styles.rcptCard, voided && { opacity: 0.6 }]} accessibilityLiveRegion="polite">
      <View style={styles.rcptBrand}>
        <View style={styles.rcptOrigin}>
          <Ionicons name="create-outline" size={14} color={colors.muted} />
        </View>
        <View style={styles.rcptBridge}>
          <View style={styles.rcptTravelDot} />
        </View>
        <EmpreSymbol product="finance" size={26} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[styles.rcptTitle, voided && { textDecorationLine: 'line-through' }]}>{title}</Text>
        <Text style={styles.rcptSub}>{subtitle}</Text>
      </View>
      {!voided && onVoid ? (
        <Pressable accessibilityRole="button" onPress={onVoid} style={styles.rcptVoidBtn}>
          <Text style={styles.rcptVoidText}>Anular</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.chipPressed]}
    >
      {icon ? (
        <Ionicons name={icon} size={15} color={selected ? colors.selected : colors.ink} />
      ) : (
        <View style={[styles.chipDot, selected && styles.chipDotOn]} />
      )}
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
    <View style={styles.methodGrid}>
      {order.map((m) => {
        const on = value === m;
        return (
          <Pressable
            key={m}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(m)}
            style={({ pressed }) => [styles.methodTile, on && styles.methodTileOn, pressed && { opacity: 0.85 }]}
          >
            <Text style={[styles.methodTileText, on && styles.methodTileTextOn]} numberOfLines={1}>
              {expense && m === 'credit' ? 'A crédito' : METHOD_LABEL[m]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Campo de monto grande, con el valor escrito en letras debajo: así un cero de más salta a la vista. */
export function AmountField({ value, onChange, autoFocus }: { value: number; onChange: (n: number) => void; autoFocus?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.amountHalo, focused && styles.amountHaloOn]}>
      <View style={[styles.amountBox, focused && styles.amountBoxFocused]}>
        <View style={styles.amountRow}>
          <Text style={styles.amountSign}>$</Text>
          <TextInput
            value={amountField(value)}
            onChangeText={(t) => onChange(parseAmountInput(t))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.muted}
            autoFocus={autoFocus}
            style={styles.amountInput}
            accessibilityLabel="Monto en pesos"
            maxLength={13}
          />
        </View>
        {value > 0 ? (
          <View style={styles.amountWordsPill} accessibilityLiveRegion="polite">
            <Ionicons name="checkmark-circle" size={14} color={colors.verified} />
            <Text style={styles.amountWordsText}>{pesosInWords(value)}</Text>
          </View>
        ) : (
          <Text style={styles.amountHint}>Escribe el valor en pesos</Text>
        )}
      </View>
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
        <Ionicons name="person-circle-outline" size={22} color={colors.ink} />
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
  headerWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: 10,
    backgroundColor: colors.bg,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...softShadow,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontFamily: fonts.display.bold,
    color: colors.ink,
  },
  kindTabs: {
    flexDirection: 'row',
    backgroundColor: colors.selectedSoft,
    borderRadius: 12,
    padding: 3,
  },
  kindTab: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindTabOn: {
    backgroundColor: colors.surface,
  },
  kindTabText: {
    fontSize: 13,
    fontFamily: fonts.ui.extrabold,
    color: colors.muted,
  },
  kindTabTextOn: {
    color: colors.ink,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepCol: {
    gap: 5,
  },
  stepTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotPast: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  stepDotCur: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  stepDotText: {
    fontSize: 12,
    fontFamily: fonts.ui.extrabold,
    color: colors.faint,
  },
  stepDotTextCur: {
    color: colors.ink,
  },
  stepBar: {
    flex: 1,
    height: 2,
    marginHorizontal: 6,
    borderRadius: 1,
    backgroundColor: colors.line,
  },
  stepBarPast: {
    backgroundColor: colors.ink,
  },
  stepLabel: {
    fontSize: 12,
    fontFamily: fonts.ui.extrabold,
    color: colors.faint,
  },
  stepLabelCur: {
    color: colors.ink,
  },
  rcptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  rcptBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  rcptOrigin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.selectedSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rcptBridge: {
    width: 16,
    height: 2,
    backgroundColor: colors.line,
    borderRadius: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  rcptTravelDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.brand,
  },
  rcptTitle: {
    fontSize: 13.5,
    fontFamily: fonts.ui.extrabold,
    color: colors.ink,
  },
  rcptSub: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.ui.medium,
    color: colors.faint,
  },
  rcptVoidBtn: {
    minHeight: 44,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  rcptVoidText: {
    fontSize: 12,
    fontFamily: fonts.ui.bold,
    color: colors.faint,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  methodTile: {
    flex: 1,
    minWidth: 92,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  methodTileOn: {
    backgroundColor: colors.selectedSoft,
    borderColor: colors.selected,
  },
  methodTileText: {
    fontSize: 13,
    fontFamily: fonts.ui.extrabold,
    color: colors.ink,
  },
  methodTileTextOn: {
    color: colors.selected,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 15,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    ...softShadow,
  },
  chipOn: {
    backgroundColor: colors.selectedSoft,
    borderColor: colors.selected,
  },
  chipPressed: {
    backgroundColor: colors.selectedSoft,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.line,
  },
  chipDotOn: {
    backgroundColor: colors.selected,
  },
  chipText: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.ink },
  chipTextOn: { fontFamily: fonts.ui.extrabold, color: colors.selected },
  amountHalo: {
    borderRadius: radius.lg + 4,
    padding: 3,
    backgroundColor: 'transparent',
  },
  amountHaloOn: {
    backgroundColor: colors.selectedSoft,
  },
  amountBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 6,
    ...softShadow,
  },
  amountBoxFocused: {
    borderColor: colors.selected,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  amountSign: { fontSize: 30, fontFamily: fonts.display.bold, color: colors.muted, marginRight: 6 },
  amountInput: {
    flex: 1,
    fontSize: 38,
    fontFamily: fonts.display.bold,
    color: colors.ink,
    paddingVertical: 0,
    minHeight: 52,
    fontVariant: ['tabular-nums'],
  },
  amountWordsPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.verifiedSoft,
  },
  amountWordsText: {
    fontSize: 12.5,
    fontFamily: fonts.ui.extrabold,
    color: colors.verified,
  },
  amountHint: {
    fontSize: 12.5,
    fontFamily: fonts.ui.medium,
    color: colors.muted,
    minHeight: 20,
  },
  picked: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.selectedSoft, borderRadius: radius.md, padding: spacing.md },
  pickedName: { flex: 1, fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  link: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.primaryDark },
  search: { minHeight: 48, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink, backgroundColor: colors.bg },
  statTitle: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  statValue: { fontSize: 20, fontFamily: fonts.display.bold },
  statBig: { fontSize: 34, fontFamily: fonts.display.bold },
});
