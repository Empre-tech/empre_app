import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Chispa, type ChispaMood } from '@/components/ai/Chispa';
import { Avatar } from '@/components/Avatar';
import { colors, fonts } from '@/theme';

/** El avatar de Empre AI junto a cada respuesta: la Chispa quieta (en pantalla solo se mueve la de arriba). */
export function AiAvatar({ size = 28 }: { size?: number }) {
  return <Chispa size={size} animated={false} />;
}

/** El avatar del dueño: la foto o inicial del negocio con la marca verde azulado de «persona del negocio». */
export function OwnerAvatar({ uri, name, size = 28 }: { uri?: string; name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size }} accessible={false}>
      <Avatar uri={uri} name={name} size={size} />
      <View style={styles.ownerMark}>
        <Ionicons name="checkmark" size={8} color="#FFFFFF" />
      </View>
    </View>
  );
}

const MOOD_TEXT: Record<ChispaMood, string> = {
  reposo: 'Al instante',
  pensando: 'Buscando…',
  responde: 'Respondió',
  nosabe: 'Se lo pasó al dueño',
  contento: 'Te sirvió',
};

/**
 * Las dos voces del chat, siempre visibles (3.62): Empre AI responde al instante lo frecuente y el dueño responde en
 * persona. Así nadie confunde quién le habla.
 */
export function ChatVoices({ avatar, businessName, online, ownerSub, mood = 'reposo' }: { avatar?: string; businessName: string; online: boolean; ownerSub: string; mood?: ChispaMood }) {
  return (
    <View style={styles.row} accessibilityRole="summary" accessibilityLabel={`Te responden Empre AI, al instante, y el dueño de ${businessName}: ${ownerSub}`}>
      <View style={styles.voice}>
        <Chispa size={30} mood={mood} />
        <View style={styles.texts}>
          <Text style={styles.name}>Empre AI</Text>
          <Text style={styles.sub}>{MOOD_TEXT[mood]}</Text>
        </View>
      </View>
      <View style={styles.voice}>
        <View>
          <Avatar uri={avatar} name={businessName} size={26} />
          <View style={[styles.dot, { backgroundColor: online ? '#14B8B0' : '#C7D2E0' }]} />
        </View>
        <View style={styles.texts}>
          <Text style={styles.name}>El dueño</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {ownerSub}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** El relevo: cuando el dueño contesta después de Empre AI, se ve el cambio de voz. */
export function HandoffLine() {
  return (
    <View style={styles.handoff} accessibilityRole="text">
      <View style={styles.handoffLine} />
      <Text style={styles.handoffText}>El dueño se unió · ahora te atiende en persona</Text>
      <View style={styles.handoffLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  voice: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.bg },
  texts: { flex: 1, minWidth: 0 },
  name: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  sub: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.muted },
  dot: { position: 'absolute', right: -2, bottom: -2, width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: colors.bg },
  ownerMark: { position: 'absolute', right: -3, bottom: -3, width: 13, height: 13, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#14B8B0', borderWidth: 2, borderColor: colors.bg },
  handoff: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
  handoffLine: { flex: 1, height: 1, backgroundColor: '#CFE9EC' },
  handoffText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.verified },
});
