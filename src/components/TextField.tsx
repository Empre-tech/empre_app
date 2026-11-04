import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
  /** Elemento opcional al lado derecho de la etiqueta, ej. el botón "Mejorar con IA". */
  labelAccessory?: ReactNode;
}

export function TextField({ label, error, labelAccessory, style, onFocus, onBlur, ...inputProps }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, focused && !error && styles.labelFocused]}>{label}</Text>
        {labelAccessory}
      </View>
      <View style={[styles.halo, focused && !error && styles.haloOn]}>
        <TextInput
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...inputProps}
          style={[styles.input, focused && !error && styles.inputFocused, error ? styles.inputError : null, style]}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  label: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.ink },
  labelFocused: { color: colors.selected },
  halo: { borderRadius: radius.lg + 3, padding: 2, backgroundColor: 'transparent' },
  haloOn: { backgroundColor: colors.selectedSoft },
  input: {
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontFamily: fonts.ui.semibold,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  inputFocused: {
    borderColor: colors.selected,
  },
  inputError: { borderColor: colors.danger },
  error: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.danger },
});
