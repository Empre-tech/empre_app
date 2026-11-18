import { Ionicons } from '@/components/Icon';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { Chispa } from '@/components/ai/Chispa';
import { hourIdeas } from '@/lib/askChips';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';

/**
 * Buscar con Empre AI para quien no tiene negocio (3.66; tablero «Empre AI · un asistente por trabajo»): hablar, escribir
 * o una idea para esta hora. Hablar y escribir abren el mismo buscador (con el micrófono en la barra), así que dan los
 * mismos resultados; aquí no se anota nada de un negocio.
 */
export function EmpreAISheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const { status } = useAuth();
  const [hour] = useState(() => new Date().getHours());
  const ideas = hourIdeas(hour);

  const go = (then: () => void) => {
    onClose();
    then();
  };

  return (
    <>
      <Modal visible={visible} transparent animationType={reduce ? 'none' : 'slide'} onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Cerrar Empre AI" onPress={onClose} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]} accessibilityViewIsModal>
            <View style={styles.head}>
              <Chispa size={56} mood="reposo" />
              <View style={{ flex: 1 }}>
                <Text style={styles.title} accessibilityRole="header">
                  ¿En qué te ayudo?
                </Text>
                <Text style={styles.sub}>Pídelo como se lo dirías a un vecino</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={styles.close}>
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>

            <Pressable accessibilityRole="button" accessibilityLabel="Hablar con Empre AI" onPress={() => go(() => router.push({ pathname: '/ask', params: { voice: '1' } }))} style={({ pressed }) => [styles.talk, pressed && styles.pressed]}>
              <Ionicons name="mic" size={22} color="#FFFFFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.talkTitle}>Hablar con Empre AI</Text>
                <Text style={styles.talkSub}>«Una droguería abierta cerca»</Text>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => go(() => router.push('/ask'))} style={({ pressed }) => [styles.write, pressed && styles.pressed]}>
              <Ionicons name="keypad-outline" size={20} color={colors.ink} />
              <Text style={styles.writeText}>Escribirlo</Text>
            </Pressable>

            <Text style={styles.label}>Para esta hora</Text>
            <View style={styles.ideas}>
              {ideas.map((i) => (
                <Pressable key={i.ask} accessibilityRole="button" accessibilityLabel={`Buscar ${i.label}`} onPress={() => go(() => router.push({ pathname: '/ask', params: { q: i.ask } }))} style={({ pressed }) => [styles.idea, pressed && styles.pressed]}>
                  <Ionicons name={i.icon} size={16} color={colors.ink} />
                  <Text style={styles.ideaText}>{i.label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => go(() => router.push(status === 'signedIn' ? '/business/new' : '/(auth)/login'))}
              style={({ pressed }) => [styles.biz, pressed && styles.pressed]}
            >
              <Ionicons name="storefront-outline" size={16} color={colors.primaryDark} />
              <Text style={styles.bizText}>¿Tienes un negocio? Ponlo en Empre</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(14, 35, 70, 0.45)' },
  sheet: { paddingHorizontal: 16, paddingTop: 14, gap: 12, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  sub: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  talk: { minHeight: 60, borderRadius: 18, paddingHorizontal: 16, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 12 },
  talkTitle: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: '#FFFFFF' },
  talkSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: '#CBCED4' },
  write: { minHeight: 56, borderRadius: 18, paddingHorizontal: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 12 },
  writeText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  label: { marginTop: 4, fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  idea: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
  ideaText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  biz: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  bizText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  pressed: { opacity: 0.85 },
});
