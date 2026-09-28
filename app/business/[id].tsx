import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi, reviewsApi } from '@/api/endpoints';
import type { Photo } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { AIWritingAssist } from '@/components/AIWritingAssist';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { PostComposerSheet } from '@/components/PostComposerSheet';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useVideoPlayer, VideoView } from 'expo-video';
import { hasLocation } from '@/lib/geo';
import { formatReviewDate } from '@/lib/format';
import { resolveImageUrl } from '@/lib/image';
import { colors, fonts, radius, spacing } from '@/theme';

const PHONE_RE = /^[+\d\s()-]{7,}$/;

// Mismo orden que Go time.Weekday (0=domingo ... 6=sábado) y Date.getDay().
const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const SERVICE_MODE_LABELS: Record<string, { text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  in_place: { text: 'Atiende en el local', icon: 'storefront-outline' },
  delivery: { text: 'Solo a domicilio', icon: 'bicycle-outline' },
  both: { text: 'En el local y a domicilio', icon: 'checkmark-done-outline' },
};

function formatHourRow(h: { closed: boolean; is_24h: boolean; open_time: string; close_time: string }): string {
  if (h.closed) return 'Cerrado';
  if (h.is_24h) return 'Abierto 24 horas';
  return `${h.open_time} - ${h.close_time}`;
}

export default function BusinessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { status, user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['entity', id],
    queryFn: () => entitiesApi.get(id),
    enabled: Boolean(id),
  });
  const business = query.data;

  const photos = useMemo(() => [...(business?.photos ?? [])].sort((a, b) => a.order - b.order), [business?.photos]);
  const tile = (width - spacing.lg * 2 - 4) / 3;

  const isOwner = status === 'signedIn' && user?.id === business?.owner_id;

  // Publicaciones y Reseñas viven en pestañas (como Instagram: grilla /
  // etiquetados), no apiladas una tras otra, para que se entienda de un
  // vistazo que son dos cosas distintas.
  const [activeTab, setActiveTab] = useState<'posts' | 'reviews'>('posts');
  const [showHours, setShowHours] = useState(false);

  // Favorito: estado local optimista para que el corazón responda al toque
  // de inmediato, sincronizado con lo que devuelve el servidor.
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriting, setFavoriting] = useState(false);

  useEffect(() => {
    setIsFavorite(business?.is_favorite ?? false);
  }, [business?.is_favorite]);

  const toggleFavorite = async () => {
    if (!business) return;
    if (status !== 'signedIn') {
      router.push('/(auth)/login');
      return;
    }
    const next = !isFavorite;
    setIsFavorite(next);
    setFavoriting(true);
    try {
      await (next ? entitiesApi.favorite(business.id) : entitiesApi.unfavorite(business.id));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entity', id] }),
        queryClient.invalidateQueries({ queryKey: ['my-favorites'] }),
      ]);
    } catch (e) {
      setIsFavorite(!next);
      Alert.alert('No pudimos actualizar tus favoritos', e instanceof Error ? e.message : 'Intenta de nuevo.');
    } finally {
      setFavoriting(false);
    }
  };

  // Reseñas: lista pública + la mía (si ya dejé una), para poder ofrecer
  // "Escribir reseña" o "Editar mi reseña" según corresponda.
  const reviews = useQuery({
    queryKey: ['reviews', id],
    queryFn: () => reviewsApi.list(id),
    enabled: Boolean(id),
  });
  const myReview = useQuery({
    queryKey: ['review-mine', id],
    // 404 significa "todavía no has dejado una reseña", no un error de red.
    queryFn: async () => {
      try {
        return await reviewsApi.mine(id);
      } catch {
        return null;
      }
    },
    enabled: status === 'signedIn' && !isOwner && Boolean(id),
  });
  // Mientras `reviews` carga, mostramos el promedio que ya viene en el
  // negocio (calculado del lado del servidor); en cuanto responde, ese es el
  // que manda porque puede estar más fresco si el usuario acaba de reseñar.
  const ratingSummary = reviews.data?.summary ?? { average: business?.avg_rating ?? 0, count: business?.review_count ?? 0 };

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [ratingDraft, setRatingDraft] = useState(5);
  const [commentDraft, setCommentDraft] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [deletingReview, setDeletingReview] = useState(false);

  const openReviewModal = () => {
    if (status !== 'signedIn') {
      router.push('/(auth)/login');
      return;
    }
    setRatingDraft(myReview.data?.rating ?? 5);
    setCommentDraft(myReview.data?.comment ?? '');
    setReviewModalOpen(true);
  };

  const saveReview = async () => {
    if (!business) return;
    setSavingReview(true);
    try {
      await reviewsApi.upsert(business.id, { rating: ratingDraft, comment: commentDraft.trim() });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reviews', id] }),
        queryClient.invalidateQueries({ queryKey: ['review-mine', id] }),
        queryClient.invalidateQueries({ queryKey: ['entity', id] }),
      ]);
      setReviewModalOpen(false);
    } catch (e) {
      Alert.alert('No pudimos guardar tu reseña', e instanceof Error ? e.message : 'Intenta de nuevo.');
    } finally {
      setSavingReview(false);
    }
  };

  const deleteReview = () => {
    if (!business) return;
    Alert.alert('Eliminar reseña', '¿Seguro que quieres eliminar tu reseña?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          setDeletingReview(true);
          try {
            await reviewsApi.remove(business.id);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['reviews', id] }),
              queryClient.invalidateQueries({ queryKey: ['review-mine', id] }),
              queryClient.invalidateQueries({ queryKey: ['entity', id] }),
            ]);
            setReviewModalOpen(false);
          } catch (e) {
            Alert.alert('No pudimos eliminar', e instanceof Error ? e.message : 'Intenta de nuevo.');
          } finally {
            setDeletingReview(false);
          }
        },
      },
    ]);
  };

  // Visor de publicaciones a pantalla completa (estilo Instagram).
  //
  // `openIndex` es la ÚNICA fuente de verdad de si el visor está abierto
  // (controla `visible` del Modal) y solo lo tocan openViewer/closeViewer.
  // `currentIndex` es la foto que se ve mientras se desliza, y la actualiza
  // el FlatList al deslizar. Antes usábamos un solo estado para ambas cosas:
  // al cerrar con la "X", el FlatList seguía montado durante la animación de
  // cierre del Modal y a veces disparaba un `onMomentumScrollEnd` tardío que
  // volvía a poner un índice no nulo, reabriendo el visor solo. Separarlos
  // evita que un evento de scroll pueda reabrir nada: solo mueve el "cursor"
  // de la foto activa, nunca la visibilidad.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [captionDraft, setCaptionDraft] = useState('');
  const [captionDirty, setCaptionDirty] = useState(false);
  const [savingCaption, setSavingCaption] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const viewerListRef = useRef<FlatList<Photo>>(null);

  // Al abrir el visor, arrancamos el "cursor" en la foto tocada.
  useEffect(() => {
    if (openIndex === null) return;
    setCurrentIndex(openIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIndex]);

  // Al abrir o cambiar de foto (swipe), sincronizamos el borrador de
  // descripción con la foto activa, salvo mientras el propio usuario la edita.
  useEffect(() => {
    if (openIndex === null) return;
    setCaptionDraft(photos[currentIndex]?.caption ?? '');
    setCaptionDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const openViewer = (index: number) => setOpenIndex(index);
  const closeViewer = () => setOpenIndex(null);

  const onPostPublished = () => {
    void queryClient.invalidateQueries({ queryKey: ['entity', id] });
  };

  const saveCaption = async () => {
    if (!business || openIndex === null) return;
    const photo = photos[currentIndex];
    if (!photo) return;
    setSavingCaption(true);
    try {
      await entitiesApi.updateImageCaption(business.id, photo.id, captionDraft.trim());
      await queryClient.invalidateQueries({ queryKey: ['entity', id] });
      setCaptionDirty(false);
    } catch (e) {
      Alert.alert('No pudimos guardar', e instanceof Error ? e.message : 'Intenta de nuevo.');
    } finally {
      setSavingCaption(false);
    }
  };

  const deletePost = (photo: Photo) => {
    if (!business) return;
    Alert.alert('Eliminar publicación', '¿Seguro que quieres eliminarla? Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await entitiesApi.deleteImage(business.id, photo.id);
            await queryClient.invalidateQueries({ queryKey: ['entity', id] });
            closeViewer();
          } catch (e) {
            Alert.alert('No pudimos eliminar', e instanceof Error ? e.message : 'Intenta de nuevo.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

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

  const bannerUrl = resolveImageUrl(business.banner_url);
  const contact = business.contact_info?.trim();
  const location = [business.address, business.city].filter(Boolean).join(', ');
  const activePhoto = openIndex !== null ? photos[currentIndex] : null;

  const favoriteButton = !isOwner ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      accessibilityState={{ selected: isFavorite }}
      onPress={() => void toggleFavorite()}
      disabled={favoriting}
      style={[styles.back, styles.favoriteButton, { top: insets.top + spacing.sm }]}
    >
      {favoriting ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={20} color={isFavorite ? colors.primary : colors.ink} />
      )}
    </Pressable>
  ) : null;

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
          <View style={styles.badgesRow}>
            {ratingSummary.count > 0 ? (
              <View style={styles.ratingBadgeRow}>
                <StarRow rating={ratingSummary.average} size={14} />
                <Text style={styles.ratingBadgeText}>
                  {ratingSummary.average.toFixed(1)} ({ratingSummary.count})
                </Text>
              </View>
            ) : null}
            {business.hours && business.hours.length > 0 ? (
              <View style={[styles.openBadge, business.is_open_now ? styles.openBadgeOpen : styles.openBadgeClosed]}>
                <View style={[styles.openDot, business.is_open_now ? styles.openDotOpen : styles.openDotClosed]} />
                <Text style={[styles.openBadgeText, business.is_open_now ? styles.openBadgeTextOpen : styles.openBadgeTextClosed]}>
                  {business.is_open_now ? 'Abierto ahora' : 'Cerrado ahora'}
                </Text>
              </View>
            ) : null}
          </View>
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
            {business.service_mode && SERVICE_MODE_LABELS[business.service_mode] ? (
              <InfoRow
                icon={SERVICE_MODE_LABELS[business.service_mode].icon}
                text={SERVICE_MODE_LABELS[business.service_mode].text}
              />
            ) : null}
          </View>

          {business.hours && business.hours.length > 0 ? (
            <View style={styles.hoursBlock}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowHours((v) => !v)}
                style={styles.hoursToggle}
              >
                <Ionicons name="time-outline" size={18} color={colors.muted} />
                <Text style={styles.infoText}>Ver horario de atención</Text>
                <Ionicons name={showHours ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </Pressable>
              {showHours ? (
                <View style={styles.hoursTable}>
                  {[...business.hours]
                    .sort((a, b) => a.weekday - b.weekday)
                    .map((h) => (
                      <View key={h.weekday} style={styles.hoursTableRow}>
                        <Text style={styles.hoursTableDay}>{WEEKDAY_LABELS[h.weekday]}</Text>
                        <Text style={styles.hoursTableTime}>{formatHourRow(h)}</Text>
                      </View>
                    ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.actions}>
            {!isOwner ? <Button title="Enviar mensaje" onPress={onMessage} /> : null}
            {isOwner ? (
              <Button
                title="Editar negocio"
                onPress={() => router.push({ pathname: '/business/edit/[id]', params: { id: business.id } })}
              />
            ) : null}
            {hasLocation(business) || (contact && PHONE_RE.test(contact)) ? (
              <View style={styles.secondaryActions}>
                {hasLocation(business) ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={onDirections}
                    style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
                  >
                    <Ionicons name="navigate-outline" size={18} color={colors.ink} />
                    <Text style={styles.secondaryActionText}>Cómo llegar</Text>
                  </Pressable>
                ) : null}
                {hasLocation(business) && contact && PHONE_RE.test(contact) ? <View style={styles.secondaryDivider} /> : null}
                {contact && PHONE_RE.test(contact) ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void Linking.openURL(`tel:${contact.replace(/[^\d+]/g, '')}`)}
                    style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
                  >
                    <Ionicons name="call-outline" size={18} color={colors.ink} />
                    <Text style={styles.secondaryActionText}>Llamar</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.tabBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: activeTab === 'posts' }}
            onPress={() => setActiveTab('posts')}
            style={[styles.tabItem, activeTab === 'posts' && styles.tabItemActive]}
          >
            <Ionicons name="grid-outline" size={18} color={activeTab === 'posts' ? colors.ink : colors.muted} />
            <Text style={[styles.tabLabel, activeTab === 'posts' && styles.tabLabelActive]}>
              Publicaciones{photos.length > 0 ? ` (${photos.length})` : ''}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: activeTab === 'reviews' }}
            onPress={() => setActiveTab('reviews')}
            style={[styles.tabItem, activeTab === 'reviews' && styles.tabItemActive]}
          >
            <Ionicons name="star-outline" size={18} color={activeTab === 'reviews' ? colors.ink : colors.muted} />
            <Text style={[styles.tabLabel, activeTab === 'reviews' && styles.tabLabelActive]}>
              Reseñas{ratingSummary.count > 0 ? ` (${ratingSummary.count})` : ''}
            </Text>
          </Pressable>
        </View>

        {activeTab === 'posts' ? (
          <View style={styles.tabContent}>
            {photos.length > 0 || isOwner ? (
              <View style={styles.grid}>
                {isOwner ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Nueva publicación"
                    onPress={() => setComposerOpen(true)}
                    style={({ pressed }) => [{ width: tile, height: tile }, styles.addTile, pressed && styles.tilePressed]}
                  >
                    <View style={styles.addTileIcon}>
                      <Ionicons name="add" size={22} color={colors.primary} />
                    </View>
                    <Text style={styles.addTileText}>Nueva</Text>
                  </Pressable>
                ) : null}

                {photos.map((photo, index) => {
                  const isVideo = isVideoPost(photo);
                  return (
                    <Pressable
                      key={photo.id}
                      onPress={() => openViewer(index)}
                      style={({ pressed }) => [{ width: tile, height: tile }, pressed && styles.tilePressed]}
                    >
                      {isVideo ? (
                        <GridVideoThumb uri={resolveImageUrl(photo.url) ?? ''} />
                      ) : (
                        <Image
                          source={{ uri: resolveImageUrl(photo.url) ?? undefined }}
                          style={styles.tileImage}
                          contentFit="cover"
                          transition={150}
                        />
                      )}
                      {isVideo ? (
                        <View style={styles.videoBadge}>
                          <Ionicons name="play" size={10} color="#fff" />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={[styles.emptyPosts, styles.emptyPostsOutsideBody]}>
                <Ionicons name="images-outline" size={28} color={colors.muted} />
                <Text style={styles.emptyPostsText}>Este negocio todavía no tiene publicaciones.</Text>
              </View>
            )}

            {isOwner && photos.length === 0 ? (
              <Text style={styles.addHint}>Sube tu primera foto o video para atraer más clientes.</Text>
            ) : null}
          </View>
        ) : (
          <View style={[styles.tabContent, styles.body]}>
            {!isOwner ? (
              <View style={styles.tabContentHeaderInline}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={myReview.data ? 'Editar mi reseña' : 'Escribir una reseña'}
                  onPress={openReviewModal}
                  style={styles.addButton}
                >
                  <Ionicons name={myReview.data ? 'create-outline' : 'add'} size={16} color={colors.primary} />
                  <Text style={styles.addButtonText}>{myReview.data ? 'Editar' : 'Escribir'}</Text>
                </Pressable>
              </View>
            ) : null}

            {reviews.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
            ) : (reviews.data?.data.length ?? 0) > 0 ? (
              <View style={styles.reviewsList}>
                {reviews.data!.data.map((review) => (
                  <View key={review.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Avatar uri={review.user.profile_picture_url} name={review.user.name} size={36} />
                      <View style={styles.reviewHeaderInfo}>
                        <Text style={styles.reviewName} numberOfLines={1}>
                          {review.user.name}
                        </Text>
                        <StarRow rating={review.rating} size={12} />
                      </View>
                      <Text style={styles.reviewDate}>{formatReviewDate(review.created_at)}</Text>
                    </View>
                    {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyPosts}>
                <Ionicons name="star-outline" size={28} color={colors.muted} />
                <Text style={styles.emptyPostsText}>
                  {isOwner ? 'Este negocio todavía no tiene reseñas.' : 'Sé el primero en dejar una reseña.'}
                </Text>
                {!isOwner ? (
                  <Button title="Escribir reseña" variant="secondary" onPress={openReviewModal} style={styles.emptyPostsButton} />
                ) : null}
              </View>
            )}
          </View>
        )}
      </ScrollView>
      {back}
      {favoriteButton}

      <Modal visible={openIndex !== null} animationType="fade" onRequestClose={closeViewer}>
        <View style={styles.viewer}>
          <FlatList
            ref={viewerListRef}
            data={photos}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={openIndex ?? 0}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            onMomentumScrollEnd={(event) => {
              // Solo mueve el "cursor" de foto activa; nunca controla si el
              // visor está abierto, así un evento tardío del cierre no reabre nada.
              const next = Math.round(event.nativeEvent.contentOffset.x / width);
              setCurrentIndex(next);
            }}
            renderItem={({ item, index }) => (
              <View style={[styles.viewerSlide, { width }]}>
                {isVideoPost(item) ? (
                  <ViewerVideoSlide uri={resolveImageUrl(item.url) ?? ''} active={index === currentIndex} />
                ) : (
                  <Image
                    source={{ uri: resolveImageUrl(item.url) ?? undefined }}
                    style={styles.viewerImage}
                    contentFit="contain"
                  />
                )}
              </View>
            )}
          />

          <ViewerScrim position="top" height={110} />
          <ViewerScrim position="bottom" height={220} />

          <View style={[styles.viewerHeader, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={closeViewer} style={styles.viewerIconButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
            {photos.length > 1 ? (
              <Text style={styles.viewerCounter}>
                {currentIndex + 1} / {photos.length}
              </Text>
            ) : null}
            {isOwner && activePhoto ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Eliminar publicación"
                onPress={() => deletePost(activePhoto)}
                disabled={deleting}
                style={styles.viewerIconButton}
              >
                {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="trash-outline" size={20} color="#fff" />}
              </Pressable>
            ) : (
              <View style={styles.viewerIconButton} />
            )}
          </View>

          {activePhoto ? (
            <View style={[styles.viewerFooter, { paddingBottom: insets.bottom + spacing.md }]}>
              {isOwner ? (
                <View style={styles.captionEditor}>
                  <View style={styles.captionAssistRow}>
                    <AIWritingAssist
                      kind="post_caption"
                      currentText={captionDraft}
                      businessName={business.name}
                      categoryName={business.category?.name}
                      variant="dark"
                      onApply={(text) => {
                        setCaptionDraft(text);
                        setCaptionDirty(true);
                      }}
                    />
                  </View>
                  <View style={styles.captionRow}>
                    <TextInput
                      value={captionDraft}
                      onChangeText={(value) => {
                        setCaptionDraft(value);
                        setCaptionDirty(true);
                      }}
                      placeholder="Agrega una descripción…"
                      placeholderTextColor="rgba(255,255,255,0.6)"
                      style={styles.captionInput}
                      maxLength={200}
                    />
                    {captionDirty ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Guardar descripción"
                        onPress={() => void saveCaption()}
                        disabled={savingCaption}
                        style={styles.captionSave}
                      >
                        {savingCaption ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="checkmark" size={18} color="#fff" />
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : activePhoto.caption ? (
                <Text style={styles.viewerCaption}>{activePhoto.caption}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal visible={reviewModalOpen} animationType="fade" transparent onRequestClose={() => setReviewModalOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setReviewModalOpen(false)}>
          <Pressable style={styles.reviewModalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.modalTitle}>{myReview.data ? 'Editar tu reseña' : 'Escribir una reseña'}</Text>
            <StarPicker value={ratingDraft} onChange={setRatingDraft} />
            <TextInput
              value={commentDraft}
              onChangeText={setCommentDraft}
              placeholder="Cuéntale a otros cómo fue tu experiencia (opcional)"
              placeholderTextColor={colors.muted}
              style={styles.reviewCommentInput}
              multiline
              maxLength={500}
            />
            <Button title={savingReview ? 'Guardando…' : 'Guardar reseña'} onPress={() => void saveReview()} disabled={savingReview} />
            {myReview.data ? (
              <Button
                title={deletingReview ? 'Eliminando…' : 'Eliminar reseña'}
                variant="ghost"
                onPress={deleteReview}
                disabled={savingReview || deletingReview}
              />
            ) : (
              <Button title="Cancelar" variant="ghost" onPress={() => setReviewModalOpen(false)} disabled={savingReview} />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <PostComposerSheet
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
        entityId={business.id}
        businessName={business.name}
        categoryName={business.category?.name}
        onPublished={onPostPublished}
      />
    </View>
  );
}

/** Una publicación es un video si el content_type que devolvió el backend empieza con "video/". */
function isVideoPost(photo: Photo): boolean {
  return photo.content_type?.startsWith('video/') ?? false;
}

/** Miniatura de video en la cuadrícula: reproduce en silencio y en bucle, como una vista previa. */
function GridVideoThumb({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={styles.tileImage} contentFit="cover" nativeControls={false} />;
}

/** Video del visor a pantalla completa: solo reproduce mientras es la diapositiva activa, con silencio opcional. */
function ViewerVideoSlide({ uri, active }: { uri: string; active: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  return (
    <View style={styles.viewerVideoWrap}>
      <VideoView player={player} style={styles.viewerImage} contentFit="contain" nativeControls={false} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Activar sonido' : 'Silenciar'}
        onPress={() => setMuted((m) => !m)}
        style={styles.muteButton}
      >
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
      </Pressable>
    </View>
  );
}

/**
 * Degradado falso (sin depender de expo-linear-gradient) hecho con varias
 * franjas semitransparentes cada vez más oscuras: así el fondo del visor se
 * funde con la foto en vez de verse como una caja negra plana pegada encima,
 * y el texto queda legible sin importar qué tan clara sea la foto de fondo.
 */
function ViewerScrim({ position, height }: { position: 'top' | 'bottom'; height: number }) {
  const bands = 10;
  const items = Array.from({ length: bands });
  return (
    <View
      pointerEvents="none"
      style={[
        styles.scrim,
        position === 'top' ? { top: 0 } : { bottom: 0 },
        { height, flexDirection: position === 'top' ? 'column' : 'column-reverse' },
      ]}
    >
      {items.map((_, i) => {
        const t = (i + 1) / bands;
        return <View key={i} style={{ flex: 1, backgroundColor: `rgba(18,13,10,${(t * 0.7).toFixed(2)})` }} />;
      })}
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

/** Fila de estrellas de solo lectura; admite medias estrellas para promedios. */
function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => {
        const diff = rating - n + 1;
        const name = diff >= 1 ? 'star' : diff >= 0.5 ? 'star-half' : 'star-outline';
        return <Ionicons key={n} name={name} size={size} color={colors.warning} />;
      })}
    </View>
  );
}

/** Selector de calificación (1 a 5 estrellas) para el formulario de reseña. */
function StarPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  return (
    <View style={styles.starPicker}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} estrellas`} onPress={() => onChange(n)} hitSlop={6}>
          <Ionicons name={n <= value ? 'star' : 'star-outline'} size={32} color={colors.warning} />
        </Pressable>
      ))}
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
  favoriteButton: { left: undefined, right: spacing.md },
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
  // Barra segmentada de acciones secundarias (Cómo llegar / Llamar): un solo
  // contenedor tipo "pill" con divisor interno, en vez de dos botones
  // apilados a todo el ancho — más compacta y escaneable.
  secondaryActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  secondaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
  },
  secondaryActionPressed: { backgroundColor: colors.surface },
  secondaryActionText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  secondaryDivider: { width: 1, backgroundColor: colors.line },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  addButtonDisabled: { opacity: 0.6 },
  addButtonText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.primary },
  // Pestañas Publicaciones / Reseñas: dos vistas claramente separadas, como
  // la grilla y los "etiquetados" en un perfil de Instagram, para que sea
  // obvio de un vistazo que son dos tipos de contenido distintos.
  tabBar: {
    flexDirection: 'row',
    marginTop: spacing.xl,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: { borderBottomColor: colors.ink },
  tabLabel: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  tabLabelActive: { color: colors.ink },
  tabContent: { marginTop: spacing.md },
  // Fila con el botón "Agregar" sobre la cuadrícula, que va a sangre: se le
  // da su propio padding en vez de heredarlo del contenedor.
  tabContentHeader: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  // Misma fila, pero para la pestaña de reseñas, que sí está dentro de
  // `body` (ya tiene su propio padding horizontal).
  tabContentHeaderInline: { alignItems: 'flex-end', marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  tileImage: { width: '100%', height: '100%', backgroundColor: colors.surface },
  tilePressed: { opacity: 0.8 },
  // Celda "+" al inicio de la cuadrícula (estilo Instagram) para publicar sin
  // salir de la vista de publicaciones ni buscar un botón aparte.
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  addTileIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(225,87,43,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTileText: { fontSize: 11, fontFamily: fonts.ui.bold, color: colors.primary },
  addHint: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center', marginTop: spacing.md },
  videoBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPosts: {
    marginTop: spacing.sm,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  // Variante para cuando `emptyPosts` se usa fuera del `body` con padding
  // (la sección de publicaciones va a sangre), para no quedar pegada al borde.
  emptyPostsOutsideBody: { marginHorizontal: spacing.lg },
  emptyPostsText: { textAlign: 'center', fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  emptyPostsButton: { minHeight: 40, marginTop: spacing.xs },
  // Fondo cálido oscuro (tinta de la marca), no negro puro, para que el
  // visor de publicaciones se sienta parte de Empre y no de otra app.
  viewer: { flex: 1, backgroundColor: colors.ink },
  viewerSlide: { height: '100%', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerVideoWrap: { width: '100%', height: '100%' },
  muteButton: {
    position: 'absolute',
    bottom: spacing.xxl + spacing.lg,
    right: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Franjas del degradado falso detrás del encabezado/pie del visor.
  scrim: { position: 'absolute', left: 0, right: 0, zIndex: 0 },
  viewerHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  viewerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  viewerCounter: {
    color: '#fff',
    fontSize: 13,
    fontFamily: fonts.ui.bold,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  viewerFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  viewerCaption: {
    color: '#fff',
    fontSize: 15,
    fontFamily: fonts.ui.medium,
    lineHeight: 21,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  captionEditor: { gap: spacing.xs },
  captionAssistRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  captionInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontFamily: fonts.ui.medium,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  captionSave: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2, flexWrap: 'wrap' },
  ratingBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingBadgeText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    height: 22,
    borderRadius: radius.pill,
  },
  openBadgeOpen: { backgroundColor: colors.verified + '1A' },
  openBadgeClosed: { backgroundColor: colors.line },
  openDot: { width: 6, height: 6, borderRadius: 3 },
  openDotOpen: { backgroundColor: colors.verified },
  openDotClosed: { backgroundColor: colors.muted },
  openBadgeText: { fontSize: 12, fontFamily: fonts.ui.semibold },
  openBadgeTextOpen: { color: colors.verified },
  openBadgeTextClosed: { color: colors.muted },
  hoursBlock: { marginTop: spacing.sm },
  hoursToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hoursTable: { marginTop: spacing.sm, gap: 6 },
  hoursTableRow: { flexDirection: 'row', justifyContent: 'space-between' },
  hoursTableDay: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.ink },
  hoursTableTime: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  starRow: { flexDirection: 'row', gap: 2 },
  starPicker: { flexDirection: 'row', gap: 8, alignSelf: 'center', marginVertical: spacing.sm },
  reviewsList: { gap: spacing.md, marginTop: spacing.sm },
  reviewCard: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reviewHeaderInfo: { flex: 1, gap: 2 },
  reviewName: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  reviewDate: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  reviewComment: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.ink },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(36,28,23,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  reviewModalCard: {
    width: '100%',
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalTitle: { fontSize: 18, fontFamily: fonts.display.semibold, color: colors.ink, textAlign: 'center' },
  reviewCommentInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    fontFamily: fonts.ui.medium,
    color: colors.ink,
    textAlignVertical: 'top',
    marginBottom: spacing.xs,
  },
});
