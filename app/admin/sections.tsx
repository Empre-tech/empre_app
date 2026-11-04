import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sectionsApi, type SectionRequest } from '@/api/sections';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { colors, fonts, radius, spacing } from '@/theme';

const TABS: { key: SectionRequest['status']; label: string }[] = [
  { key: 'open', label: 'Por revisar' },
  { key: 'added', label: 'Agregadas' },
  { key: 'dismissed', label: 'Descartadas' },
];

const KIND: Record<SectionRequest['kind'], string> = { sell: 'Lo que vende', supply: 'Insumo' };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

/**
 * Secciones que piden los negocios porque no están en el catálogo. Agregarla la crea en el catálogo de Empre (con el
 * nombre tal cual o corregido) y se la deja puesta al negocio que la pidió; descartarla la cierra.
 */
export default function AdminSectionsScreen() {
  const { status, user } = useAuth();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [tab, setTab] = useState<SectionRequest['status']>('open');
  const isAdmin = status === 'signedIn' && user?.role === 'admin';
  const list = useQuery({ queryKey: ['admin-section-requests', tab], queryFn: () => sectionsApi.adminRequests(tab), enabled: isAdmin });

  if (!isAdmin) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Secciones pedidas" />
        <Text style={styles.empty}>No tienes permisos para ver esta sección.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Secciones pedidas" />
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} accessibilityRole="button" accessibilityState={{ selected: tab === t.key }} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabOn]}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      {list.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} /> : null}
      <FlatList
        data={list.data ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
        ListEmptyComponent={list.isLoading ? null : <Text style={styles.empty}>{tab === 'open' ? 'No hay peticiones por revisar.' : 'Nada por aquí.'}</Text>}
        renderItem={({ item }) => <RequestCard req={item} onDone={() => void qc.invalidateQueries({ queryKey: ['admin-section-requests'] })} />}
      />
    </View>
  );
}

function RequestCard({ req, onDone }: { req: SectionRequest; onDone: () => void }) {
  const [name, setName] = useState(req.name);
  const [error, setError] = useState<string | null>(null);
  const resolve = useMutation({
    mutationFn: (action: 'add' | 'dismiss') => sectionsApi.adminResolve(req.id, action, action === 'add' ? name.trim() : undefined),
    onSuccess: onDone,
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo guardar.'),
  });
  const open = req.status === 'open';
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Ionicons name={req.kind === 'supply' ? 'leaf-outline' : 'pricetag-outline'} size={18} color={colors.primary} />
        <Text style={styles.kind}>{KIND[req.kind]}</Text>
        <Text style={styles.date}>{formatDate(req.created_at)}</Text>
      </View>
      <Text style={styles.name}>«{req.name}»</Text>
      <Text style={styles.meta}>Pedida por {req.entity_name || 'un negocio'}</Text>
      {open ? (
        <>
          <Text style={styles.label}>Nombre con el que queda en el catálogo</Text>
          <TextInput value={name} onChangeText={setName} maxLength={40} autoCapitalize="sentences" style={styles.input} accessibilityLabel="Nombre de la sección" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Button title="Descartar" variant="secondary" disabled={resolve.isPending} onPress={() => resolve.mutate('dismiss')} style={{ flex: 1 }} />
            <Button title="Agregar" loading={resolve.isPending} disabled={name.trim().length < 2} onPress={() => resolve.mutate('add')} style={{ flex: 1 }} />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  tab: { paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line },
  tabOn: { backgroundColor: colors.selectedSoft, borderColor: colors.ink },
  tabText: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.ink },
  tabTextOn: { color: colors.ink },
  empty: { padding: spacing.lg, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  kind: { flex: 1, fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  date: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  name: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  meta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  label: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink, marginTop: spacing.xs },
  input: { minHeight: 48, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  actions: { flexDirection: 'row', gap: spacing.sm },
  error: { fontSize: 13.5, fontFamily: fonts.ui.semibold, color: colors.danger },
});
