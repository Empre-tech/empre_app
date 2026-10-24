import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { PayMethod } from '@/api/ledger';
import { bumpLine, draftTotal, qtyOf, removeLine, type DraftLine } from '@/lib/finance';
import { EXPENSE_CATEGORIES, formatPesos, MAX_AMOUNT } from '@/lib/ledger';
import type { KnownItem } from '@/finance/useFinance';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import { HoldButton } from './HoldButton';
import { RollingNumber } from './RollingNumber';

// Panel de venta o gasto dentro del vidrio (3.45). Tres caminos que se suman en el mismo borrador: lo conocido
// (catálogo o gastos «de siempre»), lo distinto a mano y lo distinto por voz. Nada se registra hasta mantener pulsado.

type Tab = 'known' | 'man' | 'chat';

const METHODS: { key: PayMethod; label: string }[] = [
  { key: 'cash', label: 'Efectivo' },
  { key: 'transfer', label: 'Transfer.' },
  { key: 'card', label: 'Tarjeta' },
];

const CATS = ['mercancia', 'transporte', 'servicios', 'arriendo', 'otro'];

const KEY_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['000', '0', 'del'],
];

let manualSeq = 0;

export function MoneyPanel({
  kind,
  initialTab,
  businessName,
  known,
  draft,
  onDraft,
  method,
  onMethod,
  onBack,
  onVoice,
  onFiado,
  onRegister,
  onSay,
}: {
  kind: 'sale' | 'expense';
  /** Solo para el banco de capturas: abrir en una pestaña. */
  initialTab?: Tab;
  businessName: string;
  known: KnownItem[];
  draft: DraftLine[];
  onDraft: (d: DraftLine[]) => void;
  method: PayMethod;
  onMethod: (m: PayMethod) => void;
  onBack: () => void;
  onVoice: () => void;
  onFiado: () => void;
  onRegister: () => void;
  onSay: (text: string) => void;
}) {
  const sale = kind === 'sale';
  const [tab, setTab] = useState<Tab>(initialTab ?? (known.length > 0 ? 'known' : 'man'));
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState(0);
  const [cat, setCat] = useState('mercancia');
  const total = draftTotal(draft);
  const tone = sale ? 'in' : 'out';
  const sign = sale ? '' : '−';

  const press = (k: string) =>
    setAmount((v) => (k === 'del' ? Math.floor(v / 10) : k === '000' ? Math.min(v * 1000, MAX_AMOUNT) : Math.min(v * 10 + Number(k), MAX_AMOUNT)));

  const addManual = () => {
    if (amount <= 0) return;
    const name = desc.trim() || (sale ? 'Otro' : (EXPENSE_CATEGORIES.find((c) => c.key === cat)?.label ?? 'Gasto'));
    onDraft([...draft, { key: `man:${++manualSeq}`, name, qty: 1, unitPrice: amount, category: sale ? undefined : cat, source: 'manual' }]);
    setAmount(0);
    setDesc('');
    onSay(`${name} agregado. Sigue sumando o mantén el botón para registrar.`);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} style={styles.back} hitSlop={6}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} accessibilityRole="header">
            {sale ? 'Venta' : 'Gasto'}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {sale ? 'en ' : 'Sale de '}
            {businessName}
          </Text>
        </View>
      </View>

      <View style={styles.amountRow}>
        <RollingNumber value={total} prefix={total > 0 ? sign : ''} style={{ ...styles.amount, color: sale ? colors.successInk : colors.accentInk }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lines} accessibilityLabel={sale ? 'Lo que lleva la venta' : 'Lo que lleva el gasto'}>
        {draft.length === 0 ? (
          <Text style={styles.linesEmpty}>{sale ? 'Elige un servicio, escríbelo o dilo' : 'Elige uno de siempre, escríbelo o dilo'}</Text>
        ) : (
          draft.map((l) => (
            <View key={l.key} style={[styles.line, sale ? styles.lineIn : styles.lineOut]}>
              <Text style={[styles.lineText, { color: sale ? colors.successInk : colors.accentInk }]} numberOfLines={1}>
                {l.qty > 1 ? `${l.qty} × ` : ''}
                {l.name}
                {l.source !== 'known' ? ` ${formatPesos(l.unitPrice)}` : ''}
                {l.source === 'manual' ? '  · a mano' : l.source === 'voice' ? '  · por voz' : ''}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${l.name}`} onPress={() => onDraft(removeLine(draft, l.key))} style={styles.lineX} hitSlop={6}>
                <Ionicons name="close" size={13} color={colors.ink} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.tabs} accessibilityRole="tablist">
        {(
          [
            ['known', sale ? 'Servicios' : 'De siempre', null],
            ['man', 'Manual', 'create-outline'],
            ['chat', 'Por chat', 'mic-outline'],
          ] as const
        ).map(([key, label, icon]) => (
          <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabOn]}>
            {icon ? <Ionicons name={icon} size={15} color={tab === key ? colors.ink : colors.muted} /> : null}
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.pane}>
        {tab === 'known' ? (
          known.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.centerTitle}>{sale ? 'Aún no hay servicios con precio' : 'Aún no hay gastos repetidos'}</Text>
              <Text style={styles.centerBody}>{sale ? 'Agrégalos en el catálogo de tu perfil. Mientras tanto, usa «Manual».' : 'Cuando registres el mismo gasto dos veces, aparece aquí.'}</Text>
            </View>
          ) : (
            <ScrollView style={styles.rows} contentContainerStyle={{ paddingHorizontal: 12 }}>
              {known.map((it, i) => {
                const n = qtyOf(draft, it.key);
                const line = { key: it.key, name: it.name, unitPrice: it.price, itemId: it.itemId, category: it.category, source: 'known' as const };
                return (
                  <View key={it.key} style={[styles.row, i > 0 && styles.rowLine]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {it.name}
                      </Text>
                      <Text style={styles.rowPrice}>
                        {sign}
                        {formatPesos(it.price)}
                      </Text>
                    </View>
                    <View style={styles.step}>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Quitar uno de ${it.name}`} disabled={n === 0} onPress={() => onDraft(bumpLine(draft, line, -1))} style={styles.stepBtn}>
                        <Ionicons name="remove" size={18} color={n === 0 ? colors.mutedLight : colors.ink} />
                      </Pressable>
                      <Text style={[styles.stepN, n === 0 && { color: colors.muted }]} accessibilityLabel={`${n} de ${it.name}`}>
                        {n}
                      </Text>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Agregar uno de ${it.name}`} onPress={() => onDraft(bumpLine(draft, line, 1))} style={[styles.stepBtn, sale ? styles.plusIn : styles.plusOut]}>
                        <Ionicons name="add" size={18} color={sale ? colors.white : colors.accentDeep} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )
        ) : tab === 'man' ? (
          <View style={{ gap: 6 }}>
            {!sale ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} accessibilityRole="radiogroup">
                {CATS.map((c) => (
                  <Pressable key={c} accessibilityRole="radio" accessibilityState={{ checked: cat === c }} onPress={() => setCat(c)} style={[styles.cat, cat === c && styles.catOn]}>
                    <Text style={[styles.catText, cat === c && { color: colors.accentInk }]}>{EXPENSE_CATEGORIES.find((x) => x.key === c)?.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.field}>
              <TextInput value={desc} onChangeText={setDesc} placeholder={sale ? '¿Qué vendiste? Ej.: arreglo de barba' : '¿Qué fue? (opcional)'} placeholderTextColor={colors.muted} style={styles.input} maxLength={80} accessibilityLabel={sale ? 'Qué vendiste' : 'Qué fue el gasto'} />
              <RollingNumber value={amount} style={{ ...styles.fieldAmount, color: sale ? colors.successInk : colors.accentInk }} />
            </View>
            <View style={styles.keys}>
              {KEY_ROWS.map((row) => (
                <View key={row.join('')} style={styles.keyRow}>
                  {row.map((k) => (
                    <Pressable key={k} accessibilityRole="button" accessibilityLabel={k === 'del' ? 'Borrar' : k} onPress={() => press(k)} style={({ pressed }) => [styles.key, pressed && styles.keyDown]}>
                      {k === 'del' ? <Ionicons name="backspace-outline" size={20} color={colors.muted} /> : <Text style={[styles.keyText, k === '000' && styles.keyFn]}>{k}</Text>}
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: amount === 0 }} disabled={amount === 0} onPress={addManual} style={[styles.addl, amount === 0 && { opacity: 0.45 }]}>
              <Ionicons name="add" size={17} color={colors.primary} />
              <Text style={styles.addlText}>{sale ? 'Agregar a la venta' : 'Agregar al gasto'}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.center}>
            <Pressable accessibilityRole="button" accessibilityLabel="Hablar" onPress={onVoice} style={styles.orb}>
              <Ionicons name="mic" size={28} color={colors.white} />
            </Pressable>
            <Text style={styles.centerTitle}>Dilo como lo dirías</Text>
            <Text style={styles.centerBody}>{sale ? '«Y un arreglo de cejas a cinco mil»' : '«Pagué el taxi, siete mil»'}</Text>
            <Pressable accessibilityRole="button" onPress={onVoice} style={styles.talk}>
              <Text style={styles.talkText}>Hablar</Text>
            </Pressable>
          </View>
        )}
      </View>

      {sale ? (
        <View style={styles.methods} accessibilityRole="radiogroup" accessibilityLabel="Medio de pago">
          {METHODS.map((m) => (
            <Pressable key={m.key} accessibilityRole="radio" accessibilityState={{ checked: method === m.key }} onPress={() => onMethod(m.key)} style={[styles.method, method === m.key && styles.methodOn]}>
              <Text style={[styles.methodText, method === m.key && styles.methodTextOn]}>{m.label}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel="Fiado: se registra en Empre" onPress={onFiado} style={styles.method}>
            <Text style={[styles.methodText, { color: colors.primary }]}>Fiado</Text>
            <Text style={styles.methodExt}>en Empre ›</Text>
          </Pressable>
        </View>
      ) : null}

      <HoldButton
        big
        tone={tone}
        disabled={total === 0}
        label={total > 0 ? `Mantén para registrar ${sign}${formatPesos(total)}` : sale ? 'Agrega algo a la venta' : 'Agrega un gasto'}
        onConfirm={onRegister}
        onEarly={() => onSay('Soltaste antes: no se registró nada.')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  sub: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  amountRow: { alignItems: 'center', paddingTop: 2 },
  amount: { fontSize: 40, fontFamily: fonts.display.bold },
  lines: { gap: 6, alignItems: 'center', minHeight: 34 },
  linesEmpty: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingLeft: 10, paddingRight: 3, borderRadius: 999, maxWidth: 260 },
  lineIn: { backgroundColor: colors.successSoft },
  lineOut: { backgroundColor: colors.accentSoft },
  lineText: { fontSize: 12, fontFamily: fonts.ui.bold, flexShrink: 1 },
  lineX: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  tab: { flex: 1, minHeight: 40, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  tabOn: { backgroundColor: colors.surface, ...shadow, shadowOpacity: 0.08, elevation: 1 },
  tabText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  tabTextOn: { color: colors.ink },
  pane: { minHeight: 200 },
  rows: { maxHeight: 236, borderRadius: radius.lg, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  rowName: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.ink },
  rowPrice: { fontSize: 12.5, fontFamily: fonts.display.semibold, color: colors.muted },
  step: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 2, borderRadius: radius.pill, backgroundColor: colors.surface },
  stepBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  plusIn: { backgroundColor: colors.success },
  plusOut: { backgroundColor: colors.accent },
  stepN: { minWidth: 22, textAlign: 'center', fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  field: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  input: { flex: 1, minWidth: 0, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink, paddingVertical: 8 },
  fieldAmount: { fontSize: 18, fontFamily: fonts.display.bold },
  keys: { gap: 6 },
  keyRow: { flexDirection: 'row', gap: 6 },
  key: { flex: 1, height: 44, borderRadius: radius.md, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  keyDown: { backgroundColor: colors.primarySoft },
  keyText: { fontSize: 20, fontFamily: fonts.display.semibold, color: colors.ink },
  keyFn: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  addl: { minHeight: 44, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primarySoft },
  addlText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primary },
  cat: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  catOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 1.5 },
  catText: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.ink },
  center: { minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  centerTitle: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  centerBody: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted, textAlign: 'center' },
  orb: { width: 74, height: 74, borderRadius: 37, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  talk: { minHeight: 44, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center' },
  talkText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.white },
  methods: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  method: { flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  methodOn: { backgroundColor: colors.surface, ...shadow, shadowOpacity: 0.08, elevation: 1 },
  methodText: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.muted },
  methodTextOn: { color: colors.ink },
  methodExt: { fontSize: 9.5, fontFamily: fonts.ui.bold, color: colors.primary },
});
