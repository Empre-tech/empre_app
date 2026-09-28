import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { BusinessForm, type BusinessDraft } from '@/components/BusinessForm';
import { Button } from '@/components/Button';
import { colors, fonts, radius, spacing } from '@/theme';

/** Crear un negocio nuevo: requiere sesión iniciada. Antes de mostrar el
 * formulario, deja elegir entre llenarlo a mano o describírselo al asistente
 * de IA (que llega aquí mismo con `aiDraft`, ya listo para revisar). */
export default function NewBusinessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const { aiDraft } = useLocalSearchParams<{ aiDraft?: string }>();

  const draftFromAI = useMemo<BusinessDraft | undefined>(() => {
    if (!aiDraft) return undefined;
    try {
      return JSON.parse(aiDraft) as BusinessDraft;
    } catch {
      return undefined;
    }
  }, [aiDraft]);

  const [mode, setMode] = useState<'choose' | 'manual'>(draftFromAI ? 'manual' : 'choose');

  useEffect(() => {
    if (status === 'signedOut') router.replace('/(auth)/login');
  }, [status, router]);

  if (status !== 'signedIn') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.muted }}>Inicia sesión para crear un negocio.</Text>
        <Button title="Volver" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  if (mode === 'manual') {
    return <BusinessForm draft={draftFromAI} />;
  }

  return (
    <View style={[styles.chooseScreen, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        style={styles.back}
      >
        <Ionicons name="chevron-back" size={22} color={colors.ink} />
      </Pressable>

      <View style={styles.chooseHeader}>
        <Text style={styles.chooseTitle}>¿Cómo quieres crear tu negocio?</Text>
        <Text style={styles.chooseSubtitle}>De cualquier forma, al final puedes revisar y editar todo antes de publicarlo.</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/business/new-ai')}
        style={({ pressed }) => [styles.optionCard, styles.optionCardPrimary, pressed && styles.optionCardPressed]}
      >
        <View style={[styles.optionIcon, styles.optionIconPrimary]}>
          <Ionicons name="sparkles" size={22} color="#fff" />
        </View>
        <View style={styles.optionText}>
          <Text style={styles.optionTitle}>Crear con ayuda de IA</Text>
          <Text style={styles.optionSubtitle}>
            Cuéntale a la IA de tu negocio en tus palabras: ella sugiere nombre, categoría, descripción y horario.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => setMode('manual')}
        style={({ pressed }) => [styles.optionCard, pressed && styles.optionCardPressed]}
      >
        <View style={styles.optionIcon}>
          <Ionicons name="create-outline" size={22} color={colors.ink} />
        </View>
        <View style={styles.optionText}>
          <Text style={styles.optionTitle}>Crear manualmente</Text>
          <Text style={styles.optionSubtitle}>Llena el formulario paso a paso tú mismo.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.bg },
  chooseScreen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, gap: spacing.md },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  chooseHeader: { gap: spacing.xs, marginTop: spacing.md, marginBottom: spacing.sm },
  chooseTitle: { fontSize: 22, fontFamily: fonts.display.semibold, color: colors.ink },
  chooseSubtitle: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted, lineHeight: 20 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  optionCardPrimary: { borderColor: colors.primary },
  optionCardPressed: { opacity: 0.85 },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  optionIconPrimary: { backgroundColor: colors.primary },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { fontSize: 16, fontFamily: fonts.ui.bold, color: colors.ink },
  optionSubtitle: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, lineHeight: 18 },
});
