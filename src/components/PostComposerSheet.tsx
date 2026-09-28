import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import { AIWritingAssist } from './AIWritingAssist';
import { pickPostMedia, type PickedPostMedia } from '@/lib/images';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  entityId: string;
  businessName?: string;
  categoryName?: string;
  onPublished: () => void;
}

const MAX_CAPTION_LENGTH = 200;

/**
 * Hoja para crear una publicación nueva (foto o video): elegir el archivo,
 * ver una vista previa grande, escribir (o pedirle a la IA) el texto, y
 * publicar con una barra de progreso real. Antes esto era "elegir foto y
 * subir" en un solo paso sin vista previa ni forma de agregar texto de una
 * vez — ahora todo pasa en una sola pantalla, como al publicar en cualquier
 * app de fotos.
 */
export function PostComposerSheet({ visible, onClose, entityId, businessName, categoryName, onPublished }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [media, setMedia] = useState<PickedPostMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [picking, setPicking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isVideo = media?.type.startsWith('video/') ?? false;
  const previewWidth = width - spacing.lg * 2;
  const previewHeight = media ? Math.min(previewWidth * (media.height / media.width), previewWidth * 1.25) : 0;

  const reset = () => {
    setMedia(null);
    setCaption('');
    setPicking(false);
    setPublishing(false);
    setProgress(0);
    setError(null);
  };

  const close = () => {
    if (publishing) return; // no cerrar a mitad de una subida
    reset();
    onClose();
  };

  const pick = async () => {
    setPicking(true);
    setError(null);
    try {
      const picked = await pickPostMedia();
      if (picked) setMedia(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos abrir tu galería.');
    } finally {
      setPicking(false);
    }
  };

  // Al abrir la hoja, arrancamos directo en el selector de archivo: no tiene
  // sentido mostrar una pantalla vacía con un solo botón en medio.
  useEffect(() => {
    if (visible && !media && !picking) void pick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const publish = async () => {
    if (!media) return;
    setPublishing(true);
    setProgress(0);
    setError(null);
    try {
      await entitiesApi.uploadImage(entityId, 'gallery', media, {
        caption: caption.trim() || undefined,
        onProgress: setProgress,
      });
      onPublished();
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos publicar. Intenta de nuevo.');
      setPublishing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <Pressable style={styles.backdropTouch} onPress={close} />
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.sheetHandle} />
          <View style={styles.header}>
            <Text style={styles.title}>Nueva publicación</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={close} disabled={publishing} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>

          {!media ? (
            <View style={styles.pickBlock}>
              {picking ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <View style={styles.pickIcon}>
                    <Ionicons name="images" size={26} color={colors.primary} />
                  </View>
                  <Text style={styles.pickText}>Elige una foto o un video corto de tu galería</Text>
                  <Pressable accessibilityRole="button" onPress={() => void pick()} style={styles.pickButton}>
                    <Text style={styles.pickButtonText}>Elegir de la galería</Text>
                  </Pressable>
                </>
              )}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          ) : (
            <View style={styles.composeBlock}>
              <View style={[styles.previewWrap, { width: previewWidth, height: previewHeight }]}>
                {isVideo ? (
                  <ComposerVideoPreview uri={media.uri} />
                ) : (
                  <Image source={{ uri: media.uri }} style={styles.previewMedia} contentFit="cover" />
                )}

                {publishing ? (
                  <View style={styles.progressOverlay}>
                    <View style={styles.progressRing}>
                      <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
                    </View>
                    <Text style={styles.progressLabel}>Publicando…</Text>
                  </View>
                ) : (
                  <Pressable accessibilityRole="button" accessibilityLabel="Elegir otro archivo" onPress={() => void pick()} style={styles.changeButton}>
                    <Ionicons name="swap-horizontal" size={14} color="#fff" />
                    <Text style={styles.changeButtonText}>Cambiar</Text>
                  </Pressable>
                )}
              </View>

              {!publishing ? (
                <>
                  <View style={styles.captionHeader}>
                    <Text style={styles.captionLabel}>Descripción (opcional)</Text>
                    <AIWritingAssist
                      kind="post_caption"
                      currentText={caption}
                      businessName={businessName}
                      categoryName={categoryName}
                      onApply={setCaption}
                      compact
                    />
                  </View>
                  <TextInput
                    value={caption}
                    onChangeText={setCaption}
                    placeholder="Cuéntale a la gente sobre esta publicación…"
                    placeholderTextColor={colors.muted}
                    style={styles.captionInput}
                    multiline
                    maxLength={MAX_CAPTION_LENGTH}
                  />
                  <Text style={styles.captionCounter}>
                    {caption.length}/{MAX_CAPTION_LENGTH}
                  </Text>

                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <Pressable accessibilityRole="button" onPress={() => void publish()} style={styles.publishButton}>
                    <Ionicons name="paper-plane" size={16} color="#fff" />
                    <Text style={styles.publishButtonText}>Publicar</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Vista previa muda y pausada de un video recién elegido (solo para mostrar el primer cuadro). */
function ComposerVideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={styles.previewMedia} contentFit="cover" nativeControls={false} />;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropTouch: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(36,28,23,0.55)' },
  sheetScroll: { flexGrow: 0, maxHeight: '100%' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontFamily: fonts.display.semibold, color: colors.ink },
  closeButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  pickBlock: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  pickIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(225,87,43,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickText: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center', paddingHorizontal: spacing.xl },
  pickButton: {
    height: 46,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickButtonText: { fontSize: 14, fontFamily: fonts.ui.bold, color: '#fff' },
  composeBlock: { gap: spacing.md },
  previewWrap: {
    alignSelf: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.ink,
  },
  previewMedia: { width: '100%', height: '100%' },
  changeButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  changeButtonText: { fontSize: 11, fontFamily: fonts.ui.bold, color: '#fff' },
  progressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(36,28,23,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  progressRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: { fontSize: 15, fontFamily: fonts.ui.bold, color: '#fff' },
  progressLabel: { fontSize: 13, fontFamily: fonts.ui.semibold, color: '#fff' },
  captionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  captionLabel: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  captionInput: {
    minHeight: 70,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    fontFamily: fonts.ui.medium,
    color: colors.ink,
    textAlignVertical: 'top',
    backgroundColor: colors.bg,
  },
  captionCounter: { fontSize: 11, fontFamily: fonts.ui.medium, color: colors.muted, alignSelf: 'flex-end' },
  error: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.danger, textAlign: 'center' },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  publishButtonText: { fontSize: 15, fontFamily: fonts.ui.bold, color: '#fff' },
});
