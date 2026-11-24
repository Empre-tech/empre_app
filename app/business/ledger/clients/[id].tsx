import { Ionicons } from '@/components/Icon';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi } from '@/api/ledger';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { queueParty } from '@/ledger/ledgerStore';
import { phoneProblem } from '@/lib/customerMessages';
import { formatPesos, newClientId } from '@/lib/ledger';
import { colors, fonts, radius, spacing } from '@/theme';

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Clientes (2026-11-22): los que el negocio guardó al vender o fiar, con lo que deben. Tocar uno abre su historial y
 * los mensajes por WhatsApp. Agregar uno pide nombre, celular (opcional) y si autorizó recibir mensajes (Ley 1581).
 */
export default function ClientsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const list = useQuery({ queryKey: ['ledger', entityId, 'parties', 'customer'], queryFn: () => ledgerApi.parties(entityId, { kind: 'customer' }), enabled: Boolean(entityId) });
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const all = list.data ?? [];
    const k = fold(q.trim());
    return k ? all.filter((p) => fold(p.name).includes(k) || p.phone.replace(/\D/g, '').includes(k.replace(/\D/g, '') || '§')) : all;
  }, [list.data, q]);

  const open = (partyId: string) => router.push({ pathname: '/business/ledger/client', params: { entityId, partyId } });
  const save = () => {
    const n = name.trim();
    if (n.length < 2) return setError('Escribe el nombre (mínimo 2 letras).');
    const bad = phoneProblem(phone);
    if (bad) return setError(bad);
    if (!phone.trim()) return setError('Escribe su celular: así lo distingues de otro con el mismo nombre.');
    const clientId = newClientId();
    queueParty(entityId, { client_id: clientId, kind: 'customer', name: n, ...(phone.trim() ? { phone: phone.trim() } : {}), accepts_messages: consent });
    setAdding(false);
    setName('');
    setPhone('');
    setConsent(false);
    setError(null);
    // La cola lo manda al servidor; la lista se pide otra vez enseguida.
    setTimeout(() => void qc.invalidateQueries({ queryKey: ['ledger', entityId, 'parties'] }), 1500);
  };

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Clientes" subtitle={list.data ? `${list.data.length} guardados` : undefined} />
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + 96 }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            {adding ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Nuevo cliente</Text>
                <TextInput value={name} onChangeText={setName} placeholder="Nombre" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="words" maxLength={80} accessibilityLabel="Nombre del cliente" />
                <TextInput value={phone} onChangeText={setPhone} placeholder="Celular" placeholderTextColor={colors.muted} style={styles.input} keyboardType="phone-pad" maxLength={20} accessibilityLabel="Celular del cliente" />
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent((v) => !v)} style={styles.consentRow}>
                  <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={22} color={consent ? colors.primary : colors.muted} />
                  <Text style={styles.consentText}>El cliente aceptó que guarde su número y le escriba con ofertas y recordatorios.</Text>
                </Pressable>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <View style={styles.row}>
                  <Button title="Cancelar" variant="secondary" onPress={() => setAdding(false)} style={{ flex: 1 }} />
                  <Button title="Guardar" onPress={save} style={{ flex: 1 }} />
                </View>
              </View>
            ) : null}
            {(list.data?.length ?? 0) > 0 ? (
              <View style={styles.search}>
                <Ionicons name="search" size={18} color={colors.muted} />
                <TextInput value={q} onChangeText={setQ} placeholder="Buscar por nombre o celular" placeholderTextColor={colors.muted} style={styles.searchInput} accessibilityLabel="Buscar cliente" />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          list.isLoading ? (
            <ActivityIndicator color={colors.ink} style={{ marginTop: spacing.xl }} />
          ) : list.isError ? (
            <EmptyState icon="cloud-offline-outline" title="No pudimos cargar tus clientes" body="Revisa tu conexión e inténtalo de nuevo." action={{ title: 'Reintentar', onPress: () => void list.refetch() }} />
          ) : q ? (
            <Text style={styles.meta}>{`Nadie con «${q.trim()}».`}</Text>
          ) : (
            <EmptyState icon="people-outline" title="Aún no tienes clientes guardados" body="Se guardan cuando eliges o escribes el cliente al anotar una venta o un fiado. También puedes agregarlos aquí." />
          )
        }
        renderItem={({ item: p }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${p.name}${p.balance > 0 ? `, te debe ${formatPesos(p.balance)}` : ''}`} onPress={() => open(p.id)} style={({ pressed }) => [styles.rowCard, pressed && { backgroundColor: colors.well }]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{p.name.trim().charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[p.phone ? p.phone : 'Sin celular', p.accepts_messages ? 'Acepta mensajes' : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {p.balance > 0 ? <Text style={styles.owes}>{`Debe ${formatPesos(p.balance)}`}</Text> : null}
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        )}
      />
      {!adding ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button title="Agregar cliente" onPress={() => setAdding(true)} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  cardTitle: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: { minHeight: 48, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, minHeight: 44 },
  consentText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.ink },
  row: { flexDirection: 'row', gap: spacing.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line },
  searchInput: { flex: 1, minHeight: 44, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  name: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  meta: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  owes: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  error: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.danger },
  bar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
});
