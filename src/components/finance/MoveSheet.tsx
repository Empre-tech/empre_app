import { Ionicons } from '@/components/Icon';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import type { Expense, Sale } from '@/api/ledger';
import { Button } from '@/components/Button';
import { API_URL } from '@/config';
import { queueVoid } from '@/ledger/ledgerStore';
import { ticketMessage, ticketUrl, waLink, waPhone } from '@/lib/customerMessages';
import { categoryLabel, formatPesos, METHOD_LABEL } from '@/lib/ledger';
import { colors, fonts, radius, spacing } from '@/theme';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const whenText = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}`;
};
const ORIGIN: Record<string, string> = { offer_claim: 'Canje de Empre Offers', appointment: 'Cita de la Agenda', voice: 'Dictada con Empre AI' };

export type MoveDetail = { kind: 'sale'; sale: Sale; voided: boolean } | { kind: 'expense'; expense: Expense; voided: boolean };

/**
 * El ticket de una venta o el detalle de un gasto (2026-11-22), al tocarlo en la lista de Finance: lo que se vendió,
 * cómo se pagó, el cliente y la nota. Desde aquí se manda el ticket por WhatsApp, se abre el cliente o se anula
 * (anular pide confirmar en la misma hoja; no se borra, queda marcado y deja de contar).
 */
export function MoveSheet({ entityId, move, onClose }: { entityId: string; move: MoveDetail | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [voided, setVoided] = useState(false);
  const business = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId && move), staleTime: 5 * 60_000 });
  useEffect(() => {
    setConfirm(false);
    setVoided(Boolean(move?.voided));
  }, [move]);
  if (!move) return null;

  const isSale = move.kind === 'sale';
  const sale = isSale ? move.sale : null;
  const expense = !isSale ? move.expense : null;
  const id = sale?.id ?? expense?.id ?? '';
  const total = sale?.total ?? expense?.amount ?? 0;
  const party = sale?.party ?? expense?.party;
  const pays = sale
    ? sale.method2 && (sale.amount2 ?? 0) > 0
      ? [
          { m: sale.method, n: sale.total - (sale.amount2 ?? 0) },
          { m: sale.method2, n: sale.amount2 ?? 0 },
        ]
      : [{ m: sale.method, n: sale.total }]
    : [];
  const payLabel = (m: string) => (m === 'credit' ? 'Fiado' : METHOD_LABEL[m as keyof typeof METHOD_LABEL] ?? m);

  const sendTicket = () => {
    if (!sale) return;
    const text = ticketMessage({ customer: party?.name, business: business.data?.name ?? 'nuestro negocio', total: sale.total, url: ticketUrl(API_URL, sale.id) });
    const phone = waPhone(party?.phone);
    if (phone) void Linking.openURL(waLink(phone, text)).catch(() => void Share.share({ message: text }));
    else void Share.share({ message: text });
  };
  const doVoid = () => {
    queueVoid(move.kind, entityId, id, 'Anulada por el dueño');
    setVoided(true);
    setConfirm(false);
  };

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} accessibilityViewIsModal>
          <View style={styles.grab} />
          <ScrollView contentContainerStyle={{ gap: spacing.md }} bounces={false}>
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>{isSale ? `Venta · ${id.slice(0, 8).toUpperCase()}` : 'Gasto'}</Text>
                <Text style={styles.when}>{whenText(sale?.occurred_at ?? expense?.occurred_at ?? '')}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={styles.close}>
                <Ionicons name="close" size={22} color={colors.ink} />
              </Pressable>
            </View>
            {voided ? (
              <View style={styles.voidBox}>
                <Text style={styles.voidText}>{isSale ? 'Venta anulada: ya no cuenta' : 'Gasto anulado: ya no cuenta'}</Text>
              </View>
            ) : null}

            <View style={styles.ticket}>
              {sale && sale.lines?.length ? (
                sale.lines.map((l, i) => (
                  <View key={l.id ?? `${l.name}-${i}`} style={styles.line}>
                    <Text style={styles.qty}>{l.qty}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.lineName} numberOfLines={2}>
                        {l.name}
                      </Text>
                      {l.qty !== 1 && l.unit_price != null ? <Text style={styles.meta}>{`${formatPesos(l.unit_price)} c/u`}</Text> : null}
                    </View>
                    <Text style={styles.lineAmount}>{formatPesos((l.unit_price ?? 0) * l.qty)}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.lineName}>{sale ? sale.note || 'Venta sin detalle' : expense?.note || categoryLabel(expense?.category ?? 'otro')}</Text>
              )}
              <View style={styles.dash} />
              <View style={styles.line}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={[styles.total, voided && styles.struck]}>{`${isSale ? '' : '−'}${formatPesos(total)}`}</Text>
              </View>
              {pays.map((p) => (
                <View key={p.m} style={styles.line}>
                  <Text style={[styles.meta, { flex: 1 }]}>{payLabel(p.m)}</Text>
                  <Text style={styles.meta}>{formatPesos(p.n)}</Text>
                </View>
              ))}
              {expense ? <Text style={styles.meta}>{`${categoryLabel(expense.category)} · ${expense.method === 'credit' ? 'A crédito' : METHOD_LABEL[expense.method]}`}</Text> : null}
            </View>

            {party ? (
              <Pressable
                accessibilityRole="button"
                disabled={!isSale}
                onPress={() => {
                  onClose();
                  router.push({ pathname: '/business/ledger/client', params: { entityId, partyId: party.id } });
                }}
                style={styles.row}
              >
                <Ionicons name="person-circle-outline" size={22} color={colors.ink} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName}>{party.name}</Text>
                  <Text style={styles.meta}>{isSale ? 'Cliente · ver su historial' : 'Proveedor'}</Text>
                </View>
                {isSale ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : null}
              </Pressable>
            ) : null}
            {sale && ORIGIN[sale.source] ? <Text style={styles.meta}>{ORIGIN[sale.source]}</Text> : null}
            {sale?.note && sale.lines?.length ? <Text style={styles.meta}>{`Nota: ${sale.note}`}</Text> : null}

            {sale && !voided ? (
              <View style={{ gap: 6 }}>
                <Button title={party?.phone && waPhone(party.phone) ? `Enviar ticket a ${party.name.split(' ')[0]}` : 'Enviar ticket'} onPress={sendTicket} />
                <Text style={styles.hint}>Un enlace con la venta. No es factura electrónica.</Text>
              </View>
            ) : null}
            {!voided ? (
              confirm ? (
                <View style={styles.confirmBox}>
                  <Text style={styles.lineName}>{isSale ? '¿Anular esta venta?' : '¿Anular este gasto?'}</Text>
                  <Text style={styles.meta}>No se borra: queda marcada como anulada y deja de contar{isSale ? '. Lo vendido vuelve al inventario.' : '.'}</Text>
                  <View style={styles.confirmRow}>
                    <Button title="No" variant="secondary" onPress={() => setConfirm(false)} style={{ flex: 1 }} />
                    <Button title="Sí, anular" onPress={doVoid} style={{ flex: 1 }} />
                  </View>
                </View>
              ) : (
                <Button title={isSale ? 'Anular venta' : 'Anular gasto'} variant="ghost" onPress={() => setConfirm(true)} />
              )
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(43,38,34,0.32)' },
  sheet: { maxHeight: '90%', backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eyebrow: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  when: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.well },
  voidBox: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.well },
  voidText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink, textAlign: 'center' },
  ticket: { gap: 6, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  qty: { width: 24, fontSize: 14, fontFamily: fonts.ui.bold, color: colors.muted, fontVariant: ['tabular-nums'] },
  lineName: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  lineAmount: { fontSize: 14.5, fontFamily: fonts.ui.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  dash: { borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.line, marginVertical: 4 },
  totalLabel: { flex: 1, fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  total: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  struck: { textDecorationLine: 'line-through', color: colors.muted },
  meta: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  hint: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  confirmBox: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.well },
  confirmRow: { flexDirection: 'row', gap: spacing.sm },
});
