import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import { ledgerApi } from '@/api/ledger';
import { Button } from '@/components/Button';
import { Chip } from '@/components/ledger/parts';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { formatPesos, newClientId } from '@/lib/ledger';
import { nextTableName, openedAgo, projectTabs } from '@/lib/tabs';
import { useNow } from '@/lib/useNow';
import { queueTabOpen, useLedgerOutbox } from '@/ledger/ledgerStore';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * Cuentas abiertas: la mesa o el cliente que va pidiendo y paga al final. Abrir, agregar y cobrar funciona sin señal
 * (se envía cuando vuelve). Al cobrar, la cuenta es una venta normal.
 */
export default function TabsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow(30_000);
  const outbox = useLedgerOutbox();

  const business = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId) });
  const tables = business.data?.business_profile === 'food';
  const tabsQ = useQuery({ queryKey: ['ledger', entityId, 'tabs'], queryFn: () => ledgerApi.tabs(entityId), enabled: Boolean(entityId) });
  const { refetch } = tabsQ;
  useFocusEffect(useCallback(() => void refetch(), [refetch]));
  const tabs = useMemo(() => projectTabs(tabsQ.data ?? [], outbox.items, entityId), [tabsQ.data, outbox.items, entityId]);

  const [name, setName] = useState('');
  const suggestion = tables ? nextTableName(tabs) : '';

  const open = (raw: string) => {
    const n = raw.trim();
    if (!n) return;
    const existing = tabs.find((t) => t.name.trim().toLowerCase() === n.toLowerCase());
    const tabId = existing?.id ?? newClientId();
    if (!existing) queueTabOpen(entityId, { id: tabId, name: n });
    setName('');
    router.push({ pathname: '/business/ledger/tab', params: { entityId, tabId } });
  };

  const total = tabs.reduce((s, t) => s + t.total, 0);
  const title = tables ? 'Mesas' : 'Cuentas abiertas';

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubScreenHeader title={title} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tables ? 'Abrir una mesa' : 'Abrir una cuenta'}</Text>
          <Text style={styles.meta}>Se va llenando y se cobra al final. Mientras está abierta no cuenta como venta.</Text>
          <View style={styles.row}>
            <TextInput
              value={name}
              onChangeText={setName}
              onSubmitEditing={() => open(name)}
              placeholder={tables ? suggestion : 'Nombre del cliente o «Silla 2»'}
              placeholderTextColor={colors.muted}
              style={styles.input}
              maxLength={40}
              autoCapitalize="sentences"
              accessibilityLabel={tables ? 'Nombre de la mesa' : 'Nombre de la cuenta'}
            />
            <Button title="Abrir" onPress={() => open(name || suggestion)} disabled={!name.trim() && !suggestion} />
          </View>
          {tables && !name ? (
            <View style={styles.wrap}>
              <Chip label={suggestion} selected={false} onPress={() => open(suggestion)} />
              <Chip label="Para llevar" selected={false} onPress={() => open('Para llevar')} />
            </View>
          ) : null}
        </View>

        {tabsQ.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
        {tabs.length > 0 ? (
          <>
            <Text style={styles.blockTitle}>
              Abiertas · {tabs.length} · {formatPesos(total)} por cobrar
            </Text>
            <View style={styles.list}>
              {tabs.map((t, i) => {
                const items = t.lines.filter((l) => !l.removed).reduce((n, l) => n + l.qty, 0);
                return (
                  <Pressable
                    key={t.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.name}: ${formatPesos(t.total)}. Abrir`}
                    onPress={() => router.push({ pathname: '/business/ledger/tab', params: { entityId, tabId: t.id } })}
                    style={[styles.tabRow, i > 0 && styles.line]}
                  >
                    <View style={styles.badge}>
                      <Ionicons name={tables ? 'restaurant-outline' : 'person-outline'} size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{t.name}</Text>
                      <Text style={styles.meta}>
                        {items === 0 ? 'Vacía' : `${items} ${items === 1 ? 'cosa' : 'cosas'}`} · {openedAgo(t.opened_at, now)}
                        {t.pending ? ' · sin enviar' : ''}
                      </Text>
                    </View>
                    <Text style={styles.total}>{formatPesos(t.total)}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : !tabsQ.isLoading ? (
          <Text style={styles.meta}>{tables ? 'No hay mesas abiertas.' : 'No hay cuentas abiertas.'}</Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  cardTitle: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  meta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: { flex: 1, minHeight: 48, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink, backgroundColor: colors.bg },
  blockTitle: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  list: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  tabRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingHorizontal: spacing.md },
  line: { borderTopWidth: 1, borderTopColor: colors.line },
  badge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15.5, fontFamily: fonts.ui.bold, color: colors.ink },
  total: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
});
