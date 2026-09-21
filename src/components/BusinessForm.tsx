import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categoriesApi, entitiesApi } from '@/api/endpoints';
import type { EntityDetail, EntityInput, UploadableImage } from '@/api/types';
import { hasLocation, type Coords } from '@/lib/geo';
import { resolveImageUrl } from '@/lib/image';
import { pickImage } from '@/lib/images';
import { colors, radius, spacing } from '@/theme';
import { Button } from './Button';
import { LocationPickerModal } from './LocationPickerModal';
import { TextField } from './TextField';

interface Props {
  /** Si viene, el formulario edita ese negocio; si no, crea uno nuevo. */
  initial?: EntityDetail;
}

type PhotoKind = 'profile' | 'banner' | 'gallery';

export function BusinessForm({ initial }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const editing = Boolean(initial);

  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: 5 * 60_000 });

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [categoryId, setCategoryId] = useState(initial?.category?.id ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [city, setCity] = useState(initial?.city ?? 'Cartagena');
  const [contact, setContact] = useState(initial?.contact_info ?? '');
  const [coords, setCoords] = useState<Coords | null>(
    initial && hasLocation(initial) ? { latitude: initial.latitude, longitude: initial.longitude } : null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  // Fotos nuevas elegidas en este formulario; se suben al guardar.
  const [profile, setProfile] = useState<UploadableImage | null>(null);
  const [banner, setBanner] = useState<UploadableImage | null>(null);
  const [gallery, setGallery] = useState<UploadableImage[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (kind: PhotoKind) => {
    setError(null);
    try {
      const image = await pickImage(
        kind === 'profile' ? { aspect: [1, 1], maxWidth: 800 } : kind === 'banner' ? { aspect: [16, 9] } : {},
      );
      if (!image) return;
      if (kind === 'profile') setProfile(image);
      else if (kind === 'banner') setBanner(image);
      else setGallery((prev) => [...prev, image]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos abrir la galería.');
    }
  };

  const goToBusiness = (id: string) => {
    if (editing && router.canGoBack()) router.back();
    else router.replace({ pathname: '/business/[id]', params: { id } });
  };

  const onSubmit = async () => {
    if (name.trim().length < 2) return setError('Escribe el nombre del negocio.');
    if (!categoryId) return setError('Elige una categoría.');

    setSaving(true);
    setError(null);
    try {
      const input: EntityInput = {
        name: name.trim(),
        description: description.trim(),
        category: categoryId,
        address: address.trim(),
        city: city.trim(),
        contact_info: contact.trim(),
        latitude: coords?.latitude ?? 0,
        longitude: coords?.longitude ?? 0,
      };

      let id: string;
      if (initial) {
        await entitiesApi.update(initial.id, input);
        id = initial.id;
      } else {
        id = (await entitiesApi.create(input)).id;
      }

      // Las fotos van aparte: el negocio ya está guardado aunque alguna falle.
      const failed: string[] = [];
      const upload = async (label: string, task: () => Promise<unknown>) => {
        try {
          await task();
        } catch {
          failed.push(label);
        }
      };
      if (profile) await upload('la foto de perfil', () => entitiesApi.uploadImage(id, 'profile', profile));
      if (banner) await upload('el banner', () => entitiesApi.uploadImage(id, 'banner', banner));
      for (const [index, photo] of gallery.entries()) {
        await upload(`la foto ${index + 1} de la galería`, () => entitiesApi.uploadImage(id, 'gallery', photo));
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entities'] }),
        queryClient.invalidateQueries({ queryKey: ['my-entities'] }),
        queryClient.invalidateQueries({ queryKey: ['entity', id] }),
      ]);

      if (failed.length > 0) {
        Alert.alert(
          'Negocio guardado',
          `No pudimos subir ${failed.join(', ')}. Puedes intentarlo de nuevo desde "Editar negocio".`,
          [{ text: 'Entendido', onPress: () => goToBusiness(id) }],
        );
      } else {
        goToBusiness(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar el negocio.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!initial) return;
    Alert.alert('Eliminar negocio', `¿Seguro que quieres eliminar "${initial.name}"? Esta acción no se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await entitiesApi.remove(initial.id);
            queryClient.removeQueries({ queryKey: ['entity', initial.id] });
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['entities'] }),
              queryClient.invalidateQueries({ queryKey: ['my-entities'] }),
            ]);
            router.replace('/(tabs)/profile');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'No pudimos eliminar el negocio.');
            setSaving(false);
          }
        },
      },
    ]);
  };

  const existingGallery = [...(initial?.photos ?? [])].sort((a, b) => a.order - b.order);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          style={styles.headerButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{editing ? 'Editar negocio' : 'Nuevo negocio'}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <TextField label="Nombre del negocio" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Ej. Arepas de la Plaza" />

        <View style={styles.field}>
          <Text style={styles.label}>Categoría</Text>
          {categories.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (categories.data ?? []).length === 0 ? (
            <Text style={styles.muted}>Todavía no hay categorías disponibles.</Text>
          ) : (
            <View style={styles.chips}>
              {(categories.data ?? []).map((category) => {
                const active = category.id === categoryId;
                return (
                  <Pressable
                    key={category.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setCategoryId(category.id)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{category.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <TextField
          label="Descripción"
          value={description}
          onChangeText={setDescription}
          autoCapitalize="sentences"
          multiline
          placeholder="Cuéntale a la gente qué ofreces"
          style={styles.multiline}
        />
        <TextField label="Dirección" value={address} onChangeText={setAddress} autoCapitalize="words" placeholder="Calle, barrio o referencia" />
        <TextField label="Ciudad" value={city} onChangeText={setCity} autoCapitalize="words" />
        <TextField
          label="Contacto (teléfono, WhatsApp, redes)"
          value={contact}
          onChangeText={setContact}
          placeholder="300 123 4567"
        />

        <View style={styles.field}>
          <Text style={styles.label}>Ubicación en el mapa</Text>
          <Text style={styles.muted}>
            {coords
              ? `Pin colocado (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)})`
              : 'Sin ubicación: el negocio solo aparecerá en la lista, no en el mapa.'}
          </Text>
          <Button title={coords ? 'Cambiar ubicación' : 'Elegir en el mapa'} variant="secondary" onPress={() => setPickerOpen(true)} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Fotos</Text>
          <View style={styles.photoRow}>
            <PhotoSlot
              label="Perfil"
              shape="square"
              uri={profile?.uri ?? resolveImageUrl(initial?.profile_url)}
              onPress={() => void choose('profile')}
            />
            <PhotoSlot
              label="Banner"
              shape="wide"
              uri={banner?.uri ?? resolveImageUrl(initial?.banner_url)}
              onPress={() => void choose('banner')}
            />
          </View>

          <Text style={[styles.label, styles.subLabel]}>Galería</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
            {existingGallery.map((photo) => (
              <Image
                key={photo.id}
                source={{ uri: resolveImageUrl(photo.url) ?? undefined }}
                style={styles.galleryTile}
                contentFit="cover"
              />
            ))}
            {gallery.map((photo, index) => (
              <View key={photo.uri} style={styles.galleryTile}>
                <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Quitar foto"
                  onPress={() => setGallery((prev) => prev.filter((_, i) => i !== index))}
                  style={styles.removeBadge}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Agregar foto a la galería"
              onPress={() => void choose('gallery')}
              style={[styles.galleryTile, styles.addTile]}
            >
              <Ionicons name="add" size={28} color={colors.muted} />
            </Pressable>
          </ScrollView>
          {editing ? <Text style={styles.muted}>Las fotos de la galería ya subidas no se pueden quitar desde la app todavía.</Text> : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title={editing ? 'Guardar cambios' : 'Crear negocio'} onPress={onSubmit} loading={saving} />
        {!editing ? (
          <Text style={styles.muted}>Tu negocio quedará en revisión hasta que verifiquemos tu identidad.</Text>
        ) : (
          <Button title="Eliminar negocio" variant="ghost" onPress={confirmDelete} disabled={saving} />
        )}
      </ScrollView>

      <LocationPickerModal
        visible={pickerOpen}
        initial={coords}
        onCancel={() => setPickerOpen(false)}
        onConfirm={(point) => {
          setCoords(point);
          setPickerOpen(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

function PhotoSlot({
  label,
  uri,
  shape,
  onPress,
}: {
  label: string;
  uri: string | null;
  shape: 'square' | 'wide';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Elegir foto: ${label}`}
      onPress={onPress}
      style={[styles.slot, shape === 'square' ? styles.slotSquare : styles.slotWide]}
    >
      {uri ? (
        <>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.editBadge}>
            <Ionicons name="pencil" size={14} color="#fff" />
          </View>
        </>
      ) : (
        <View style={styles.slotEmpty}>
          <Ionicons name="image-outline" size={24} color={colors.muted} />
          <Text style={styles.slotText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  content: { padding: spacing.lg, gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink },
  subLabel: { marginTop: spacing.sm },
  muted: { fontSize: 13, color: colors.muted },
  error: { fontSize: 14, color: colors.danger },
  multiline: { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  chipTextActive: { color: '#fff' },
  photoRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  slot: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  slotSquare: { width: 96, height: 96 },
  slotWide: { flex: 1, height: 96 },
  slotEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  slotText: { fontSize: 12, color: colors.muted },
  editBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gallery: { gap: spacing.sm },
  galleryTile: {
    width: 84,
    height: 84,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  addTile: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed' },
  removeBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
