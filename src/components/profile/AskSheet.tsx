import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addQuestion, askMessage, quickQuestions, type CatalogCopy } from '@/lib/catalog';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { alpha, colors, fonts, radius, spacing } from '@/theme';
import { Chip } from '@/components/Chip';

interface Props {
  /** El ítem por el que se pregunta; null = cerrada. */
  item: string | null;
  businessName: string;
  copy: CatalogCopy;
  onClose: () => void;
  /** Abre el chat con el mensaje ya escrito. Nunca se envía solo: la persona lo revisa en el chat. */
  onSend: (message: string) => void;
}

/**
 * Preguntar por un ítem del catálogo (3.27/3.28): un mensaje ya escrito según el tipo de negocio («¿hoy tienen…?
 * ¿Hacen domicilio?», «¿tienen turno hoy para…?») que se puede cambiar, y preguntas rápidas que no repiten lo escrito.
 */
export function AskSheet({ item, businessName, copy, onClose, onSend }: Props) {
  const reduce = useReduceMotion();
  return (
    <Modal visible={item !== null} transparent animationType={reduce ? 'none' : 'slide'} onRequestClose={onClose}>
      {item !== null ? <AskBody key={item} item={item} businessName={businessName} copy={copy} onClose={onClose} onSend={onSend} /> : null}
    </Modal>
  );
}

function AskBody({ item, businessName, copy, onClose, onSend }: Props & { item: string }) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(() => askMessage(copy, item));
  const quick = quickQuestions(copy, text);
  return (
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} accessibilityViewIsModal>
        <View style={styles.handle} />
        <Text style={styles.title} accessibilityRole="header">
          Preguntar a {businessName}
        </Text>
        <Text style={styles.sub}>Sobre: {item}</Text>
        <TextInput value={text} onChangeText={setText} multiline style={styles.input} accessibilityLabel="Mensaje" maxLength={500} />
        {quick.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {quick.map((q) => (
              <Chip key={q} label={q} accessibilityLabel={`Añadir: ${q}`} onPress={() => setText((t) => addQuestion(t, q))} />
            ))}
          </ScrollView>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={text.trim().length === 0}
          onPress={() => onSend(text.trim())}
          style={({ pressed }) => [styles.send, text.trim().length === 0 && styles.sendOff, pressed && styles.pressed]}
        >
          <Text style={styles.sendText}>Escribir por mensaje</Text>
        </Pressable>
        <Text style={styles.note}>Se abre el chat con el mensaje listo; lo envías tú.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: alpha(colors.ink, 0.45) },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg + 2, borderTopRightRadius: radius.lg + 2, padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginBottom: spacing.xs },
  title: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  sub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  input: { minHeight: 84, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, padding: spacing.md, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink, textAlignVertical: 'top' },
  chips: { gap: 6 },
  send: { minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  sendOff: { opacity: 0.5 },
  sendText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.white },
  pressed: { opacity: 0.85 },
  note: { fontSize: 11.5, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
});
