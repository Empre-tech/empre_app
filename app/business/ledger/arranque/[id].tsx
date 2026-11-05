import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmountField } from '@/components/ledger/parts';
import { StatusCap, SystemGroup, SystemHead, SystemRow } from '@/components/system/parts';
import { addOpeningDebt, saveFinanceSetup } from '@/ledger/financeSetup';
import { formatPesos } from '@/lib/ledger';
import { colors, fonts, softShadow } from '@/theme';

const QUESTIONS = [
  { title: '¿Cuánto hay hoy en tu caja?', why: 'Para saber si cuadra al cerrar.' },
  { title: '¿Alguien te debe de antes?', why: 'No se mezcla con lo que venga después.' },
  { title: '¿Qué pagas cada mes?', why: 'Arriendo, nómina, servicios. Para decirte cuánto necesitas cubrir.' },
];

/** Para empezar: tres preguntas opcionales. Lo que se salta no aparece luego como contestado. */
export default function ArranqueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [cash, setCash] = useState<number | null>(null);
  const [debtName, setDebtName] = useState('');
  const [debtAmount, setDebtAmount] = useState(0);
  const [monthly, setMonthly] = useState<number | null>(null);
  const [known, setKnown] = useState<{ title: string; sub: string; icon: 'cash-outline' | 'person-outline' | 'calendar-outline' }[]>([]);
  const done = step >= QUESTIONS.length;
  const q = QUESTIONS[Math.min(step, QUESTIONS.length - 1)];
  const valid = step === 0 ? cash !== null && cash > 0 : step === 1 ? debtName.trim().length > 0 && debtAmount > 0 : monthly !== null && monthly > 0;

  const finish = () => saveFinanceSetup(entityId, { done: true });
  const next = () => {
    if (step === 0 && cash) {
      saveFinanceSetup(entityId, { cash });
      setKnown((k) => [...k, { title: `En caja: ${formatPesos(cash)}`, sub: 'Lo usamos para cerrar la caja', icon: 'cash-outline' }]);
    } else if (step === 1) {
      addOpeningDebt(entityId, { kind: 'customer', name: debtName.trim(), amount: debtAmount, phone: '' });
      setKnown((k) => [...k, { title: `${debtName.trim()} te debe ${formatPesos(debtAmount)}`, sub: 'Queda en Cuentas', icon: 'person-outline' }]);
    } else if (step === 2 && monthly) {
      saveFinanceSetup(entityId, { monthly });
      setKnown((k) => [...k, { title: `Cada mes pagas ${formatPesos(monthly)}`, sub: 'Te diremos cuánto te falta cubrir', icon: 'calendar-outline' }]);
    }
    advance();
  };
  const advance = () => {
    if (step === QUESTIONS.length - 1) finish();
    setStep(step + 1);
  };
  const leave = () => router.replace({ pathname: '/business/ledger/[id]', params: { id: entityId } });
  const goSale = () => router.replace({ pathname: '/business/ledger/sale/[id]', params: { id: entityId } });

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}>
        <SystemHead lead="Empre Finance" name="Para empezar" />
        {!done ? (
          <>
            <View style={{ gap: 8 }}>
              <Text style={styles.step}>Pregunta {step + 1} de {QUESTIONS.length} · puedes saltarla</Text>
              <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: QUESTIONS.length, now: step + 1 }}>
                <View style={[styles.fill, { width: `${((step + 1) / QUESTIONS.length) * 100}%` }]} />
              </View>
            </View>
            <Text style={styles.title} accessibilityRole="header">
              {q.title}
            </Text>
            <Text style={styles.why}>{q.why}</Text>
            <View style={styles.field}>
              {step === 1 ? <TextInput value={debtName} onChangeText={setDebtName} placeholder="Quién" placeholderTextColor={colors.muted} autoCapitalize="words" maxLength={80} accessibilityLabel="Quién te debe" style={styles.input} /> : null}
              {step === 0 ? <AmountField value={cash ?? 0} onChange={setCash} autoFocus /> : step === 1 ? <AmountField value={debtAmount} onChange={setDebtAmount} /> : <AmountField value={monthly ?? 0} onChange={setMonthly} autoFocus />}
            </View>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !valid }} disabled={!valid} onPress={next} style={[styles.red, !valid && styles.redOff]}>
              <Text style={styles.redText}>Seguir</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={advance} style={styles.skip}>
              <Text style={styles.skipText}>Saltar por ahora</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title} accessibilityRole="header">
              {known.length > 0 ? 'Listo. Esto ya sabemos' : 'Sin problema'}
            </Text>
            {known.length > 0 ? (
              <SystemGroup>
                {known.map((k, i) => (
                  <SystemRow key={k.title} first={i === 0} icon={k.icon} title={k.title} sub={k.sub} />
                ))}
              </SystemGroup>
            ) : (
              <Text style={styles.why}>Empezamos con tu agenda y tu catálogo. Puedes contarnos lo demás cuando quieras.</Text>
            )}
            {known.length > 0 ? <Text style={styles.step}>Queda guardado en este teléfono.</Text> : null}
            <Pressable accessibilityRole="button" onPress={goSale} style={styles.red}>
              <Text style={styles.redText}>Registrar mi primera venta</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={leave} style={styles.skip}>
              <Text style={styles.skipText}>Ir a Finanzas</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
      <StatusCap />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 20, gap: 16 },
  step: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.line },
  fill: { height: 4, backgroundColor: colors.ink },
  title: { fontSize: 26, lineHeight: 30, fontFamily: fonts.display.bold, color: colors.ink },
  why: { fontSize: 14.5, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.muted },
  field: { gap: 10, padding: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  input: { minHeight: 50, paddingHorizontal: 12, borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, fontSize: 16, fontFamily: fonts.ui.medium, color: colors.ink },
  red: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.primary },
  redOff: { opacity: 0.45 },
  redText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: '#fff' },
  skip: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
});
