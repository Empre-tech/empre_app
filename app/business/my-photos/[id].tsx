import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import type { Photo } from '@/api/types';
import { AIWritingAssist } from '@/components/AIWritingAssist';
import { Button } from '@/components/Button';
import { PostComposerSheet } from '@/components/PostComposerSheet';
import { UploadTile } from '@/components/profile/PhotosSection';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import { itemsFor } from '@/lib/uploadQueue';
import { removeUpload, retryUpload, useUploads } from '@/upload/uploadStore';
import { colors, fonts, radius, spacing } from '@/theme';

const COLUMNS = 3;
const GAP = 4;
const isVideo = (p: Photo) => p.content_type?.startsWith('video/') ?? false;

/**
 * Fotos y videos del negocio (dueño): aquí se suben, se les cambia la descripción y se eliminan. «Así te ven» solo
 * muestra el resultado.
 */
export default function ManagePhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const qc = useQueryClient();
  const uploads = useUploads();

  const business = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId) });
  const photos = useMemo(() => [...(business.data?.photos ?? [])].sort((a, b) => a.order - b.order), [business.data?.photos]);
  const pending = itemsFor(uploads.items, entityId);
  const cat = categoryColor(business.data?.category?.color);

  const [composer, setComposer] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const size = Math.floor((width - spacing.lg * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const active = photos.find((p) => p.id === openId) ?? null;

  const refresh = () => qc.invalidateQueries({ queryKey: ['entity', entityId] });

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Fotos y videos" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}>
        <Button title="Subir foto o video" onPress={() => setComposer(true)} />
        <Text style={styles.hint}>Así se ven en el perfil de tu negocio. Toca una para cambiar su descripción o eliminarla.</Text>

        {business.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
        {!business.isLoading && photos.length === 0 && pending.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="images-outline" size={32} color={colors.muted} />
            <Text style={styles.emptyTitle}>Aún no tienes fotos</Text>
            <Text style={styles.hint}>Con 5 o más fotos tu perfil se ve más completo.</Text>
          </View>
        ) : null}

        <View style={styles.grid}>
          {pending.map((u) => (
            <UploadTile key={u.id} item={u} size={size} onRetry={() => retryUpload(u.id)} onRemove={() => removeUpload(u.id)} />
          ))}
          {photos.map((p, i) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`${isVideo(p) ? 'Video' : 'Foto'} ${i + 1}${p.caption ? `: ${p.caption}` : ''}. Editar`}
              onPress={() => setOpenId(p.id)}
              style={[styles.cell, { width: size, height: size }, isVideo(p) && { backgroundColor: cat.fg }]}
            >
              {isVideo(p) ? (
                <View style={styles.center}>
                  <Ionicons name="play" size={26} color="rgba(255,255,255,0.95)" />
                </View>
              ) : (
                <Image accessible={false} source={{ uri: resolveImageUrl(p.url) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" />
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {active ? (
        <PhotoEditor
          key={active.id}
          photo={active}
          entityId={entityId}
          businessName={business.data?.name ?? ''}
          categoryName={business.data?.category?.name}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      ) : null}

      <PostComposerSheet
        visible={composer}
        onClose={() => setComposer(false)}
        entityId={entityId}
        businessName={business.data?.name}
        categoryName={business.data?.category?.name}
        onPublished={() => void refresh()}
      />
    </View>
  );
}

function PhotoEditor({ photo, entityId, businessName, categoryName, onClose, onChanged }: { photo: Photo; entityId: string; businessName: string; categoryName?: string; onClose: () => void; onChanged: () => Promise<unknown> | void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState(photo.caption ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = caption.trim() !== (photo.caption ?? '');

  const save = async () => {
    setSaving(true);
    try {
      await entitiesApi.updateImageCaption(entityId, photo.id, caption.trim());
      await onChanged();
      onClose();
    } catch (e) {
      Alert.alert('No pudimos guardar', e instanceof Error ? e.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert('Eliminar publicación', '¿Seguro que quieres eliminarla? Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await entitiesApi.deleteImage(entityId, photo.id);
            await onChanged();
            onClose();
          } catch (e) {
            Alert.alert('No pudimos eliminar', e instanceof Error ? e.message : 'Intenta de nuevo.');
            setDeleting(false);
          }
        },
      },
    ]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.editorBar, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={styles.close}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
          <Text style={styles.editorTitle}>Editar publicación</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
          {isVideo(photo) ? (
            <View style={[styles.preview, { width: width - spacing.lg * 2, height: 160, backgroundColor: colors.ink }]}>
              <Ionicons name="play" size={36} color="#fff" />
            </View>
          ) : (
            <Image source={{ uri: resolveImageUrl(photo.url) ?? undefined }} style={[styles.preview, { width: width - spacing.lg * 2, height: width - spacing.lg * 2 }]} contentFit="cover" />
          )}
          <View style={styles.captionHead}>
            <Text style={styles.label}>Descripción</Text>
            <AIWritingAssist kind="post_caption" currentText={caption} businessName={businessName} categoryName={categoryName} onApply={setCaption} />
          </View>
          <TextInput value={caption} onChangeText={setCaption} placeholder="Agrega una descripción…" placeholderTextColor={colors.muted} style={styles.input} maxLength={200} multiline />
          <Button title={saving ? 'Guardando…' : 'Guardar descripción'} onPress={() => void save()} disabled={!dirty || saving || deleting} />
          <Button title={deleting ? 'Eliminando…' : 'Eliminar'} variant="ghost" onPress={remove} disabled={saving || deleting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hint: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  cell: { overflow: 'hidden', borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyTitle: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  editorBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  editorTitle: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  preview: { borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  captionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  input: { minHeight: 90, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, padding: spacing.md, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink, backgroundColor: colors.surface, textAlignVertical: 'top' },
});
