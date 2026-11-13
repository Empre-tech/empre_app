import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi } from '@/api/agenda';
import { useAuth } from '@/auth/AuthContext';
import { NO_PREFS, preferredPart, usable, usualByBusiness, type AgentPrefs } from '@/lib/agentMemory';
import { loadAgentPrefs, saveAgentPrefs } from '@/lib/agentPrefsStore';
import { colors, fonts } from '@/theme';

const NEVER = 'Pagar sin tu toque · compartir tus datos con otros negocios · escribirle a un negocio a tu nombre sin mostrártelo antes · usar tu voz o tu ubicación exacta fuera de la búsqueda';

/**
 * Lo que Agent sabe de ti (tablero «Para el cliente», teléfono 4). No hay memoria aparte: sale de tus citas hechas en
 * Empre. Se pausa por negocio o se olvida todo; tus citas no se borran (siguen en Mis citas), Agent deja de usarlas.
 */
export default function AgentPrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { status } = useAuth();
  const appts = useQuery({ queryKey: ['appointments'], queryFn: agendaApi.mine, enabled: status === 'signedIn', staleTime: 60_000 });
  const prefsQ = useQuery({ queryKey: ['agent-prefs'], queryFn: loadAgentPrefs });
  const prefs = prefsQ.data ?? NO_PREFS;

  const all = (appts.data ?? []).filter((a) => a.status === 'completed');
  const used = usable(appts.data ?? [], prefs);
  const usual = usualByBusiness(used);
  const part = preferredPart(used);
  const businesses = [...new Map(all.map((a) => [a.entity_id, a.entity?.name ?? 'Un negocio'])).entries()];

  const save = async (next: AgentPrefs) => {
    qc.setQueryData(['agent-prefs'], next);
    await saveAgentPrefs(next);
  };
  const toggle = (id: string, on: boolean) => void save({ ...prefs, paused: on ? prefs.paused.filter((x) => x !== id) : [...prefs.paused, id] });
  const forget = () => void save({ paused: [], forgetBefore: new Date().toISOString() });

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Lo que Agent sabe de ti
        </Text>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.lead}>Lo aprende de lo que reservas en Empre. Solo lo usa para ayudarte, y nunca se lo da a otros negocios.</Text>

        {usual.length || part ? (
          <View style={styles.card}>
            {usual.map((u) => (
              <View key={u.entityId} style={styles.row}>
                <Ionicons name="repeat" size={18} color={colors.ink} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>«Lo de siempre» en {u.entityName}</Text>
                  <Text style={styles.rowSub}>
                    {u.service} · {u.times === 1 ? 'la última vez' : `${u.times} veces`}
                  </Text>
                </View>
              </View>
            ))}
            {part ? (
              <View style={styles.row}>
                <Ionicons name="time-outline" size={18} color={colors.ink} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>Prefieres las {part.part}</Text>
                  <Text style={styles.rowSub}>De {part.of}</Text>
                </View>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.rowTitle}>{prefs.forgetBefore ? 'Olvidado' : 'Todavía nada'}</Text>
            <Text style={styles.rowSub}>
              {prefs.forgetBefore ? 'Agent no usa nada de antes. Tus citas siguen en Mis citas.' : 'Cuando reserves y vayas a un negocio, Agent te ofrecerá «lo de siempre» ahí.'}
            </Text>
          </View>
        )}

        {businesses.length ? (
          <>
            <Text style={styles.eyebrow}>Por negocio</Text>
            <View style={styles.card}>
              {businesses.map(([id, name]) => {
                const on = !prefs.paused.includes(id);
                return (
                  <View key={id} style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle}>{name}</Text>
                      <Text style={styles.rowSub}>{on ? 'Agent usa lo que hiciste aquí' : 'En pausa: Agent no lo usa'}</Text>
                    </View>
                    <Switch
                      value={on}
                      onValueChange={(v) => toggle(id, v)}
                      accessibilityLabel={`Usar lo que hiciste en ${name}`}
                      trackColor={{ true: colors.brand, false: colors.line }}
                      thumbColor={colors.surface}
                    />
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={styles.eyebrow}>Lo que nunca hace</Text>
        <View style={styles.card}>
          <Text style={styles.rowSub}>{NEVER}</Text>
        </View>

        {all.length ? (
          <Pressable accessibilityRole="button" onPress={forget} style={styles.forget}>
            <Text style={styles.forgetText}>Olvidar todo</Text>
            <Text style={styles.forgetSub}>Agent deja de usar tus citas de hasta hoy. No se borran de Mis citas.</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  title: { flex: 1, fontSize: 22, lineHeight: 26, fontFamily: fonts.display.bold, color: colors.ink },
  body: { paddingHorizontal: 16, gap: 12 },
  lead: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted },
  eyebrow: { marginTop: 4, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  card: { padding: 14, gap: 12, borderRadius: 16, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  rowSub: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  forget: { padding: 14, gap: 2, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center' },
  forgetText: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  forgetSub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
});
