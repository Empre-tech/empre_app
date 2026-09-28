import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { aiApi } from '@/api/endpoints';
import type { AITextKind } from '@/api/types';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  kind: AITextKind;
  currentText?: string;
  businessName?: string;
  categoryName?: string;
  onApply: (text: string) => void;
  /** 'dark' para usarlo sobre fondos oscuros (ej. el visor de publicaciones). */
  variant?: 'light' | 'dark';
  /** Compacto: solo el ícono, sin la palabra "IA" (para espacios chicos). */
  compact?: boolean;
}

/**
 * Botón "Mejorar con IA" reutilizable: abre una hoja con 2-3 opciones de
 * texto generadas (descripción del negocio o caption de una publicación) y,
 * al elegir una, la aplica con `onApply`. El dueño siempre revisa y puede
 * pedir otras opciones o cerrar sin aplicar nada — la IA nunca escribe por
 * su cuenta sin que él lo confirme tocando una opción.
 */
export function AIWritingAssist({ kind, currentText, businessName, categoryName, onApply, variant = 'light', compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await aiApi.improveText({
        kind,
        current_text: currentText?.trim() || undefined,
        business_name: businessName?.trim() || undefined,
        category_name: categoryName?.trim() || undefined,
      });
      setSuggestions(res.suggestions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos generar sugerencias.');
    } finally {
      setLoading(false);
    }
  };

  const openSheet = () => {
    setOpen(true);
    setSuggestions([]);
    setError(null);
    void generate();
  };

  const apply = (text: string) => {
    onApply(text);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mejorar con inteligencia artificial"
        onPress={openSheet}
        style={({ pressed }) => [
          styles.trigger,
          variant === 'dark' ? styles.triggerDark : styles.triggerLight,
          pressed && styles.triggerPressed,
        ]}
      >
        <Ionicons name="sparkles" size={14} color={variant === 'dark' ? '#fff' : colors.primary} />
        {!compact ? (
          <Text style={[styles.triggerText, variant === 'dark' && styles.triggerTextDark]}>Mejorar con IA</Text>
        ) : null}
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderIcon}>
                <Ionicons name="sparkles" size={16} color={colors.primary} />
              </View>
              <Text style={styles.sheetTitle}>
                {kind === 'post_caption' ? 'Ideas para tu publicación' : 'Ideas para tu descripción'}
              </Text>
            </View>

            {loading ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loadingText}>Pensando en algunas opciones…</Text>
              </View>
            ) : error ? (
              <View style={styles.loadingBlock}>
                <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
                <Pressable accessibilityRole="button" onPress={() => void generate()} style={styles.retryButton}>
                  <Text style={styles.retryButtonText}>Reintentar</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.optionsList}>
                {suggestions.map((text, index) => (
                  <Pressable
                    key={index}
                    accessibilityRole="button"
                    accessibilityLabel={`Usar esta opción: ${text}`}
                    onPress={() => apply(text)}
                    style={({ pressed }) => [styles.optionCard, pressed && styles.optionCardPressed]}
                  >
                    <Text style={styles.optionText}>{text}</Text>
                    <View style={styles.optionUseRow}>
                      <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
                      <Text style={styles.optionUseText}>Usar esta</Text>
                    </View>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void generate()}
                  style={({ pressed }) => [styles.regenerateButton, pressed && styles.regenerateButtonPressed]}
                >
                  <Ionicons name="refresh" size={16} color={colors.ink} />
                  <Text style={styles.regenerateButtonText}>Generar otras opciones</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    height: 30,
    borderRadius: radius.pill,
  },
  triggerLight: { backgroundColor: 'rgba(225,87,43,0.12)' },
  triggerDark: { backgroundColor: 'rgba(255,255,255,0.18)' },
  triggerPressed: { opacity: 0.7 },
  triggerText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.primary },
  triggerTextDark: { color: '#fff' },
  backdrop: { flex: 1, backgroundColor: 'rgba(36,28,23,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sheetHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(225,87,43,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: { fontSize: 17, fontFamily: fonts.display.semibold, color: colors.ink },
  loadingBlock: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  loadingText: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  errorText: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.danger, textAlign: 'center' },
  retryButton: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  optionsList: { gap: spacing.sm },
  optionCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  optionCardPressed: { borderColor: colors.primary, backgroundColor: 'rgba(225,87,43,0.08)' },
  optionText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.ink },
  optionUseRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  optionUseText: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.primary },
  regenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: spacing.xs,
  },
  regenerateButtonPressed: { backgroundColor: colors.surface },
  regenerateButtonText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
});
