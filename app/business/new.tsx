import { Ionicons } from '@/components/Icon';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { categoriesApi } from '@/api/endpoints';
import { understandBusiness } from '@/lib/businessText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { BusinessForm, type BusinessDraft } from '@/components/BusinessForm';
import { Button } from '@/components/Button';
import { colors, fonts, radius, spacing } from '@/theme';

/** Crear un negocio nuevo (tablero «Primera vez», teléfono 3): primero se escribe como se diría y Empre entiende el
 * tipo, el horario y el nombre con reglas; luego el formulario llega lleno para revisar el resto (dirección en el mapa,
 * fotos) y publicar. También se puede hablar con el asistente o llenarlo paso a paso. Requiere sesión. */
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
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<BusinessDraft | undefined>(draftFromAI);
  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: 5 * 60_000 });
  const understood = useMemo(() => understandBusiness(text, categories.data ?? []), [text, categories.data]);
  const next = () => {
    setDraft({
      ...(understood.name ? { name: understood.name } : {}),
      description: text.trim(),
      ...(understood.categoryId ? { categoryId: understood.categoryId } : {}),
      ...(understood.hours ? { hours: understood.hours.hours } : {}),
    });
    setMode('manual');
  };

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
    return <BusinessForm draft={draft} />;
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.write, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          ¿Qué negocio tienes?
        </Text>
        <Text style={styles.lead}>Escríbelo como se lo dirías a un vecino. Empre lo ordena y tú lo revisas antes de publicar.</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          placeholder="Barbería en el centro, de lunes a sábado de 9 a 8"
          placeholderTextColor={colors.placeholder}
          accessibilityLabel="Tu negocio, como lo dirías"
          style={styles.input}
        />
        {understood.chips.length ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Entendí</Text>
            <View style={styles.chips}>
              {understood.chips.map((c) => (
                <View key={c.k} style={styles.chip}>
                  <Text style={styles.chipKey}>{c.k}</Text>
                  <Text style={styles.chipVal}>{c.v}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {understood.categoryName ? (
          <View style={styles.note}>
            <Ionicons name="sparkles" size={16} color={colors.primaryDark} />
            <Text style={styles.noteText}>
              Lo puse en <Text style={styles.noteStrong}>{understood.categoryName}</Text>. Así te encuentran quienes lo buscan cerca.
            </Text>
          </View>
        ) : text.trim().length > 12 && !understood.chips.length ? (
          <Text style={styles.hint}>Cuéntame qué haces y tu horario («de lunes a sábado de 9 a 8»). Lo demás lo llenas en el siguiente paso.</Text>
        ) : null}
        <View style={{ flex: 1 }} />
        <Button title="Seguir" disabled={!text.trim()} onPress={next} />
        <View style={styles.alt}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/business/new-ai')} style={styles.altBtn}>
            <Text style={styles.altText}>Prefiero hablarlo con el asistente</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setMode('manual')} style={styles.altBtn}>
            <Text style={styles.altText}>Llenarlo paso a paso</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.bg },
  screen: { flex: 1, backgroundColor: colors.surface },
  write: { flexGrow: 1, paddingHorizontal: 20, gap: spacing.md },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  title: { fontSize: 24, lineHeight: 28, fontFamily: fonts.display.bold, color: colors.ink, letterSpacing: -0.4 },
  lead: { fontSize: 15, lineHeight: 21, fontFamily: fonts.ui.medium, color: colors.muted },
  input: { minHeight: 110, padding: 14, borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink, fontSize: 16, lineHeight: 22, fontFamily: fonts.ui.medium, color: colors.ink, textAlignVertical: 'top' },
  label: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.well },
  chipKey: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  chipVal: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  note: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  noteText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.ink },
  noteStrong: { fontFamily: fonts.ui.bold },
  hint: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.muted },
  alt: { alignItems: 'center' },
  altBtn: { minHeight: 44, justifyContent: 'center' },
  altText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.muted },
});
