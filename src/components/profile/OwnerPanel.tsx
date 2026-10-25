import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EntityDetail, Offer } from '@/api/types';
import { Button } from '@/components/Button';
import { GrowthCard } from '@/components/profile/GrowthCard';
import { OwnerDiscoverCard } from '@/components/profile/OwnerDiscoverCard';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  business: EntityDetail;
  /** La oferta vigente que termina antes, si hay (para la tarjeta de Descubre). */
  offer?: Offer;
  followers: number;
  requiresPayment: boolean;
  agenda: boolean;
  onEdit: () => void;
  onPublishOffer: () => void;
  onCatalog: () => void;
  /** Subir fotos al perfil (el compositor de publicaciones). */
  onPhotos: () => void;
  onScan: () => void;
  onSubscription: () => void;
  onAgenda: () => void;
  onDirections?: () => void;
  onCall?: () => void;
}

/**
 * «Mi negocio»: las herramientas del dueño, aparte de lo que ve un cliente (que está en «Así te ven»). Primero lo que
 * pide atención (prueba gratis terminada), luego «Haz que tu negocio destaque» (se va al completarlo), la tarjeta de
 * Descubre y las acciones como botones de 44 pt o más.
 */
export function OwnerPanel({ business, offer, followers, requiresPayment, agenda, onEdit, onPublishOffer, onCatalog, onPhotos, onScan, onSubscription, onAgenda, onDirections, onCall }: Props) {
  return (
    <View style={styles.wrap}>
      {requiresPayment ? (
        <Pressable accessibilityRole="button" onPress={onSubscription} style={({ pressed }) => [styles.trial, pressed && styles.pressed]}>
          <Ionicons name="sparkles" size={18} color={colors.primary} />
          <View style={styles.trialText}>
            <Text style={styles.trialTitle}>Tu prueba gratis terminó</Text>
            <Text style={styles.trialSub}>Actívalo pronto o tu negocio se ocultará del mapa y las búsquedas.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ) : null}

      <GrowthCard
        entityId={business.id}
        onGo={(target) => (target === 'catalog' ? onCatalog() : target === 'offer' ? onPublishOffer() : target === 'photos' ? onPhotos() : onEdit())}
      />

      {followers > 0 ? (
        <View style={styles.followers}>
          <Ionicons name="people-outline" size={14} color={colors.primaryDark} />
          <Text style={styles.followersText}>
            {followers} {followers === 1 ? 'seguidor' : 'seguidores'}
          </Text>
        </View>
      ) : null}

      {business.is_verified ? null : <Text style={styles.pending}>Tu negocio aún no está verificado. Puedes editarlo mientras tanto.</Text>}

      <OwnerDiscoverCard business={business} offer={offer} onEdit={onEdit} onPublishOffer={onPublishOffer} />

      <Tool icon="flash-outline" label="Publicar oferta" onPress={onPublishOffer} />
      <Tool icon="pricetags-outline" label="Servicios y precios (catálogo)" onPress={onCatalog} />
      <Tool icon="scan-outline" label="Escanear canje" onPress={onScan} />
      <Tool icon="diamond-outline" label="Suscripción del negocio" onPress={onSubscription} dot={requiresPayment} />
      {agenda ? <Tool icon="calendar-outline" label="Agenda de citas" onPress={onAgenda} /> : null}
      {onDirections ? <Tool icon="navigate-outline" label="Cómo llegar" onPress={onDirections} /> : null}
      {onCall ? <Tool icon="call-outline" label="Llamar" onPress={onCall} /> : null}
      <Button title="Editar negocio" onPress={onEdit} />
    </View>
  );
}

function Tool({ icon, label, onPress, dot }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; dot?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={dot ? `${label}, requiere atención` : label} onPress={onPress} style={({ pressed }) => [styles.tool, pressed && styles.pressed]}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.toolText}>{label}</Text>
      {dot ? <View style={styles.dot} /> : null}
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  pressed: { opacity: 0.85 },
  trial: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft, borderWidth: 1.5, borderColor: colors.primary },
  trialText: { flex: 1, gap: 2 },
  trialTitle: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  trialSub: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  tip: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  tipText: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.bold, color: colors.warningInk },
  tipBtn: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.warningLine },
  tipBtnText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.warningInk },
  followers: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  followersText: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  pending: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.warningMid },
  tool: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  toolText: { flex: 1, fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
});
