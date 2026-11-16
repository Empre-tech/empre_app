import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { EmpreMark } from '@/components/EmpreButton';
import { setPhoneFlag } from '@/lib/phoneFlags';
import { colors, fonts, spacing } from '@/theme';

/** Se muestra una sola vez en este teléfono. */
export const WELCOME_FLAG = 'welcome-seen';

/**
 * La primera vez (tablero «Primera vez», teléfono 1): una frase, crear cuenta, entrar o mirar sin cuenta. Mirar sin
 * cuenta es de verdad: se ve todo, y la cuenta se pide solo para reservar, reclamar o escribir.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const go = (to: '/(auth)/register' | '/(auth)/login' | null) => {
    void setPhoneFlag(WELCOME_FLAG, '1');
    if (to) router.replace(to);
    else if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.top}>
        <View style={styles.brand} accessible accessibilityLabel="Empre">
          <EmpreMark size={44} color={colors.brandRef} />
          <Text style={styles.word}>empre</Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Los negocios a la puerta de tu casa
        </Text>
        <Text style={styles.lead}>Mira quién está abierto, reserva una hora y guarda las ofertas de tu barrio.</Text>
      </View>
      <View style={styles.actions}>
        <Button title="Crear cuenta" onPress={() => go('/(auth)/register')} />
        <Button title="Ya tengo cuenta" variant="secondary" onPress={() => go('/(auth)/login')} />
        <Pressable accessibilityRole="button" onPress={() => go(null)} style={styles.look}>
          <Text style={styles.lookText}>Mirar sin cuenta</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  body: { flexGrow: 1, paddingHorizontal: 20, justifyContent: 'space-between', gap: spacing.xl },
  top: { gap: 16, paddingTop: spacing.xl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  word: { fontSize: 28, fontFamily: fonts.display.bold, color: colors.ink, letterSpacing: -0.6 },
  title: { fontSize: 28, lineHeight: 32, fontFamily: fonts.display.bold, color: colors.ink, letterSpacing: -0.6 },
  lead: { fontSize: 15, lineHeight: 21, fontFamily: fonts.ui.medium, color: colors.muted },
  actions: { gap: spacing.sm },
  look: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  lookText: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.primaryDark },
});
