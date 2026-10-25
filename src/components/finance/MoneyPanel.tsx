import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { PayMethod } from '@/api/ledger';
import { bumpLine, draftTotal, qtyOf, removeLine, typedLine, withTyped, type DraftLine } from '@/lib/finance';
import { EXPENSE_CATEGORIES, formatPesos, MAX_AMOUNT } from '@/lib/ledger';
import type { KnownItem } from '@/finance/useFinance';
import { fin } from '@/finance/tokens';
import { useGlass } from './Glass';
import { HoldButton } from './HoldButton';
import { RollingNumber } from './RollingNumber';

const C = fin.color;
const T = fin.type;
const R = fin.radius;
const S = fin.space;

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
  /** Registra estas líneas: el borrador más lo escrito a mano que aún no se agregó. */
  onRegister: (lines: DraftLine[]) => void;
  onSay: (text: string) => void;
}) {
  const sale = kind === 'sale';
  const [tab, setTab] = useState<Tab>(initialTab ?? (known.length > 0 ? 'known' : 'man'));
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState(0);
  const [cat, setCat] = useState('mercancia');
  const glass = useGlass();
  // Mientras se escribe la descripción, el teclado numérico se aparta: así el teclado del sistema no empuja el monto
  // fuera de la pantalla.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setTyping(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setTyping(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  // Lo escrito a mano cuenta desde ya: el total y el botón lo incluyen aunque no se toque «Agregar».
  const fallbackName = sale ? 'Otro' : (EXPENSE_CATEGORIES.find((c) => c.key === cat)?.label ?? 'Gasto');
  const typed = typedLine('man:typed', amount, desc, fallbackName, sale ? undefined : cat);
  const total = draftTotal(withTyped(draft, typed));
  const register = () => {
    onRegister(withTyped(draft, typed ? { ...typed, key: `man:${++manualSeq}` } : null));
    setAmount(0);
    setDesc('');
  };
  const tone = sale ? 'in' : 'out';
  const sign = sale ? '' : '−';

  const press = (k: string) =>
    setAmount((v) => (k === 'del' ? Math.floor(v / 10) : k === '000' ? Math.min(v * 1000, MAX_AMOUNT) : Math.min(v * 10 + Number(k), MAX_AMOUNT)));

  const addManual = () => {
    if (amount <= 0) return;
    const line = typedLine(`man:${++manualSeq}`, amount, desc, fallbackName, sale ? undefined : cat);
    if (!line) return;
    const name = line.name;
    onDraft([...draft, line]);
    setAmount(0);
    setDesc('');
    onSay(`${name} agregado. Sigue sumando o mantén el botón para registrar.`);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} style={[styles.back, glass && styles.roundGlass]} hitSlop={6}>
          <Ionicons name="chevron-back" size={20} color={C.text} />
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
        <RollingNumber value={total} prefix={total > 0 ? sign : ''} style={{ ...styles.amount, color: sale ? C.in.ink : C.out.ink }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lines} accessibilityLabel={sale ? 'Lo que lleva la venta' : 'Lo que lleva el gasto'}>
        {draft.length === 0 ? (
          <Text style={styles.linesEmpty}>{sale ? 'Elige un servicio, escríbelo o dilo' : 'Elige uno de siempre, escríbelo o dilo'}</Text>
        ) : (
          draft.map((l) => (
            <View key={l.key} style={[styles.line, sale ? styles.lineIn : styles.lineOut]}>
              <Text style={[styles.lineText, { color: sale ? C.in.ink : C.out.ink }]} numberOfLines={1}>
                {l.qty > 1 ? `${l.qty} × ` : ''}
                {l.name}
                {l.source !== 'known' ? ` ${formatPesos(l.unitPrice)}` : ''}
                {l.source === 'manual' ? '  · a mano' : l.source === 'voice' ? '  · por voz' : ''}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${l.name}`} onPress={() => onDraft(removeLine(draft, l.key))} style={styles.lineX} hitSlop={6}>
                <Ionicons name="close" size={13} color={C.text} />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.tabs, glass && styles.controlGlass]} accessibilityRole="tablist">
        {(
          [
            ['known', sale ? 'Servicios' : 'De siempre', null],
            ['man', 'Manual', 'create-outline'],
            ['chat', 'Por chat', 'mic-outline'],
          ] as const
        ).map(([key, label, icon]) => (
          <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabOn]}>
            {icon ? <Ionicons name={icon} size={15} color={tab === key ? C.text : C.textSoft} /> : null}
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
            <ScrollView style={[styles.rows, glass && styles.innerGlass]} contentContainerStyle={{ paddingHorizontal: 12 }}>
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
                      <Pressable accessibilityRole="button" accessibilityLabel={`Quitar uno de ${it.name}`} disabled={n === 0} hitSlop={4} onPress={() => onDraft(bumpLine(draft, line, -1))} style={styles.stepBtn}>
                        <Ionicons name="remove" size={18} color={n === 0 ? C.disabled : C.text} />
                      </Pressable>
                      <Text style={[styles.stepN, n === 0 && { color: C.textSoft }]} accessibilityLabel={`${n} de ${it.name}`}>
                        {n}
                      </Text>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Agregar uno de ${it.name}`} hitSlop={4} onPress={() => onDraft(bumpLine(draft, line, 1))} style={[styles.stepBtn, sale ? styles.plusIn : styles.plusOut]}>
                        <Ionicons name="add" size={18} color={sale ? C.in.on : C.out.on} />
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
                    <Text style={[styles.catText, cat === c && { color: C.out.ink }]}>{EXPENSE_CATEGORIES.find((x) => x.key === c)?.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.field}>
              <TextInput value={desc} onChangeText={setDesc} placeholder={sale ? '¿Qué vendiste? Ej.: arreglo de barba' : '¿Qué fue? (opcional)'} placeholderTextColor={C.textSoft} style={styles.input} maxLength={80} accessibilityLabel={sale ? 'Qué vendiste' : 'Qué fue el gasto'} />
              <RollingNumber value={amount} style={{ ...styles.fieldAmount, color: sale ? C.in.ink : C.out.ink }} />
            </View>
            {typing ? null : (
              <View style={styles.keys}>
                {KEY_ROWS.map((row) => (
                  <View key={row.join('')} style={styles.keyRow}>
                    {row.map((k) => (
                      <Pressable key={k} accessibilityRole="button" accessibilityLabel={k === 'del' ? 'Borrar' : k} onPress={() => press(k)} style={({ pressed }) => [styles.key, pressed && styles.keyDown]}>
                        {k === 'del' ? <Ionicons name="backspace-outline" size={20} color={C.textSoft} /> : <Text style={[styles.keyText, k === '000' && styles.keyFn]}>{k}</Text>}
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            )}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: amount === 0 }} disabled={amount === 0} onPress={addManual} style={[styles.addl, amount === 0 && { opacity: 0.45 }]}>
              <Ionicons name="add" size={17} color={C.action.solid} />
              <Text style={styles.addlText}>{sale ? 'Agregar a la venta' : 'Agregar al gasto'}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.center}>
            <Pressable accessibilityRole="button" accessibilityLabel="Hablar" onPress={onVoice} style={styles.orb}>
              <Ionicons name="mic" size={28} color={C.in.on} />
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
        <View style={[styles.methods, glass && styles.controlGlass]} accessibilityRole="radiogroup" accessibilityLabel="Medio de pago">
          {METHODS.map((m) => (
            <Pressable key={m.key} accessibilityRole="radio" accessibilityState={{ checked: method === m.key }} onPress={() => onMethod(m.key)} style={[styles.method, method === m.key && styles.methodOn]}>
              <Text style={[styles.methodText, method === m.key && styles.methodTextOn]}>{m.label}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel="Fiado: se registra en Empre" onPress={onFiado} style={styles.method}>
            <Text style={[styles.methodText, { color: C.action.solid }]}>Fiado</Text>
            <Text style={styles.methodExt}>en Empre ›</Text>
          </Pressable>
        </View>
      ) : null}

      <HoldButton
        big
        tone={tone}
        disabled={total === 0}
        label={total > 0 ? `Mantén para registrar ${sign}${formatPesos(total)}` : sale ? 'Agrega algo a la venta' : 'Agrega un gasto'}
        onConfirm={register}
        onEarly={() => onSay('Soltaste antes: no se registró nada.')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: S.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  back: { width: fin.size.touch, height: fin.size.touch, borderRadius: R.control, backgroundColor: C.inner, alignItems: 'center', justifyContent: 'center' },
  roundGlass: { backgroundColor: C.roundGlass, ...fin.elevation.card, shadowOpacity: 0.1, elevation: 1 },
  innerGlass: { backgroundColor: C.innerGlass },
  controlGlass: { backgroundColor: C.controlGlass },
  title: T.panelTitle,
  sub: { ...T.label, fontSize: 12 },
  amountRow: { alignItems: 'center', paddingTop: 2 },
  amount: T.panelAmount,
  lines: { gap: 6, alignItems: 'center', minHeight: 34 },
  linesEmpty: { ...T.label, fontSize: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingLeft: S.md, paddingRight: 3, borderRadius: R.control, maxWidth: 260 },
  lineIn: { backgroundColor: C.in.soft },
  lineOut: { backgroundColor: C.out.soft },
  lineText: { ...T.small, fontSize: 12, flexShrink: 1 },
  lineX: { width: 26, height: 26, borderRadius: R.control, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: S.xs, padding: 3, borderRadius: R.key, backgroundColor: C.control },
  tab: { flex: 1, minHeight: fin.size.touch, borderRadius: R.tab, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  tabOn: { backgroundColor: C.surface, ...fin.elevation.card, shadowOpacity: 0.08, elevation: 1 },
  tabText: { ...T.small, fontSize: 12.5, color: C.textSoft },
  tabTextOn: { color: C.text },
  pane: { minHeight: 200 },
  rows: { maxHeight: 236, borderRadius: R.inner, backgroundColor: C.inner },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: fin.size.button },
  rowLine: { borderTopWidth: 1, borderTopColor: C.line },
  rowName: T.body,
  rowPrice: { ...T.label, fontFamily: T.amount.fontFamily },
  step: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 2, borderRadius: R.control, backgroundColor: C.surface },
  stepBtn: { width: fin.size.step, height: fin.size.step, borderRadius: R.control, alignItems: 'center', justifyContent: 'center' },
  plusIn: { backgroundColor: C.in.fill },
  plusOut: { backgroundColor: C.out.fill },
  stepN: { ...T.amount, fontSize: 16, minWidth: 22, textAlign: 'center' },
  field: { minHeight: fin.size.field, flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingHorizontal: S.md, borderRadius: R.field, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  input: { ...T.body, fontSize: 13, flex: 1, minWidth: 0, paddingVertical: S.sm },
  fieldAmount: T.amount,
  keys: { gap: 6 },
  keyRow: { flexDirection: 'row', gap: 6 },
  key: { flex: 1, height: fin.size.key, borderRadius: R.key, backgroundColor: C.inner, alignItems: 'center', justifyContent: 'center' },
  keyDown: { backgroundColor: C.action.soft },
  keyText: T.key,
  keyFn: { ...T.small, fontSize: 13, color: C.textSoft },
  addl: { minHeight: fin.size.touch, borderRadius: R.field, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.action.soft },
  addlText: { ...T.button, fontSize: 13, color: C.action.link },
  cat: { minHeight: fin.size.touch - 4, paddingHorizontal: S.md, borderRadius: R.control, justifyContent: 'center', backgroundColor: C.control },
  catOn: { backgroundColor: C.out.soft, borderColor: C.out.fill, borderWidth: 1.5 },
  catText: { ...T.small, fontSize: 12, color: C.text },
  center: { minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: S.sm, paddingHorizontal: S.md },
  centerTitle: { ...T.amount, fontSize: 17, textAlign: 'center' },
  centerBody: { ...T.label, textAlign: 'center' },
  orb: { width: 74, height: 74, borderRadius: R.control, backgroundColor: C.action.solid, alignItems: 'center', justifyContent: 'center' },
  talk: { minHeight: fin.size.touch, paddingHorizontal: S.xl - 4, borderRadius: R.control, backgroundColor: C.action.solid, justifyContent: 'center' },
  talkText: { ...T.button, fontSize: 13.5, color: C.action.on },
  methods: { flexDirection: 'row', gap: S.xs, padding: 3, borderRadius: R.button, backgroundColor: C.control },
  method: { flex: 1, minHeight: fin.size.method, borderRadius: R.segItem, alignItems: 'center', justifyContent: 'center' },
  methodOn: { backgroundColor: C.surface, ...fin.elevation.card, shadowOpacity: 0.08, elevation: 1 },
  methodText: { ...T.small, color: C.textSoft },
  methodTextOn: { color: C.text },
  methodExt: { ...T.small, fontSize: 9.5, color: C.action.link },
});
