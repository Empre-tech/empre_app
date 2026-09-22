import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { hasLocation } from '@/lib/geo';
import { resolveImageUrl } from '@/lib/image';
import { colors, fonts, radius, spacing } from '@/theme';

const PHONE_RE = /^[+\d\s()-]{7,}$/;

export default function BusinessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { status, user } = useAuth();

  const query = useQuery({
    queryKey: ['entity', id],
    queryFn: () => entitiesApi.get(id),
    enabled: Boolean(id),
  });
  const business = query.data;

  const photos = useMemo(() => [...(business?.photos ?? [])].sort((a, b) => a.order - b.order), [business?.photos]);
  const tile = (width - spacing.lg * 2 - 4) / 3;

  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Volver"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      style={[styles.back, { top: insets.top + spacing.sm }]}
    >
      <Ionicons name="chevron-back" size={22} color={colors.ink} />
    </Pressable>
  );

  if (query.isLoading) {
    return (
      <View style={styles.center}>
        {back}
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (query.isError || !business) {
    return (
      <View style={styles.center}>
        {back}
        <Text style={styles.muted}>No pudimos cargar este negocio.</Text>
        <Button title="Reintentar" variant="secondary" onPress={() => void query.refetch()} />
      </View>
    );
  }

  const isOwner = status === 'signedIn' && user?.id === business.owner_id;
  const bannerUrl = resolveImageUrl(business.banner_url);
  const contact = business.contact_info?.trim();
  const location = [business.address, business.city].filter(Boolean).join(', ');

  const onMessage = () => {
    if (status !== 'signedIn') {
      router.push('/(auth)/login');
      return;
    }
    router.push({ pathname: '/chat/[entityId]', params: { entityId: business.id, name: business.name } });
  };

  const onDirections = () => {
    const { latitude, longitude } = business;
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${latitude},${longitude}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    });
    if (url) void Linking.openURL(url);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        {bannerUrl ? <Image source={{ uri: bannerUrl }} style={styles.banner} contentFit="cover" /> : <View style={[styles.banner, styles.bannerEmpty]} />}

        <View style={styles.body}>
          <View style={styles.avatarWrap}>
            <Avatar uri={business.profile_url} name={business.name} size={88} />
          </View>

          <View style={styles.titleRow}>
            <Text style={styles.name}>{business.name}</Text>
            {business.is_verified ? <VerifiedBadge size={20} /> : null}
          </View>
          <Text style={styles.category}>{business.category?.name}</Text>
          {business.is_verified ? (
            <Text style={styles.verifiedNote}>Identidad verificada por Empre</Text>
          ) : isOwner ? (
            <Text style={styles.pendingNote}>
              Tu negocio aún no está verificado. Puedes editarlo mientras tanto.
            </Text>
          ) : null}

          {business.description ? <Text style={styles.description}>{business.description}</Text> : null}

          <View style={styles.infoBlock}>
            {location ? <InfoRow icon="location-outline" text={location} /> : null}
            {contact ? <InfoRow icon="call-outline" text={contact} /> : null}
          </View>

          <View style={styles.actions}>
            {!isOwner ? <Button title="Enviar mensaje" onPress={onMessage} /> : null}
            {isOwner ? (
              <Button
                title="Editar negocio"
                onPress={() => router.push({ pathname: '/business/edit/[id]', params: { id: business.id } })}
              />
            ) : null}
            {hasLocation(business) ? <Button title="Cómo llegar" variant="secondary" onPress={onDirections} /> : null}
            {contact && PHONE_RE.test(contact) ? (
              <Button title="Llamar" variant="secondary" onPress={() => void Linking.openURL(`tel:${contact.replace(/[^\d+]/g, '')}`)} />
            ) : null}
          </View>

          {photos.length > 0 ? (
            <>
              <Text style={styles.section}>Fotos</Text>
              <View style={styles.grid}>
                {photos.map((photo) => (
                  <Image
                    key={photo.id}
                    source={{ uri: resolveImageUrl(photo.url) ?? undefined }}
                    style={{ width: tile, height: tile, backgroundColor: colors.surface }}
                    contentFit="cover"
                    transition={150}
                  />
                ))}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
      {back}
    </View>
  );
}

function InfoRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={colors.muted} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.bg, padding: spacing.xl },
  muted: { color: colors.muted },
  back: {
    position: 'absolute',
    left: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: { width: '100%', height: 160, backgroundColor: colors.surface },
  bannerEmpty: { backgroundColor: colors.line },
  body: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  avatarWrap: {
    marginTop: -44,
    alignSelf: 'flex-start',
    borderRadius: 48,
    borderWidth: 4,
    borderColor: colors.bg,
    backgroundColor: colors.bg,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1, fontSize: 26, fontFamily: fonts.display.semibold, color: colors.ink },
  category: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.muted },
  verifiedNote: { fontSize: 13, color: colors.verified, fontWeight: '600', fontFamily: fonts.ui.semibold },
  pendingNote: { fontSize: 13, color: colors.warning, fontWeight: '600', fontFamily: fonts.ui.semibold },
  description: { fontSize: 15, lineHeight: 22, fontFamily: fonts.ui.medium, color: colors.ink, marginTop: spacing.sm },
  infoBlock: { gap: spacing.sm, marginTop: spacing.sm },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoText: { flex: 1, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  section: { fontSize: 18, fontWeight: '700', fontFamily: fonts.ui.bold, color: colors.ink, marginTop: spacing.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, borderRadius: radius.sm, overflow: 'hidden' },
});
