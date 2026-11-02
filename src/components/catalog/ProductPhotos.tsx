import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mediaApi } from '@/api/media';
import type { UploadableImage } from '@/api/types';
import { MAX_ITEM_PHOTOS } from '@/lib/catalog';
import { mediaUrl } from '@/lib/image';
import { pickImage, takePhoto } from '@/lib/images';
import { colors, fonts, radius, spacing } from '@/theme';

/** Una foto en la ficha: ya subida (`id`) o subiéndose (`uri` local). */
export interface PhotoSlot {
  key: string;
  id?: string;
  uri?: string;
  uploading?: boolean;
  failed?: boolean;
  /** La imagen lista para reintentar si falló. */
  image?: UploadableImage;
}

/** Las fotos ya guardadas de un producto, como espacios de la ficha. */
export function slotsFrom(ids: string[] | undefined): PhotoSlot[] {
  return (ids ?? []).map((id) => ({ key: id, id }));
}

/** Los ids listos para guardar (las que terminaron de subir), en orden. */
export function readyIds(slots: PhotoSlot[]): string[] {
  return slots.filter((s) => s.id && !s.uploading).map((s) => s.id as string);
}

interface Props {
  value: PhotoSlot[];
  onChange: Dispatch<SetStateAction<PhotoSlot[]>>;
  onError: (message: string) => void;
}

/**
 * Las fotos de un producto en su ficha: hasta 3, la primera es la portada. Cada foto se sube apenas se elige (se ve
 * una ruedita mientras tanto) y se guarda con el resto de la ficha. Mantener presionada una foto la vuelve portada.
 */
export function ProductPhotos({ value, onChange, onError }: Props) {
  const [sheet, setSheet] = useState(false);
  const left = MAX_ITEM_PHOTOS - value.length;

  const upload = async (key: string, image: UploadableImage) => {
    onChange((s) => s.map((x) => (x.key === key ? { ...x, uploading: true, failed: false } : x)));
    try {
      const res = await mediaApi.upload(image);
      onChange((s) => s.map((x) => (x.key === key ? { ...x, id: res.id, uploading: false } : x)));
    } catch {
      onChange((s) => s.map((x) => (x.key === key ? { ...x, uploading: false, failed: true } : x)));
      onError('Una foto no se pudo subir. Toca el ícono de reintentar o quítala.');
    }
  };

  const add = async (source: 'camera' | 'library') => {
    setSheet(false);
    try {
      const image = source === 'camera' ? await takePhoto() : await pickImage({ aspect: [1, 1] });
      if (!image) return;
      const key = `new-${Date.now()}`;
      onChange((s) => [...s, { key, uri: image.uri, uploading: true, image }]);
      await upload(key, image);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo abrir la foto.');
    }
  };

  const remove = (key: string) => onChange((s) => s.filter((x) => x.key !== key));
  const makeCover = (key: string) =>
    onChange((s) => {
      const found = s.find((x) => x.key === key);
      return found ? [found, ...s.filter((x) => x.key !== key)] : s;
    });

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.label}>
        Fotos <Text style={styles.meta}>{value.length} de {MAX_ITEM_PHOTOS}</Text>
      </Text>
      <View style={styles.row}>
        {value.map((p, i) => (
          <Pressable
            key={p.key}
            accessibilityRole="button"
            accessibilityLabel={i === 0 ? 'Foto de portada' : `Foto ${i + 1}. Mantén presionado para volverla portada`}
            onLongPress={() => makeCover(p.key)}
            onPress={() => (p.failed && p.image ? void upload(p.key, p.image) : undefined)}
            style={[styles.tile, i === 0 && styles.cover]}
          >
            <Image source={{ uri: p.uri ?? (p.id ? mediaUrl(p.id) : undefined) }} style={styles.img} contentFit="cover" transition={150} />
            {p.uploading ? (
              <View style={styles.veil}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : null}
            {p.failed ? (
              <View style={styles.veil}>
                <Ionicons name="refresh" size={22} color="#fff" />
              </View>
            ) : null}
            {i === 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Portada</Text>
              </View>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Quitar foto" hitSlop={8} onPress={() => remove(p.key)} style={styles.remove}>
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </Pressable>
        ))}
        {left > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Agregar fotos" onPress={() => setSheet(true)} style={[styles.tile, styles.addTile]}>
            <Ionicons name={value.length ? 'add' : 'camera-outline'} size={24} color={colors.primary} />
            <Text style={styles.addText}>{value.length ? 'Agregar' : 'Agregar foto'}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.meta}>
        {value.length > 1 ? 'La primera es la portada. Mantén presionada una foto para volverla portada.' : 'Con foto, tu producto se ve mejor en tu perfil.'}
      </Text>
      <PhotoSourceSheet visible={sheet} left={left} onPick={(s) => void add(s)} onClose={() => setSheet(false)} />
    </View>
  );
}

function PhotoSourceSheet({ visible, left, onPick, onClose }: { visible: boolean; left: number; onPick: (s: 'camera' | 'library') => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
        <View style={styles.grab} />
        <Text style={styles.title}>Agregar foto</Text>
        <Text style={styles.meta}>{left === 1 ? 'Te queda 1.' : `Te quedan ${left}.`} Con luz de día y fondo claro se ve mejor.</Text>
        <View style={styles.sources}>
          <Pressable accessibilityRole="button" onPress={() => onPick('camera')} style={styles.source}>
            <Ionicons name="camera-outline" size={26} color={colors.primary} />
            <Text style={styles.sourceText}>Tomar foto</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => onPick('library')} style={styles.source}>
            <Ionicons name="images-outline" size={26} color={colors.primary} />
            <Text style={styles.sourceText}>Elegir de la galería</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const TILE = 84;

const styles = StyleSheet.create({
  label: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  meta: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  tile: { width: TILE, height: TILE, borderRadius: 14, overflow: 'visible', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  cover: { borderWidth: 2, borderColor: colors.primary },
  img: { width: '100%', height: '100%', borderRadius: 12 },
  veil: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 12, backgroundColor: 'rgba(22,35,58,0.45)', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 6, height: 20, borderRadius: 6, backgroundColor: colors.ink, justifyContent: 'center' },
  badgeText: { fontSize: 10.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  remove: { position: 'absolute', right: -6, top: -6, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#fff', backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  addTile: { borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#9FB3CC', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 2 },
  addText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.primary, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(22,35,58,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center' },
  title: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  sources: { flexDirection: 'row', gap: spacing.sm },
  source: { flex: 1, minHeight: 92, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 6 },
  sourceText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink, textAlign: 'center' },
});
