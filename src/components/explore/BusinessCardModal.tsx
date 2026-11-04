import { useRouter } from 'expo-router';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { track } from '@/analytics/track';
import { useAuth } from '@/auth/AuthContext';
import { BusinessSheet } from './BusinessSheet';
import type { WithDistance } from './FeaturedCard';

/** La misma tarjeta del mapa, para abrirla desde una lista: tocar afuera la cierra. */
export function BusinessCardModal({ entity, onClose, origin }: { entity: WithDistance | null; onClose: () => void; origin: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  if (!entity) return null;

  const leaveTo = (go: () => void) => {
    onClose();
    go();
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={styles.veil} />
      <View pointerEvents="box-none" style={[styles.area, { paddingBottom: insets.bottom }]}>
        <BusinessSheet
          entity={entity}
          isMine={false}
          qrOfferId={null}
          onClose={onClose}
          onDirections={() => {
            track('directions_tapped', entity.id, { origin });
            void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${entity.latitude},${entity.longitude}`);
          }}
          onMessage={() =>
            leaveTo(() => {
              if (status !== 'signedIn') {
                router.push('/(auth)/login');
                return;
              }
              track('contact_started', entity.id);
              router.push({ pathname: '/chat/[entityId]', params: { entityId: entity.id, name: entity.name, avatar: entity.profile_url } });
            })
          }
          onProfile={(offerId) => leaveTo(() => router.push({ pathname: '/business/[id]', params: offerId ? { id: entity.id, offer: offerId, src: origin } : { id: entity.id, src: origin } }))}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  veil: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(14,35,70,0.34)' },
  area: { flex: 1 },
});
