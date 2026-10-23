import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { formatRelativeTime } from '@/lib/format';
import { resolveImageUrl } from '@/lib/image';
import { alpha, colors, fonts, spacing } from '@/theme';

export interface ViewerSlide {
  key: string;
  url: string;
  isVideo: boolean;
  caption: string;
  createdAt: string;
  /** Posición dentro de su publicación («foto 2 de 3»); n = 1 si es un solo archivo. */
  k: number;
  n: number;
}

interface Props {
  visible: boolean;
  slides: ViewerSlide[];
  startIndex: number;
  businessName: string;
  businessAvatar?: string | null;
  onClose: () => void;
}

const CAPTION_LONG = 120;

/**
 * El visor de «Todas las fotos» (solo lectura): desliza entre todas, el contador, la descripción de la publicación
 * (recortada a 3 líneas con «Ver más») y su fecha. Los videos solo se reproducen al estar a la vista y en silencio.
 */
export function PostViewer({ visible, slides, startIndex, businessName, businessAvatar, onClose }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Quien lo usa lo monta con una `key` nueva cada vez que se abre: así empieza siempre en la foto tocada.
  const [current, setCurrent] = useState(startIndex);
  const [more, setMore] = useState(false);

  const slide = slides[current];
  const long = (slide?.caption.length ?? 0) > CAPTION_LONG;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color={colors.white} />
          </Pressable>
          <Text style={styles.counter} accessibilityLiveRegion="polite">
            {current + 1} / {slides.length}
            {slide && slide.n > 1 ? ` · foto ${slide.k} de ${slide.n}` : ''}
          </Text>
          <View style={styles.iconBtn} />
        </View>

        <FlatList
          data={slides}
          keyExtractor={(s) => s.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(startIndex, Math.max(0, slides.length - 1))}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => {
            setCurrent(Math.round(e.nativeEvent.contentOffset.x / width));
            setMore(false);
          }}
          style={styles.list}
          renderItem={({ item, index }) => (
            <View style={[styles.slide, { width }]}>
              {item.isVideo ? (
                <VideoSlide uri={resolveImageUrl(item.url) ?? ''} active={visible && index === current} />
              ) : (
                <Image accessible={false} source={{ uri: resolveImageUrl(item.url) ?? undefined }} style={styles.image} contentFit="contain" />
              )}
            </View>
          )}
        />

        <ScrollView style={styles.details} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}>
          <View style={styles.bizRow}>
            <Avatar uri={businessAvatar ?? undefined} name={businessName} size={36} />
            <View style={styles.bizInfo}>
              <Text style={styles.bizName} numberOfLines={1}>
                {businessName}
              </Text>
              {slide?.createdAt ? <Text style={styles.bizWhen}>{formatRelativeTime(slide.createdAt)}</Text> : null}
            </View>
          </View>
          {slide?.caption ? (
            <>
              <Text style={styles.caption} numberOfLines={long && !more ? 3 : undefined}>
                {slide.caption}
              </Text>
              {long ? (
                <Pressable accessibilityRole="button" onPress={() => setMore((v) => !v)} style={styles.moreBtn}>
                  <Text style={styles.moreText}>{more ? 'Ver menos' : 'Ver más'}</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function VideoSlide({ uri, active }: { uri: string; active: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- el reproductor es un objeto nativo y así se configura
    player.muted = muted;
  }, [muted, player]);
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);
  return (
    <View style={styles.videoWrap}>
      <VideoView player={player} style={styles.image} contentFit="contain" nativeControls={false} />
      <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Activar sonido' : 'Silenciar'} onPress={() => setMuted((m) => !m)} style={styles.mute}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.nightDeep },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: alpha(colors.white, 0.16), alignItems: 'center', justifyContent: 'center' },
  counter: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.white },
  list: { flexGrow: 0, flexShrink: 0 },
  slide: { height: 420, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  videoWrap: { width: '100%', height: '100%' },
  mute: { position: 'absolute', right: spacing.md, bottom: spacing.md, width: 44, height: 44, borderRadius: 22, backgroundColor: alpha(colors.black, 0.55), alignItems: 'center', justifyContent: 'center' },
  details: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  bizRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bizInfo: { flex: 1, minWidth: 0 },
  bizName: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.white },
  bizWhen: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.onDarkSoft },
  caption: { marginTop: spacing.md, fontSize: 13.5, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.white },
  moreBtn: { minHeight: 44, justifyContent: 'center' },
  moreText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.onDarkLink },
});
