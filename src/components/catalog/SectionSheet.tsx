import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@/api/client';
import { OTHER_SECTION, sectionsApi, useEntitySections, type Section, type SectionKind, type SectionPick } from '@/api/sections';
import { safeIcon } from '@/lib/icons';
import { normalize } from '@/lib/inventory';
import { cleanLabel } from '@/lib/supplies';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  visible: boolean;
  entityId: string;
  kind: SectionKind;
  /** Id de la sección elegida. */
  value?: string | null;
  onPick: (section: SectionPick) => void;
  onClose: () => void;
}

/**
 * Elegir la sección de un producto, servicio o insumo. Arriba las del negocio (las de su tipo de negocio y las que
 * agregó); debajo, el resto del catálogo de Empre. El dueño no crea secciones: si no encuentra la suya, la pide y,
 * mientras tanto, usa «Otros».
 */
export function SectionSheet(props: Props) {
  // Se monta al abrir, así la búsqueda arranca vacía cada vez.
  if (!props.visible) return null;
  return <SectionBody {...props} />;
}

function SectionBody({ visible, entityId, kind, value, onPick, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mineQ = useEntitySections(entityId, kind);
  const catalogQ = useQuery({ queryKey: ['sections', 'catalog', kind], queryFn: () => sectionsApi.catalog(kind), staleTime: 10 * 60 * 1000 });

  const q = normalize(query);
  const mine = useMemo(() => (mineQ.data ?? []).filter((s) => !q || normalize(s.name).includes(q)), [mineQ.data, q]);
  const more = useMemo(() => {
    const own = new Set((mineQ.data ?? []).map((s) => s.id));
    return (catalogQ.data ?? []).filter((s) => !own.has(s.id) && s.name !== OTHER_SECTION && (!q || normalize(s.name).includes(q)));
  }, [catalogQ.data, mineQ.data, q]);
  const exact = [...(mineQ.data ?? []), ...(catalogQ.data ?? [])].some((s) => normalize(s.name) === q);
  const canAsk = cleanLabel(query).length >= 2 && !exact;
  const other = (mineQ.data ?? []).find((s) => s.name === OTHER_SECTION);

  const pick = (s: Pick<Section, 'id' | 'name'>) => {
    onPick({ id: s.id, name: s.name });
    onClose();
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ['sections', entityId] });

  const add = useMutation({
    mutationFn: (s: Section) => sectionsApi.add(entityId, s.id),
    onSuccess: (s) => {
      void refresh();
      pick(s);
    },
    onError: () => setError('No se pudo agregar la sección. Revisa tu conexión.'),
  });
  const ask = useMutation({
    mutationFn: (name: string) => sectionsApi.request(entityId, kind, name),
    onSuccess: (res, name) => {
      if (res.section) {
        // Ya existía con otra escritura: quedó agregada.
        void refresh();
        pick(res.section);
        return;
      }
      setAsked(name);
      setQuery('');
    },
    onError: (e) => setError(e instanceof ApiError && e.status === 400 ? e.message : 'No se pudo enviar. Revisa tu conexión.'),
  });

  const loading = mineQ.isLoading;
  const word = kind === 'supply' ? 'insumo' : 'producto o servicio';
  const fallbackIcon = kind === 'supply' ? 'cube-outline' : 'pricetag-outline';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
          <View style={styles.grab} />
          <Text style={styles.title}>¿En qué sección va?</Text>
          <Text style={styles.meta}>{kind === 'supply' ? 'Así encuentras tus insumos rápido.' : 'Así se agrupa en tu perfil y en tu lista.'}</Text>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={(t) => {
                setQuery(t);
                setError(null);
              }}
              placeholder="Buscar sección"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              maxLength={40}
              autoCapitalize="sentences"
              accessibilityLabel="Buscar sección"
            />
          </View>

          {asked ? (
            <View style={styles.notice} accessibilityLiveRegion="polite">
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.noticeText}>
                Le pedimos «{asked}» al equipo de Empre. Te avisamos cuando esté. Mientras tanto, usa «{OTHER_SECTION}».
              </Text>
            </View>
          ) : null}

          <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.sm }}>
            {loading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : null}

            {mine.length > 0 ? <Text style={styles.label}>Tus secciones</Text> : null}
            <View accessibilityRole="radiogroup">
              {mine.map((s) => {
                const on = s.id === value;
                return (
                  <Pressable key={s.id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => pick(s)} style={styles.row}>
                    <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                    <Ionicons name={safeIcon(s.icon, fallbackIcon)} size={20} color={colors.muted} />
                    <Text style={[styles.name, s.name === OTHER_SECTION && { color: colors.muted }]}>{s.name}</Text>
                    {s.count ? <Text style={styles.meta}>{s.count}</Text> : null}
                  </Pressable>
                );
              })}
            </View>

            {more.length > 0 ? (
              <>
                <Text style={styles.label}>Más secciones</Text>
                {more.slice(0, q ? 40 : 12).map((s) => (
                  <Pressable
                    key={s.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Agregar ${s.name}`}
                    disabled={add.isPending}
                    onPress={() => add.mutate(s)}
                    style={styles.row}
                  >
                    <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                    <Ionicons name={safeIcon(s.icon, fallbackIcon)} size={20} color={colors.muted} />
                    <Text style={styles.name}>{s.name}</Text>
                  </Pressable>
                ))}
                {!q && more.length > 12 ? <Text style={styles.meta}>Escribe para buscar entre {more.length} secciones más.</Text> : null}
              </>
            ) : null}

            {canAsk && !loading ? (
              <View style={styles.askBox}>
                <Text style={styles.askTitle}>¿No encuentras tu sección?</Text>
                <Text style={styles.meta}>Pídela y el equipo de Empre la agrega. Mientras tanto, tu {word} va en «{OTHER_SECTION}».</Text>
                <View style={styles.askRow}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={ask.isPending}
                    onPress={() => ask.mutate(cleanLabel(query))}
                    style={[styles.askBtn, { flex: 1 }]}
                  >
                    {ask.isPending ? <ActivityIndicator color={colors.primaryDark} /> : <Text style={styles.askBtnText}>Pedir «{cleanLabel(query)}»</Text>}
                  </Pressable>
                  {other ? (
                    <Pressable accessibilityRole="button" onPress={() => pick(other)} style={styles.askBtnQuiet}>
                      <Text style={styles.askBtnQuietText}>Usar «{OTHER_SECTION}»</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}
          </ScrollView>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(22,35,58,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center' },
  title: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  meta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.bg },
  searchInput: { flex: 1, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  label: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 50, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D5DEEA', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  name: { flex: 1, fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  notice: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, borderRadius: radius.md, backgroundColor: '#E7F6EE' },
  noticeText: { flex: 1, fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.semibold, color: colors.ink },
  askBox: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.bg, marginTop: spacing.xs },
  askTitle: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  askRow: { flexDirection: 'row', gap: spacing.sm },
  askBtn: { minHeight: 46, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  askBtnText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  askBtnQuiet: { minHeight: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  askBtnQuietText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
});
