import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Expense, Sale } from '@/api/ledger';
import { queueVoid } from '@/ledger/ledgerStore';
import { categoryLabel, formatPesos, METHOD_LABEL, salePayText } from '@/lib/ledger';
import { colors, fonts } from '@/theme';

export interface Movement {
  key: string;
  kind: 'sale' | 'expense';
  id: string;
  at: string;
  amount: number;
  title: string;
  sub: string;
  voided: boolean;
  pending: boolean;
}

const originText = (source: Sale['source']) => (source === 'offer_claim' ? 'Empre Offers · ' : source === 'appointment' ? 'Agenda · ' : '');

export function saleMovement(s: Sale): Movement {
  const what = s.lines?.length ? s.lines.map((l) => (l.qty === 1 ? l.name : `${l.qty} × ${l.name}`)).join(', ') : s.note || 'Venta';
  return { key: `s${s.id}`, kind: 'sale', id: s.id, at: s.occurred_at, amount: s.total, title: what, sub: `${originText(s.source)}${salePayText({ ...s, partyName: s.party?.name })}${s.source === 'voice' ? ' · por voz' : ''}`, voided: s.status === 'voided', pending: false };
}

export function expenseMovement(e: Expense): Movement {
  return { key: `e${e.id}`, kind: 'expense', id: e.id, at: e.occurred_at, amount: e.amount, title: e.note || categoryLabel(e.category), sub: `${categoryLabel(e.category)} · ${e.method === 'credit' ? 'A crédito' : METHOD_LABEL[e.method]}${e.party ? ` · ${e.party.name}` : ''}`, voided: e.status === 'voided', pending: false };
}

export function timeOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

/** Ventas y gastos en una lista; tocar uno ofrece anularlo. `when` dice qué poner antes del detalle. */
export function MoveRows({ entityId, moves, when = (m) => timeOf(m.at) }: { entityId: string; moves: Movement[]; when?: (m: Movement) => string }) {
  const askVoid = (m: Movement) => {
    if (m.voided) return;
    Alert.alert(m.kind === 'sale' ? 'Anular esta venta' : 'Anular este gasto', `${m.title} · ${formatPesos(m.amount)}\n\nNo se borra: queda marcada como anulada y deja de contar.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Anular', style: 'destructive', onPress: () => queueVoid(m.kind, entityId, m.id, 'Anulada por el dueño') },
    ]);
  };
  return (
    <>
      {moves.map((m, i) => (
        <Pressable key={m.key} accessibilityRole="button" accessibilityLabel={`${m.kind === 'sale' ? 'Venta' : 'Gasto'} de ${formatPesos(m.amount)}, ${m.title}${m.voided ? ', anulada' : ''}. Toca para anular`} onPress={() => (m.pending ? undefined : askVoid(m))} style={[styles.move, i > 0 && styles.moveLine]}>
          <View style={styles.moveIcon}>
            <Ionicons name={m.kind === 'sale' ? 'arrow-up' : 'arrow-down'} size={16} color={colors.ink} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.moveTitle, m.voided && styles.struck]} numberOfLines={1}>
              {m.title}
            </Text>
            <Text style={styles.moveSub} numberOfLines={2}>
              {when(m)} · {m.sub}
              {m.pending ? ' · sin enviar' : ''}
              {m.voided ? ' · anulada' : ''}
            </Text>
          </View>
          <Text style={[styles.moveAmount, m.voided && styles.struck, m.kind === 'expense' && { color: colors.muted }]}>
            {m.kind === 'expense' ? '−' : ''}
            {formatPesos(m.amount)}
          </Text>
        </Pressable>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  move: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  moveLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  moveIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  moveTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  moveSub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.muted },
  moveAmount: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink, fontVariant: ['tabular-nums'] },
  struck: { textDecorationLine: 'line-through', color: colors.muted },
});
