import { Ionicons } from '@/components/Icon';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import { ledgerApi } from '@/api/ledger';
import { offersApi } from '@/api/offers';
import { Button } from '@/components/Button';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { API_URL } from '@/config';
import { debtMessage, freeMessage, offerMessage, phoneProblem, ticketMessage, ticketUrl, waLink, waPhone } from '@/lib/customerMessages';
import { formatPesos, METHOD_LABEL } from '@/lib/ledger';
import { timeLeftLabel } from '@/lib/offer';
import { contactBlock, noteContact } from '@/lib/contactLog';
import { colors, fonts, radius, spacing } from '@/theme';

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

/**
 * Un cliente (2026-11-22): su contacto y la autorización de mensajes, lo que debe, sus compras y los mensajes uno a
 * uno. Cada mensaje se abre en el WhatsApp del dueño con el texto ya escrito; Empre no envía nada por su cuenta. Las
 * ofertas solo a quien autorizó recibir mensajes.
 */
export default function ClientScreen() {
  const { entityId: rawEntity, partyId: rawParty } = useLocalSearchParams<{ entityId: string; partyId: string }>();
  const entityId = rawEntity ?? '';
  const partyId = rawParty ?? '';
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();

  const parties = useQuery({ queryKey: ['ledger', entityId, 'parties', 'customer'], queryFn: () => ledgerApi.parties(entityId, { kind: 'customer' }), enabled: Boolean(entityId) });
  const party = useMemo(() => (parties.data ?? []).find((p) => p.id === partyId), [parties.data, partyId]);
  const sales = useQuery({ queryKey: ['ledger', entityId, 'sales', 'party', partyId], queryFn: () => ledgerApi.sales(entityId, { party_id: partyId, limit: 50 }), enabled: Boolean(entityId && partyId) });
  const business = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId), staleTime: 5 * 60_000 });
  const offers = useQuery({ queryKey: ['offers', entityId], queryFn: () => offersApi.list(entityId), enabled: Boolean(entityId) });

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [offerPick, setOfferPick] = useState(false);
  // El motivo por el que no se puede mandar ahora un cobro o una oferta (Ley 2300). Va antes de los return tempranos.
  const [rule, setRule] = useState<string | null>(null);
  useEffect(() => {
    if (party) {
      setName(party.name);
      setPhone(party.phone ?? '');
      setNote(party.note ?? '');
    }
  }, [party]);

  const update = useMutation({
    mutationFn: (input: { name?: string; phone?: string; accepts_messages?: boolean; note?: string }) => ledgerApi.updateParty(entityId, partyId, input),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['ledger', entityId, 'parties'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo guardar.'),
  });

  if (parties.isLoading) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Cliente" />
        <ActivityIndicator color={colors.ink} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }
  if (!party) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Cliente" />
        <Text style={[styles.meta, { padding: spacing.lg }]}>Este cliente aún no está guardado o ya no existe. Si lo acabas de crear sin señal, se guarda cuando vuelva.</Text>
      </View>
    );
  }

  const bizName = business.data?.name ?? 'nuestro negocio';
  const wa = waPhone(party.phone);
  const send = (text: string) => {
    if (wa) void Linking.openURL(waLink(wa, text)).catch(() => void Share.share({ message: text }));
    else void Share.share({ message: text });
  };
  // Cobros y ofertas con las reglas de la Ley 2300 (horario, domingos y festivos, una vez al día). El ticket no entra.
  const sendRuled = async (text: string) => {
    const block = await contactBlock(entityId, partyId);
    setRule(block);
    if (block) return;
    send(text);
    void noteContact(entityId, partyId);
  };
  // Solo las de este cliente, aunque un servidor viejo ignore el filtro y devuelva todas.
  const mine = (sales.data ?? []).filter((s) => s.party_id === partyId);
  const active = mine.filter((s) => s.status === 'active');
  const last = active[0];
  const spent = active.reduce((n, s) => n + s.total, 0);
  const now = Date.now();
  const liveOffers = (offers.data ?? []).filter((o) => Date.parse(o.ends_at) > now && o.slots_left > 0);
  const dirty = name.trim() !== party.name || phone.trim() !== (party.phone ?? '') || note.trim() !== (party.note ?? '');

  return (
    <View style={styles.screen}>
      <SubScreenHeader title={party.name} subtitle={active.length ? `${active.length} ${active.length === 1 ? 'compra' : 'compras'} · ${formatPesos(spent)}` : 'Sin compras todavía'} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mensajes por WhatsApp</Text>
          {!wa ? (
            <Text style={styles.meta}>
              {party.phone ? `El celular guardado no sirve para WhatsApp. ${phoneProblem(party.phone) ?? ''} Corrígelo abajo; mientras tanto eliges a quién mandarlo.` : 'Sin celular: al tocar un mensaje eliges a quién mandarlo. Agrega su celular abajo para que se abra su chat.'}
            </Text>
          ) : null}
          {last ? (
            <Action icon="receipt-outline" title="Su último ticket" sub={`${formatPesos(last.total)} · ${shortDate(last.occurred_at)}`} onPress={() => send(ticketMessage({ customer: party.name, business: bizName, total: last.total, url: ticketUrl(API_URL, last.id) }))} />
          ) : null}
          {party.balance > 0 ? (
            <Action icon="time-outline" title="Recordarle lo que debe" sub={formatPesos(party.balance)} onPress={() => void sendRuled(debtMessage({ customer: party.name, business: bizName, balance: party.balance }))} />
          ) : null}
          {rule ? <Text style={styles.rule}>{rule}</Text> : null}
          {party.accepts_messages ? (
            <Action
              icon="pricetag-outline"
              title="Contarle una oferta"
              sub={liveOffers.length ? `${liveOffers.length} ${liveOffers.length === 1 ? 'activa' : 'activas'}` : 'No tienes ofertas activas'}
              disabled={!liveOffers.length}
              onPress={() => setOfferPick((v) => !v)}
            />
          ) : (
            <Text style={styles.meta}>Para mandarle ofertas, el cliente tiene que haber aceptado recibir mensajes (lo marcas abajo).</Text>
          )}
          {offerPick && party.accepts_messages
            ? liveOffers.map((o) => (
                <Pressable
                  key={o.id}
                  accessibilityRole="button"
                  onPress={() => void sendRuled(offerMessage({ customer: party.name, business: bizName, title: o.title, price: o.special_price ?? null, endsText: timeLeftLabel(Date.parse(o.ends_at) - now) }))}
                  style={styles.offerRow}
                >
                  <Text style={[styles.actionTitle, { flex: 1 }]} numberOfLines={1}>
                    {o.title}
                  </Text>
                  <Text style={styles.meta}>{timeLeftLabel(Date.parse(o.ends_at) - now)}</Text>
                </Pressable>
              ))
            : null}
          <Action icon="chatbubble-outline" title="Escribirle" sub="Un mensaje tuyo, con el saludo ya escrito" onPress={() => send(freeMessage({ customer: party.name, business: bizName }))} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Contacto</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Nombre" placeholderTextColor={colors.muted} style={styles.input} maxLength={80} accessibilityLabel="Nombre" />
          <TextInput value={phone} onChangeText={setPhone} placeholder="Celular" placeholderTextColor={colors.muted} style={styles.input} keyboardType="phone-pad" maxLength={20} accessibilityLabel="Celular" />
          <TextInput value={note} onChangeText={setNote} placeholder="Nota (opcional): «el del taller de la esquina»" placeholderTextColor={colors.muted} style={styles.input} maxLength={120} accessibilityLabel="Nota sobre el cliente" />
          {phoneProblem(phone) ? <Text style={styles.error}>{phoneProblem(phone)}</Text> : null}
          {dirty ? <Button title="Guardar" loading={update.isPending} onPress={() => update.mutate({ name: name.trim(), phone: phone.trim(), note: note.trim() })} /> : null}
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Acepta recibir mensajes</Text>
              <Text style={styles.meta}>
                {party.accepts_messages && party.consent_at ? `Desde el ${shortDate(party.consent_at)}. Si te pide no escribirle más, apágalo.` : 'Márcalo solo si el cliente te dio permiso para guardar su número y escribirle.'}
              </Text>
            </View>
            <Switch value={Boolean(party.accepts_messages)} onValueChange={(v) => update.mutate({ accepts_messages: v })} disabled={update.isPending} accessibilityLabel="Acepta recibir mensajes" />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{party.balance > 0 ? `Debe ${formatPesos(party.balance)}` : 'Al día'}</Text>
          {sales.isLoading ? <ActivityIndicator color={colors.ink} /> : null}
          {!sales.isLoading && !mine.length ? <Text style={styles.meta}>Cuando le vendas eligiéndolo como cliente, sus compras salen aquí.</Text> : null}
          {mine.map((s, i) => (
            <View key={s.id} style={[styles.saleRow, i > 0 && styles.saleLine]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.actionTitle, s.status !== 'active' && styles.voided]} numberOfLines={1}>
                  {(s.lines ?? []).map((l) => l.name).join(', ') || 'Venta'}
                </Text>
                <Text style={styles.meta}>{`${shortDate(s.occurred_at)} · ${METHOD_LABEL[s.method]}${s.status !== 'active' ? ' · anulada' : ''}`}</Text>
              </View>
              <Text style={[styles.amount, s.status !== 'active' && styles.voided]}>{formatPesos(s.total)}</Text>
              {s.status === 'active' ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Mandar el ticket de ${formatPesos(s.total)}`} hitSlop={8} onPress={() => send(ticketMessage({ customer: party.name, business: bizName, total: s.total, url: ticketUrl(API_URL, s.id) }))}>
                  <Ionicons name="share-outline" size={20} color={colors.primaryDark} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Action({ icon, title, sub, onPress, disabled }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.well }, disabled && { opacity: 0.5 }]}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={18} color={colors.primaryDark} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Ionicons name="logo-whatsapp" size={20} color={colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rule: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.danger },
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  cardTitle: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  meta: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.muted },
  input: { minHeight: 48, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  actionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  offerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, marginLeft: 48, borderTopWidth: 1, borderTopColor: colors.line },
  saleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52 },
  saleLine: { borderTopWidth: 1, borderTopColor: colors.line },
  amount: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  voided: { color: colors.muted, textDecorationLine: 'line-through' },
  error: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.danger },
});
