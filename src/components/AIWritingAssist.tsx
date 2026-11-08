import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { aiApi } from '@/api/endpoints';
import type { AITextKind } from '@/api/types';
import { EmpreSymbol } from '@/components/EmpreSymbol';
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
  /** El texto del botón; por defecto, «Mejorar con IA». */
  label?: string;
  /** Ideas listas, sin modelo: si el servicio falla, salen estas en vez de un error. */
  fallback?: string[];
}

/**
 * Botón "Mejorar con IA" reutilizable: abre una hoja con 2-3 opciones de
 * texto generadas (descripción del negocio, caption de una publicación o título de oferta) y,
 * al elegir una, la aplica con `onApply`. El dueño siempre revisa y puede
 * pedir otras opciones o cerrar sin aplicar nada — la IA nunca escribe por
 * su cuenta sin que él lo confirme tocando una opción.
 */
export function AIWritingAssist({ kind, currentText, businessName, categoryName, onApply, variant = 'light', compact = false, label = 'Mejorar con IA', fallback }: Props) {
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
      if (kind === 'offer_title') {
        try {
          const compat = await aiApi.improveText({
            kind: 'post_caption',
            current_text: `Título corto y directo para una oferta: ${currentText?.trim() || 'Promoción de hoy'}`,
            business_name: businessName?.trim() || undefined,
            category_name: categoryName?.trim() || undefined,
          });
          if (compat.suggestions?.length) {
            setSuggestions(compat.suggestions.map((s) => s.replace(/^["«]|["»]$/g, '').trim()).slice(0, 3));
            return;
          }
        } catch {
          // Si también falla la llamada compatible, usamos las ideas locales instantáneas.
        }
        const cleanBase = (currentText?.split('.')[0] ?? '').trim() || 'Oferta especial';
        const localIdeas = fallback?.length
          ? fallback
          : [`${cleanBase} solo por hoy`, `${cleanBase} a precio especial`, `Aprovecha hoy: ${cleanBase}`];
        setSuggestions(localIdeas);
        return;
      }
      if (fallback?.length) setSuggestions(fallback);
      else setError('Empre AI no pudo generar ideas ahora. Intenta de nuevo en un momento.');
      void e;
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
        {variant === 'dark' ? <Ionicons name="sparkles" size={14} color="#fff" /> : <EmpreSymbol product="ai" size={22} animated={false} />}
        {!compact ? (
          <Text style={[styles.triggerText, variant === 'dark' && styles.triggerTextDark]}>{label}</Text>
        ) : null}
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderIcon}>
                <EmpreSymbol product="ai" size={26} animated={false} />
              </View>
              <Text style={styles.sheetTitle}>
                {kind === 'post_caption' ? 'Ideas para tu publicación' : kind === 'offer_title' ? 'Ideas para tu oferta' : 'Ideas para tu descripción'}
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
  triggerLight: { backgroundColor: colors.selectedSoft },
  triggerDark: { backgroundColor: 'rgba(255,255,255,0.18)' },
  triggerPressed: { opacity: 0.7 },
  triggerText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  triggerTextDark: { color: '#fff' },
  backdrop: { flex: 1, backgroundColor: 'rgba(22,35,58,0.5)', justifyContent: 'flex-end' },
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
    backgroundColor: 'rgba(36,104,198,0.12)',
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
  optionCardPressed: { borderColor: colors.primary, backgroundColor: 'rgba(36,104,198,0.08)' },
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
