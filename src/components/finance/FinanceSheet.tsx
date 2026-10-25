import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { KnownItem, useFinanceData } from '@/finance/useFinance';
import { bumpLine, qtyOf, type DraftLine } from '@/lib/finance';
import { formatPesos } from '@/lib/ledger';
import { fin } from '@/finance/tokens';
import { HoldButton } from './HoldButton';
import { RollingNumber } from './RollingNumber';
import { WeekBars } from './WeekBars';

const C = fin.color;
const T = fin.type;
const R = fin.radius;
const S = fin.space;

// La hoja del día de Empre Finance (3.45): cuánto te quedó, la semana, «Elige y confirma», los botones de venta,
// gasto y voz y los atajos a «Mi negocio». La forma de la pieza, el registro y la voz los lleva FinanceOverlay.

export const isExpenseKey = (key: string) => key.startsWith('exp:');
// La barrita de arriba mide 21 dp de alto: el área de toque llega a 44 sin mover el diseño.
export const GRAB_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };

type Data = ReturnType<typeof useFinanceData>;

export function FinanceSheet({
  maxHeight,
  name,
  list,
  entityId,
  data,
  glass,
  quickOptions,
  quick,
  quickNet,
  onQuick,
  onConfirmQuick,
  onChoose,
  onPeek,
  onClose,
  onSale,
  onExpense,
  onVoice,
  onEmpre,
  onSay,
}: {
  maxHeight: number;
  name: string;
  list: { id: string; name: string }[];
  entityId: string;
  data: Data;
  glass: boolean;
  quickOptions: KnownItem[];
  quick: DraftLine[];
  quickNet: number;
  onQuick: (next: (q: DraftLine[]) => DraftLine[]) => void;
  onConfirmQuick: () => void;
  onChoose: (id: string) => void;
  onPeek: () => void;
  onClose: () => void;
  onSale: () => void;
  onExpense: () => void;
  onVoice: () => void;
  onEmpre: (href: Href) => void;
  onSay: (text: string) => void;
}) {
  const [picker, setPicker] = useState(false);
  const ledger: Href = { pathname: '/business/ledger/[id]', params: { id: entityId } };

  return (
    <ScrollView style={{ maxHeight }} contentContainerStyle={styles.sheet} bounces={false}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver a la cápsula" onPress={onPeek} hitSlop={GRAB_SLOP} style={styles.grabHit}>
        <View style={styles.grab} />
      </Pressable>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.h1} accessibilityRole="header">
            Hoy
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={list.length > 1 ? `Negocio: ${name}. Cambiar` : `Negocio: ${name}`}
            disabled={list.length < 2}
            onPress={() => setPicker((p) => !p)}
            style={styles.subRow}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }} // 44 dp de toque sin cambiar el diseño
          >
            <Text style={styles.sub} numberOfLines={1}>
              en <Text style={styles.subB}>{name}</Text>
            </Text>
            {list.length > 1 ? <Ionicons name={picker ? 'chevron-up' : 'chevron-down'} size={14} color={C.text} /> : null}
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={[styles.x, glass && styles.roundGlass]}>
          <Ionicons name="close" size={20} color={C.text} />
        </Pressable>
      </View>

      {picker ? (
        <View style={[styles.picker, glass && styles.innerGlass]} accessibilityRole="radiogroup" accessibilityLabel="Negocio">
          {list.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: e.id === entityId }}
              onPress={() => {
                setPicker(false);
                onChoose(e.id);
              }}
              style={[styles.pick, e.id === entityId && styles.pickOn]}
            >
              <Text style={[styles.pickText, e.id === entityId && { color: C.action.solid }]} numberOfLines={1}>
                {e.name}
              </Text>
              {e.id === entityId ? <Ionicons name="checkmark" size={16} color={C.action.solid} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable accessibilityRole="button" accessibilityHint="Abre Mi negocio" onPress={() => onEmpre(ledger)} style={[styles.hero, glass && styles.innerGlass]}>
        <View style={styles.heroTop}>
          <Text style={styles.kicker}>Te quedó</Text>
          {data.changePct !== null ? (
            <View style={[styles.chg, data.changePct < 0 && styles.chgDown]}>
              <Ionicons name={data.changePct >= 0 ? 'arrow-up' : 'arrow-down'} size={11} color={data.changePct >= 0 ? C.in.ink : C.out.ink} />
              <Text style={[styles.chgText, data.changePct < 0 && { color: C.out.ink }]}>{Math.abs(data.changePct)} % vs ayer</Text>
            </View>
          ) : null}
        </View>
        {data.loading ? <ActivityIndicator color={C.action.solid} style={styles.spinner} /> : <RollingNumber value={data.net} prefix={data.net < 0 ? '−' : ''} style={styles.big} />}
        <WeekBars bars={data.bars} heights={data.heights} />
        <View style={styles.split}>
          <View style={styles.flex}>
            <Text style={styles.splitLabel}>
              <Text style={{ color: C.in.fill }}>● </Text>Vendiste
            </Text>
            <RollingNumber value={data.sold} style={styles.splitValue} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.splitLabel}>
              <Text style={{ color: C.out.fill }}>● </Text>Gastaste
            </Text>
            <RollingNumber value={data.spent} style={styles.splitValue} />
          </View>
        </View>
        {data.problem === 'offline' ? <Text style={styles.stale}>Sin conexión: lo que registres se envía solo cuando vuelva la señal.</Text> : null}
        {data.problem === 'server' ? <Text style={styles.stale}>No pudimos cargar el resumen. Lo que registres queda guardado y se envía después.</Text> : null}
      </Pressable>

      {quickOptions.length > 0 ? (
        <QuickPick options={quickOptions} quick={quick} net={data.net} quickNet={quickNet} onQuick={onQuick} onConfirm={onConfirmQuick} onSay={onSay} />
      ) : null}

      <View style={styles.acts}>
        <Pressable accessibilityRole="button" onPress={onSale} style={[styles.act, styles.actIn]}>
          <Ionicons name="add" size={18} color={C.action.on} />
          <Text style={styles.actText}>Venta</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onExpense} style={[styles.act, styles.actOut]}>
          <Ionicons name="remove" size={18} color={C.out.on} />
          <Text style={[styles.actText, { color: C.out.on }]}>Gasto</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Contarlo por voz" onPress={onVoice} style={[styles.act, styles.actChat]}>
          <Ionicons name="mic" size={19} color={C.action.on} />
        </Pressable>
      </View>

      {data.failedCount > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => onEmpre(ledger)} style={styles.row}>
          <Ionicons name="alert-circle-outline" size={17} color={C.out.ink} />
          <Text style={[styles.rowText, { color: C.out.ink }]} numberOfLines={1}>
            {data.failedCount} {data.failedCount === 1 ? 'registro no se pudo enviar' : 'registros no se pudieron enviar'}
          </Text>
          <Ionicons name="chevron-forward" size={17} color={C.out.ink} />
        </Pressable>
      ) : null}
      {data.receivable > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => onEmpre({ pathname: '/business/ledger/debts/[id]', params: { id: entityId } })} style={styles.row}>
          <Ionicons name="people-outline" size={17} color={C.action.solid} />
          <Text style={styles.rowText} numberOfLines={1}>
            Te deben {formatPesos(data.receivable)} en fiados
          </Text>
          <Ionicons name="chevron-forward" size={17} color={C.action.solid} />
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" onPress={() => onEmpre(ledger)} style={styles.seeAll}>
        <Text style={styles.seeAllText}>Ver todo en Empre</Text>
        <Ionicons name="open-outline" size={16} color={C.action.solid} />
      </Pressable>
    </ScrollView>
  );
}

/** «Elige y confirma»: tus servicios más vendidos y tu gasto más frecuente; registrar pide mantener pulsado. */
function QuickPick({
  options,
  quick,
  net,
  quickNet,
  onQuick,
  onConfirm,
  onSay,
}: {
  options: KnownItem[];
  quick: DraftLine[];
  net: number;
  quickNet: number;
  onQuick: (next: (q: DraftLine[]) => DraftLine[]) => void;
  onConfirm: () => void;
  onSay: (text: string) => void;
}) {
  return (
    <View style={styles.quick}>
      <View style={styles.quickHead}>
        <Text style={styles.kicker}>Elige y confirma</Text>
        {quick.length > 0 ? (
          <Text style={styles.preview}>
            Quedaría {formatPesos(net + quickNet)} ·{' '}
            <Text accessibilityRole="button" onPress={() => onQuick(() => [])} style={styles.clear}>
              Limpiar
            </Text>
          </Text>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {options.map((it) => {
          const out = isExpenseKey(it.key);
          const n = qtyOf(quick, it.key);
          const ink = out ? C.out.ink : C.in.ink;
          return (
            <Pressable
              key={it.key}
              accessibilityRole="button"
              accessibilityLabel={`${it.name}, ${formatPesos(it.price)}${n ? `, ${n} elegidos` : ''}`}
              accessibilityHint="Lo agrega al borrador; para registrar, mantén pulsado el botón de abajo"
              onPress={() => onQuick((q) => bumpLine(q, { key: it.key, name: it.name, unitPrice: it.price, itemId: it.itemId, category: it.category, source: 'known' }, 1))}
              style={[styles.chip, out ? styles.chipOut : styles.chipIn, n > 0 && { borderColor: ink }]}
            >
              {/* Si no cabe, se acorta el nombre; el precio siempre se ve completo. */}
              <Text style={[styles.chipText, { color: ink }]} numberOfLines={1}>
                {it.name}
              </Text>
              <Text style={[styles.chipText, styles.chipNum, styles.noShrink, { color: ink }]}>{formatPesos(it.price)}</Text>
              {n > 0 ? (
                <View style={[styles.badge, { backgroundColor: ink }]}>
                  <Text style={styles.badgeText}>{n}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
      {quick.length > 0 ? (
        <HoldButton
          tone={quickNet >= 0 ? 'in' : 'out'}
          label={`Mantén para registrar ${quickNet >= 0 ? '+' : '−'}${formatPesos(Math.abs(quickNet))}`}
          onConfirm={onConfirm}
          onEarly={() => onSay('Soltaste antes: no se registró nada.')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: { paddingHorizontal: S.lg, paddingBottom: S.lg, gap: S.md },
  grabHit: { alignSelf: 'center', paddingVertical: S.sm, paddingHorizontal: 40 },
  grab: { width: 38, height: 5, borderRadius: 3, backgroundColor: C.handle },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: S.md, marginTop: -S.xs },
  headText: { flex: 1, minWidth: 0 },
  h1: T.title,
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 24 },
  sub: { ...T.label, flexShrink: 1 },
  subB: { fontFamily: T.button.fontFamily, color: C.text },
  x: { width: fin.size.touch, height: fin.size.touch, borderRadius: R.control, backgroundColor: C.inner, alignItems: 'center', justifyContent: 'center' },
  roundGlass: { backgroundColor: C.roundGlass, ...fin.elevation.card, shadowOpacity: 0.1, elevation: 1 },
  innerGlass: { backgroundColor: C.innerGlass },
  picker: { borderRadius: R.inner, backgroundColor: C.inner, padding: 6 },
  pick: { minHeight: fin.size.touch, borderRadius: R.key, flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingHorizontal: S.md },
  pickOn: { backgroundColor: C.action.soft },
  pickText: { ...T.body, flex: 1 },
  hero: { borderRadius: R.inner, backgroundColor: C.inner, paddingHorizontal: 14, paddingTop: S.md, paddingBottom: 10, gap: 6 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: T.kicker,
  chg: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: S.sm, paddingVertical: 2, borderRadius: R.badge, backgroundColor: C.in.soft },
  chgDown: { backgroundColor: C.out.soft },
  chgText: { ...T.small, fontFamily: T.button.fontFamily, color: C.in.ink },
  spinner: { alignSelf: 'flex-start', marginVertical: 8 },
  big: T.heroAmount,
  split: { flexDirection: 'row', gap: S.sm, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.line },
  splitLabel: { ...T.small, fontSize: 11, color: C.textSoft },
  splitValue: T.split,
  stale: { ...T.small, color: C.warn },
  quick: { gap: 6 },
  quickHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2, gap: S.sm },
  preview: { ...T.small, flexShrink: 1, color: C.textSoft },
  clear: { color: C.action.link, textDecorationLine: 'underline' },
  chips: { gap: 6 },
  chip: { minHeight: fin.size.touch, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: S.md, borderRadius: R.key, borderWidth: 2, borderColor: 'transparent', maxWidth: 220 },
  chipIn: { backgroundColor: C.in.soft },
  chipOut: { backgroundColor: C.out.soft },
  chipText: { ...T.small, fontSize: 12.5, flexShrink: 1 },
  chipNum: { fontFamily: T.amount.fontFamily },
  noShrink: { flexShrink: 0 },
  badge: { minWidth: 20, height: 20, borderRadius: R.badge, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { ...T.small, fontSize: 11, fontFamily: T.button.fontFamily, color: C.in.on },
  acts: { flexDirection: 'row', gap: 6 },
  act: { flex: 1, minHeight: fin.size.act, borderRadius: R.button, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actIn: { backgroundColor: C.in.solid },
  actOut: { backgroundColor: C.out.fill },
  actChat: { flex: 0, width: fin.size.button, backgroundColor: C.action.solid }, // 52, como en el mockup
  actText: { ...T.button, color: C.in.on },
  row: { minHeight: fin.size.touch, flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingHorizontal: S.xs, borderTopWidth: 1, borderTopColor: C.line },
  rowText: { ...T.small, fontSize: 12.5, flex: 1, color: C.action.link },
  seeAll: { minHeight: fin.size.touch, borderRadius: R.key, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.action.soft },
  seeAllText: { ...T.button, fontSize: 13, color: C.action.link },
});
