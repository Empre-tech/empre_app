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
import { catalogApi } from '@/api/catalog';
import { entitiesApi, paymentsApi, reviewsApi } from '@/api/endpoints';
import { novedadesApi } from '@/api/novedades';
import type { Photo } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { agendaApi } from '@/api/agenda';
import { statusApi } from '@/api/offers';
import { AgendaStrip } from '@/components/agenda/AgendaStrip';
import { BookingSheet } from '@/components/agenda/BookingSheet';
import { AskEmpreCard, AskEmpreSheet } from '@/components/profile/AskEmpre';
import type { AnswerData, Intent } from '@/lib/answers';
import { track } from '@/analytics/track';
import { FEATURES } from '@/config';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { SkeletonProfile } from '@/components/Skeleton';
import { useActiveOffers } from '@/components/OfferBanner';
import { ACTION_BAR_HEIGHT, ActionBar } from '@/components/profile/ActionBar';
import { AskSheet } from '@/components/profile/AskSheet';
import { CatalogSection } from '@/components/profile/CatalogSection';
import { OffersFicha } from '@/components/profile/OffersFicha';
import { PhotosSection } from '@/components/profile/PhotosSection';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { QuickIndex } from '@/components/profile/QuickIndex';
import { SectionHeader } from '@/components/profile/SectionHeader';
import { Recommendations } from '@/components/profile/Recommendations';
import { ReviewsSection } from '@/components/profile/ReviewsSection';
import { StatusChips } from '@/components/profile/StatusChips';
import { useVideoPlayer, VideoView } from 'expo-video';
import { hasLocation } from '@/lib/geo';
import { formatRelativeTime } from '@/lib/format';
import { resolveImageUrl } from '@/lib/image';
import { openingFromHours, statusLine } from '@/lib/placeCard';
import { catalogCopy, formatPesos, lowestPrice, type ServiceItem } from '@/lib/catalog';
import { blockOrder, coverSource, sections, showQuickIndex, type BlockId, type SectionId } from '@/lib/profileLayout';
import { featuredRating } from '@/lib/reviewSnippet';
import { useNow } from '@/lib/useNow';
import { itemsFor } from '@/lib/uploadQueue';
import { removeUpload, retryUpload, useUploads } from '@/upload/uploadStore';
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
  // `offer`: la oferta con la que abrir la ficha (al venir de la franja del mapa).
  const { id, offer: offerParam, src } = useLocalSearchParams<{ id: string; offer?: string; src?: string }>();
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

  const isOwner = status === 'signedIn' && user?.id === business?.owner_id;

  // Solo se pide si es el dueño: es la única info de suscripción que le
  // interesa a alguien que no sea él, y evitamos una llamada de más para
  // cualquier visitante viendo el perfil del negocio.
  const subscriptionQuery = useQuery({
    queryKey: ['subscription', business?.id],
    queryFn: () => paymentsApi.getSubscription(business!.id),
    enabled: isOwner && Boolean(business?.id),
  });
  const requiresPayment = subscriptionQuery.data?.requires_payment ?? false;
  const followers = useQuery({
    queryKey: ['followers', business?.id],
    queryFn: () => novedadesApi.followers(business!.id),
    enabled: isOwner && Boolean(business?.id),
  });

  // Medición: un perfil abierto cuenta una vez por negocio (no el del propio dueño). `src` dice de dónde vino.
  const trackedProfile = useRef('');
  useEffect(() => {
    if (!business?.id || isOwner || trackedProfile.current === business.id) return;
    trackedProfile.current = business.id;
    track('profile_opened', business.id, { origin: src ?? 'direct' });
  }, [business?.id, isOwner, src]);

  // Las ofertas viven en la ficha del perfil (un boleto a la vez, sin pestaña ni cantidades).
  const activeOffers = useActiveOffers(id);
  const offerCount = activeOffers.data?.length ?? 0;
  const [showHours, setShowHours] = useState(false);

  // Perfil: hora actual, servicios (para el índice rápido), pestaña del dueño y posición de las secciones.
  const nowMs = useNow(60_000);
  const catalog = useQuery({ queryKey: ['catalog', id], queryFn: () => catalogApi.list(id ?? ''), enabled: Boolean(id), staleTime: 60_000 });
  const hasServices = (catalog.data?.length ?? 0) > 0;
  const [activeSection, setActiveSection] = useState<SectionId>('offers');
  // El índice queda flotando arriba (con su botón atrás) al pasar su lugar en el perfil (3.28).
  const [indexStuck, setIndexStuck] = useState(false);
  const indexY = useRef(0);
  // Preguntar por un ítem del catálogo: el mensaje ya escrito según el tipo de negocio (3.27).
  const [asking, setAsking] = useState<ServiceItem | null>(null);
  // «Pregúntale» (fase 1): la hoja de respuestas y, desde ella, la hoja de reservar con el servicio elegido.
  const [askStart, setAskStart] = useState<{ intent: Intent; label: string } | { text: string } | null>(null);
  const [bookingFor, setBookingFor] = useState<{ serviceId?: string } | null>(null);
  const bizStatus = useQuery({ queryKey: ['status', id], queryFn: () => statusApi.get(id ?? ''), enabled: Boolean(id), staleTime: 60_000 });
  const agendaSummary = useQuery({
    queryKey: ['agenda-summary', id],
    queryFn: () => agendaApi.summary(id ?? ''),
    enabled: FEATURES.agenda && status === 'signedIn' && Boolean(id),
    staleTime: 20_000,
  });
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});
  const bodyY = useRef(0);
  const recsY = useRef(0);
  // Lo que el dueño está subiendo a este negocio (aparece al instante en Fotos, con su progreso).
  const uploads = useUploads();

  // Descripción: se trunca a 3 líneas con un "Ver más" cuando es larga, en
  // vez de siempre mostrarla completa y alargar el perfil. El umbral de
  // caracteres es una heurística simple (no medimos líneas reales).
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const descriptionTruncatable = (business?.description?.length ?? 0) > 140;

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
      track('follow_toggled', business.id, { following: next });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entity', id] }),
        queryClient.invalidateQueries({ queryKey: ['my-favorites'] }),
        queryClient.invalidateQueries({ queryKey: ['novedades'] }),
      ]);
    } catch (e) {
      setIsFavorite(!next);
      Alert.alert('No pudimos actualizar lo que sigues', e instanceof Error ? e.message : 'Intenta de nuevo.');
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
  const viewerListRef = useRef<FlatList<Photo>>(null);

  // Al abrir el visor, arrancamos el "cursor" en la foto tocada.
  useEffect(() => {
    if (openIndex === null) return;
    setCurrentIndex(openIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIndex]);

  const openViewer = (index: number) => setOpenIndex(index);
  const closeViewer = () => setOpenIndex(null);

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
      <View style={styles.screen}>
        <SkeletonProfile />
        {back}
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

  const contact = business.contact_info?.trim();
  const location = [business.address, business.city].filter(Boolean).join(', ');
  const serviceMode = business.service_mode ? SERVICE_MODE_LABELS[business.service_mode]?.text : undefined;
  const canCall = Boolean(contact && PHONE_RE.test(contact));
  const hasHours = Boolean(business.hours && business.hours.length > 0);
  const activePhoto = openIndex !== null ? photos[currentIndex] : null;

  const onMessage = () => {
    if (status !== 'signedIn') {
      router.push('/(auth)/login');
      return;
    }
    track('contact_started', business.id);
    router.push({ pathname: '/chat/[entityId]', params: { entityId: business.id, name: business.name, avatar: business.profile_url } });
  };

  const sendAsk = (message: string) => {
    setAsking(null);
    if (status !== 'signedIn') {
      router.push('/(auth)/login');
      return;
    }
    track('contact_started', business.id);
    router.push({ pathname: '/chat/[entityId]', params: { entityId: business.id, name: business.name, avatar: business.profile_url, draft: message } });
  };
  const openCatalog = () => router.push({ pathname: '/business/services/[id]', params: { id: business.id } });

  const onDirections = () => {
    track('directions_tapped', business.id, { origin: 'profile' });
    const { latitude, longitude } = business;
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${latitude},${longitude}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    });
    if (url) void Linking.openURL(url);
  };

  const onCall = () => {
    if (contact) void Linking.openURL(`tel:${contact.replace(/[^\d+]/g, '')}`);
  };

  // ---- Lo que dice la portada: nota (desde 3 reseñas), estado con hora y el plan de fotos.
  const rating = featuredRating(ratingSummary.average, ratingSummary.count);
  const opening = openingFromHours(business.hours, new Date(nowMs), Boolean(business.is_open_now));
  const statusInfo = statusLine({ has_hours: hasHours, is_open_now: Boolean(business.is_open_now), ...opening });
  const cover = coverSource(business.banner_url, photos[0]);
  const openState: boolean | null = hasHours ? Boolean(business.is_open_now) : null;
  // El catálogo se llama según el negocio (Carta, Servicios, Productos…) y su precio más bajo va en el vistazo.
  const copy = catalogCopy(business.category?.name, business.business_profile);
  const askData: AnswerData = {
    name: business.name,
    noun: copy.noun,
    services: catalog.data ?? [],
    offers: (activeOffers.data ?? []).map((o) => ({ id: o.id, title: o.title, conditions: o.conditions, ends_at: o.ends_at, items: o.items })),
    hours: business.hours ?? [],
    isOpenNow: hasHours ? Boolean(business.is_open_now) : null,
    availability: bizStatus.data?.availability || null,
    serviceMode: business.service_mode ?? '',
    agendaOn: FEATURES.agenda && Boolean(agendaSummary.data?.enabled),
  };
  const askHandlers = {
    onSeeSlots: (serviceId?: string) => {
      setAskStart(null);
      if (status !== 'signedIn') {
        router.push('/(auth)/login');
        return;
      }
      track('booking_started', business.id, { origin: 'ask' });
      setBookingFor({ serviceId });
    },
    onMessage: (draft: string) => {
      setAskStart(null);
      sendAsk(draft);
    },
    onOpenOffer: () => {
      setAskStart(null);
      goTo('offers');
    },
    onAsked: (intent: Intent, answered: boolean) => track('question_asked', business.id, { intent, answered }),
  };
  const fromPrice = lowestPrice(catalog.data ?? []);
  const secs = sections({ offers: offerCount, hasServices, photos: photos.length, isOwner, reviews: ratingSummary.count });
  const showIndex = showQuickIndex(secs);

  const goTo = (id: SectionId) => {
    const y = bodyY.current + (sectionY.current[id] ?? 0) - (isOwner ? 130 : 70);
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
    setActiveSection(id);
  };
  const onScroll = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const raw = e.nativeEvent.contentOffset.y;
    const stuck = !isOwner && indexY.current > 0 && raw >= indexY.current;
    if (stuck !== indexStuck) setIndexStuck(stuck);
    const y = raw + 200;
    let current: SectionId = secs[0] ?? 'reviews';
    for (const id of secs) if (sectionY.current[id] !== undefined && bodyY.current + sectionY.current[id] <= y) current = id;
    if (current !== activeSection) setActiveSection(current);
  };
  const mark = (id: SectionId) => (e: { nativeEvent: { layout: { y: number } } }) => {
    sectionY.current[id] = e.nativeEvent.layout.y;
  };

  const openPhotos = () => router.push({ pathname: '/business/photos/[id]', params: { id: business.id } });
  const openReviews = () => router.push({ pathname: '/business/reviews/[id]', params: { id: business.id } });

  // «Información» (3.28): cuándo y cómo llegar. El estado («abierto hasta…») ya está arriba en el vistazo; aquí va el
  // detalle, con «Llegar» y «Llamar» junto a cada dato, y «Sobre el negocio» al final.
  const infoBlock = (
    <View style={styles.infoSection}>
      <SectionHeader title="Información" />
      <View style={styles.card}>
        {statusInfo ? <InfoRow icon="time-outline" text={statusInfo.text} /> : null}
        {hasHours ? (
          <View>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showHours }} onPress={() => setShowHours((v) => !v)} style={styles.hoursToggle}>
              <Text style={styles.linkText}>{showHours ? 'Ocultar horario' : 'Ver horario de la semana'}</Text>
              <Ionicons name={showHours ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
            </Pressable>
            {showHours ? (
              <View style={styles.hoursTable}>
                {[...(business.hours ?? [])]
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
        {location ? (
          <View style={styles.infoLine}>
            <View style={styles.grow}>
              <InfoRow icon="location-outline" text={location} />
            </View>
            {hasLocation(business) ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Cómo llegar" onPress={onDirections} style={styles.inlineAction}>
                <Text style={styles.linkText}>Llegar</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {contact ? (
          <View style={styles.infoLine}>
            <View style={styles.grow}>
              <InfoRow icon="call-outline" text={contact} />
            </View>
            {canCall ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Llamar al ${contact}`} onPress={onCall} style={styles.inlineAction}>
                <Text style={styles.linkText}>Llamar</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {serviceMode ? <InfoRow icon="storefront-outline" text={serviceMode} /> : null}
        {business.description ? (
          <View style={styles.about}>
            <Text style={styles.aboutLabel}>Sobre el negocio</Text>
            <Text style={styles.aboutText} numberOfLines={descriptionExpanded ? undefined : 3}>
              {business.description}
            </Text>
            {descriptionTruncatable ? (
              <Pressable accessibilityRole="button" onPress={() => setDescriptionExpanded((v) => !v)} style={styles.readMoreHit}>
                <Text style={styles.readMore}>{descriptionExpanded ? 'Ver menos' : 'Ver más'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );

  const block = (id: BlockId): React.ReactNode => {
    switch (id) {
      case 'offers':
        return (
          <View key={id} onLayout={mark('offers')}>
            <OffersFicha entityId={business.id} isOwner={isOwner} preview initialOfferId={offerParam} />
            {!isOwner ? <AskEmpreCard data={askData} onAsk={setAskStart} /> : null}
          </View>
        );
      case 'services':
        return (
          <View key={id} onLayout={mark('services')}>
            <CatalogSection
              entityId={business.id}
              isOwner={false}
              copy={copy}
              color={business.category?.color}
              icon={business.category?.icon}
              onAsk={setAsking}
              onAll={openCatalog}
            />
          </View>
        );
      case 'info':
        return (
          <View key={id} onLayout={mark('info')}>
            {infoBlock}
          </View>
        );
      case 'photos':
        return (
          <View key={id} onLayout={mark('photos')}>
            <PhotosSection
              photos={photos}
              color={business.category?.color}
              isOwner={false}
              onOpenPhoto={openViewer}
              onAll={openPhotos}
              onNew={() => undefined}
              pending={[]}
              onRetry={retryUpload}
              onRemove={removeUpload}
            />
          </View>
        );
      case 'reviews':
        return (
          <View key={id} onLayout={mark('reviews')}>
            <ReviewsSection
              summary={reviews.data?.summary ?? { average: ratingSummary.average, count: ratingSummary.count, distribution: [0, 0, 0, 0, 0] }}
              reviews={reviews.data?.data ?? []}
              mine={myReview.data}
              isOwner={isOwner}
              loading={reviews.isLoading}
              onWrite={openReviewModal}
              onAll={openReviews}
            />
          </View>
        );
      case 'recs':
        return (
          <View key={id} onLayout={(e) => (recsY.current = e.nativeEvent.layout.y)}>
            <Recommendations business={business} closed={openState === false} title={openState === false ? 'Abiertos ahora cerca de aquí' : 'Más como este, cerca de aquí'} />
          </View>
        );
      default:
        return null;
    }
  };

  // «Así te ven» es solo una vista previa: todo lo que se administra vive en «Mi negocio».
  const ownerTabs = isOwner ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Así te ven los demás. Administrar mi negocio"
      onPress={() => router.push({ pathname: '/business/hub/[id]', params: { id: business.id } })}
      style={styles.previewBar}
    >
      <Ionicons name="eye-outline" size={18} color={colors.ink} />
      <Text style={styles.previewText}>Así te ven los demás</Text>
      <Text style={styles.previewLink}>Administrar mi negocio</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.primary} />
    </Pressable>
  ) : null;

  const stickyChild =
    ownerTabs || showIndex ? (
      <View style={styles.sticky} onLayout={(e) => (indexY.current = e.nativeEvent.layout.y)}>
        {ownerTabs}
        {showIndex ? <QuickIndex sections={secs} active={activeSection} onGo={goTo} catalogNoun={copy.noun} /> : null}
      </View>
    ) : null;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  const barSpace = isOwner ? 0 : ACTION_BAR_HEIGHT + insets.bottom;

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: insets.bottom + barSpace + spacing.xxl }}
        // Solo las pestañas del dueño se pegan; para quien visita, el índice flota aparte con su botón atrás (3.28).
        stickyHeaderIndices={isOwner && stickyChild ? [1] : undefined}
        onScroll={onScroll}
        scrollEventThrottle={100}
      >
          <ProfileHero
            name={business.name}
            categoryLabel={[business.category?.name, business.subcategories?.[0]?.name].filter(Boolean).join(' · ')}
            color={business.category?.color}
            icon={business.category?.icon}
            profileUrl={business.profile_url}
            cover={cover}
            photosCount={photos.length}
            rating={rating}
            status={statusInfo}
            hasOffer={offerCount > 0}
            verified={Boolean(business.is_verified)}
            topInset={insets.top}
            onAllPhotos={openPhotos}
            onOpenCover={cover.kind === 'photo' || cover.kind === 'video' ? () => openViewer(0) : undefined}
            onNearby={openState === false && !isOwner ? () => scrollRef.current?.scrollTo({ y: Math.max(0, bodyY.current + recsY.current - 70), animated: true }) : undefined}
          >
            <StatusChips entityId={business.id} hasHours={hasHours} isOpen={Boolean(business.is_open_now)} extrasOnly />
            {fromPrice !== null ? (
              <View style={styles.glanceChip}>
                <Text style={styles.glanceText}>Desde {formatPesos(fromPrice)}</Text>
              </View>
            ) : null}

          </ProfileHero>
        {stickyChild ?? <View />}

        <View style={styles.bodyList} onLayout={(e) => (bodyY.current = e.nativeEvent.layout.y)}>
            <>
              {FEATURES.agenda && !isOwner ? <AgendaStrip entityId={business.id} entityName={business.name} /> : null}
              {blockOrder({ isOwner }).map(block)}
            </>
        </View>
      </ScrollView>
      {!isOwner ? (
        <ActionBar
          name={business.name}
          bottomInset={insets.bottom}
          onMessage={onMessage}
          onDirections={hasLocation(business) ? onDirections : undefined}
          onCall={canCall ? onCall : undefined}
          isFavorite={isFavorite}
          favoriting={favoriting}
          onToggleFavorite={() => void toggleFavorite()}
        />
      ) : null}
      {indexStuck && showIndex ? (
        <View style={[styles.floatIndex, { paddingTop: insets.top }]}>
          <QuickIndex sections={secs} active={activeSection} onGo={goTo} catalogNoun={copy.noun} onBack={goBack} />
        </View>
      ) : (
        back
      )}
      <AskSheet item={asking?.name ?? null} businessName={business.name} copy={copy} onClose={() => setAsking(null)} onSend={sendAsk} />
      <AskEmpreSheet data={askData} start={askStart} onClose={() => setAskStart(null)} handlers={askHandlers} />
      {agendaSummary.data?.enabled ? (
        <BookingSheet
          visible={bookingFor !== null}
          entityId={business.id}
          entityName={business.name}
          summary={agendaSummary.data}
          initialServiceId={bookingFor?.serviceId}
          onClose={() => setBookingFor(null)}
          onBooked={(appointment) => {
            setBookingFor(null);
            router.push({ pathname: '/appointment/[id]', params: { id: appointment.id } });
          }}
        />
      ) : null}

      <Modal visible={openIndex !== null} animationType="slide" onRequestClose={closeViewer} presentationStyle="pageSheet">
        <View style={styles.viewer}>
          <View style={[styles.viewerHeader, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={closeViewer} style={styles.viewerIconButton}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
            {photos.length > 1 ? (
              <Text style={styles.viewerCounter}>
                {currentIndex + 1} / {photos.length}
              </Text>
            ) : (
              <View />
            )}
            <View style={styles.viewerIconButton} />
          </View>

          <View style={[styles.viewerPhotoArea, { width, height: width }]}>
            <FlatList
              ref={viewerListRef}
              style={{ width, height: width }}
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
            {photos.length > 1 ? (
              <View style={styles.viewerDots} pointerEvents="none">
                {photos.map((photo, index) => (
                  <View key={photo.id} style={[styles.viewerDot, index === currentIndex && styles.viewerDotActive]} />
                ))}
              </View>
            ) : null}
          </View>

          <ScrollView style={styles.viewerDetails} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
            <View style={styles.viewerBizRow}>
              <Avatar uri={business.profile_url} name={business.name} size={36} />
              <View style={styles.viewerBizInfo}>
                <Text style={styles.viewerBizName} numberOfLines={1}>{business.name}</Text>
                {activePhoto?.created_at ? (
                  <Text style={styles.viewerBizCategory}>{formatRelativeTime(activePhoto.created_at)}</Text>
                ) : null}
              </View>
            </View>

            {activePhoto?.caption ? <Text style={styles.viewerCaption}>{activePhoto.caption}</Text> : null}
          </ScrollView>
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

    </View>
  );
}

/** Una publicación es un video si el content_type que devolvió el backend empieza con "video/". */
function isVideoPost(photo: Photo): boolean {
  return photo.content_type?.startsWith('video/') ?? false;
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

function InfoRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={colors.muted} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

/** Selector de calificación (1 a 5 estrellas) para el formulario de reseña. */
function StarPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  return (
    <View style={styles.starPicker}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} estrellas`} onPress={() => onChange(n)} hitSlop={6}>
          <Ionicons name={n <= value ? 'star' : 'star-outline'} size={32} color={colors.accent} />
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
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  closedNote: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: '#FBE4E4' },
  closedNoteText: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.extrabold, color: '#8E2A2A' },
  readMoreHit: { minHeight: 44, justifyContent: 'center' },
  sticky: { backgroundColor: colors.bg },
  floatIndex: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: colors.bg },
  glanceChip: { minHeight: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  glanceText: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.ink },
  infoSection: { gap: spacing.xs },
  grow: { flex: 1, minWidth: 0 },
  about: { gap: 4, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  aboutLabel: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  aboutText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.ink },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inlineAction: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  linkText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primary },
  bodyList: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.md },
  previewBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, marginHorizontal: spacing.md, marginTop: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  previewText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink },
  previewLink: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primary },
  ownerTabs: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  ownerTab: { flex: 1, minHeight: 44, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  ownerTabOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  ownerTabText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  ownerTabTextOn: { color: '#fff' },
  infoActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  infoPrimary: { flex: 1.3, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, backgroundColor: colors.primary },
  infoPrimaryText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  infoSecondary: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.surface },
  infoSecondaryOn: { backgroundColor: colors.primarySoft },
  infoSecondaryText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primary },
  infoPressed: { opacity: 0.85 },
  followButton: { position: 'absolute', right: spacing.md, minWidth: 96, height: 40, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1.5, borderColor: colors.primary },
  followButtonOn: { backgroundColor: colors.primary },
  followText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.primary },
  followTextOn: { color: '#fff' },
  followersChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  followersText: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  bannerWrap: { width: '100%', height: 160 },
  banner: { width: '100%', height: 160, backgroundColor: colors.surface },
  photoCountPill: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(22,35,58,0.55)',
  },
  photoCountPillText: { fontSize: 11, fontFamily: fonts.ui.bold, color: '#fff' },
  bannerEmpty: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { borderColor: colors.accent },
  reviewCardMine: { borderWidth: 1.5, borderColor: colors.primary },
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
  categoryPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 10,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
  },
  categoryPillText: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.primary },
  verifiedNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedNote: { fontSize: 13, color: colors.verified, fontWeight: '600', fontFamily: fonts.ui.semibold },
  readMore: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.primary, marginTop: 2 },
  pendingNote: { fontSize: 13, color: colors.warning, fontWeight: '600', fontFamily: fonts.ui.semibold },
  description: { fontSize: 15, lineHeight: 22, fontFamily: fonts.ui.medium, color: colors.ink, marginTop: spacing.sm },
  infoBlock: { gap: spacing.sm, marginTop: spacing.sm },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoText: { flex: 1, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  subscriptionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  subscriptionLinkPressed: { backgroundColor: colors.surface },
  subscriptionLinkText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.primary },
  subscriptionLinkDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, marginLeft: 2 },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(36,104,198,0.08)',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  trialBannerPressed: { opacity: 0.8 },
  trialBannerTextWrap: { flex: 1 },
  trialBannerTitle: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink },
  trialBannerSubtitle: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted, marginTop: 1 },
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
  tabItemActive: { borderBottomColor: colors.primary },
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tileImage: { width: '100%', height: '100%', backgroundColor: colors.surface },
  tilePressed: { opacity: 0.8 },
  tileWrap: { borderRadius: radius.sm, overflow: 'hidden' },
  featuredTileBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(22,35,58,0.55)',
  },
  featuredTileBadgeText: { fontSize: 10, fontFamily: fonts.ui.bold, color: '#fff' },
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
    borderRadius: radius.sm,
  },
  addTileIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(36,104,198,0.12)',
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
  viewer: { flex: 1, backgroundColor: colors.bg },
  viewerSlide: { height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  viewerImage: { width: '100%', height: '100%' },
  viewerVideoWrap: { width: '100%', height: '100%' },
  muteButton: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg,
  },
  viewerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCounter: {
    color: colors.ink,
    fontSize: 13,
    fontFamily: fonts.ui.bold,
  },
  // Área de la foto: contenida (no a pantalla completa) para que debajo quepa
  // el bloque de descripción, como un post de feed en vez de una historia.
  viewerPhotoArea: { backgroundColor: colors.ink },
  viewerDots: {
    position: 'absolute',
    bottom: spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  viewerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  viewerDotActive: { backgroundColor: '#fff', width: 8, height: 8, borderRadius: 4 },
  viewerDetails: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  viewerBizRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  viewerBizInfo: { flex: 1, minWidth: 0 },
  viewerBizName: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  viewerBizCategory: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted, marginTop: 1 },
  viewerCaption: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.ui.medium,
    lineHeight: 20,
    marginTop: spacing.md,
  },
  captionEditor: { gap: spacing.xs, marginTop: spacing.md },
  captionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  captionLabel: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink },
  captionInput: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.ui.medium,
    minHeight: 64,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.bg,
    textAlignVertical: 'top',
  },
  captionSaveButton: { alignSelf: 'flex-start', marginTop: spacing.xs },
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
  hoursToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
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
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(22,35,58,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
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
