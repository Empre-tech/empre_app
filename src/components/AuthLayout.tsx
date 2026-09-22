import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing } from '@/theme';

interface Props {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: spacing.xxl + insets.top / 2, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.brand}>Empre</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={styles.form}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  header: { gap: spacing.xs },
  brand: { fontSize: 16, fontWeight: '800', fontFamily: fonts.ui.extrabold, color: colors.primary, letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 30, fontFamily: fonts.display.semibold, color: colors.ink },
  subtitle: { fontSize: 15, color: colors.muted },
  form: { gap: spacing.lg },
});
