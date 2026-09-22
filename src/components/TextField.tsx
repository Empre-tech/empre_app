import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
}

export function TextField({ label, error, style, ...inputProps }: Props) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        {...inputProps}
        style={[styles.input, error ? styles.inputError : null, style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', fontFamily: fonts.ui.semibold, color: colors.ink },
  input: {
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontFamily: fonts.ui.medium,
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  inputError: { borderColor: colors.danger },
  error: { fontSize: 13, color: colors.danger },
});
