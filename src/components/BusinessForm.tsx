import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categoriesApi, entitiesApi } from '@/api/endpoints';
import type { EntityDetail, EntityInput, Subcategory, UploadableImage } from '@/api/types';
import { hasLocation, type Coords } from '@/lib/geo';
import { resolveImageUrl } from '@/lib/image';
import { pickImage } from '@/lib/images';
import { colors, fonts, radius, spacing } from '@/theme';
import { Button } from './Button';
import { LocationPickerModal } from './LocationPickerModal';
import { TextField } from './TextField';

interface Props {
  /** Si viene, el formulario edita ese negocio; si no, crea uno nuevo. */
  initial?: EntityDetail;
}

type PhotoKind = 'profile' | 'banner' | 'gallery';

const STEPS = ['Datos básicos', 'Ubicación y contacto', 'Fotos'] as const;

export function BusinessForm({ initial }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const editing = Boolean(initial);

  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: 5 * 60_000 });

  const [step, setStep] = useState(0);

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [categoryId, setCategoryId] = useState(initial?.category?.id ?? '');
  const [subcategoryIds, setSubcategoryIds] = useState<string[]>(
    (initial?.subcategories ?? []).map((s) => s.id),
  );
  const [subPickerOpen, setSubPickerOpen] = useState(false);
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
  // Fotos ya subidas que el usuario marcó para borrar al guardar.
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCategory = (categories.data ?? []).find((c) => c.id === categoryId) ?? null;
  const availableSubcategories: Subcategory[] = selectedCategory?.subcategories ?? [];
  const selectedSubcategories = availableSubcategories.filter((s) => subcategoryIds.includes(s.id));

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

  const removeExistingPhoto = (photoId: string) => {
    if (!initial) return;
    Alert.alert('Quitar foto', '¿Quitar esta foto de la galería?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          setDeletingPhotoId(photoId);
          try {
            await entitiesApi.deleteImage(initial.id, photoId);
            setRemovedPhotoIds((prev) => [...prev, photoId]);
            void queryClient.invalidateQueries({ queryKey: ['entity', initial.id] });
          } catch (e) {
            Alert.alert('No pudimos quitar la foto', e instanceof Error ? e.message : 'Inténtalo de nuevo.');
          } finally {
            setDeletingPhotoId(null);
          }
        },
      },
    ]);
  };

  const goToBusiness = (id: string) => {
    if (editing && router.canGoBack()) router.back();
    else router.replace({ pathname: '/business/[id]', params: { id } });
  };

  const stepError = (target: number): string | null => {
    if (target > 0 && name.trim().length < 2) return 'Escribe el nombre del negocio.';
    if (target > 0 && !categoryId) return 'Elige una categoría.';
    return null;
  };

  const goNext = () => {
    const err = stepError(step + 1);
    if (err) return setError(err);
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setError(null);
    if (step === 0) {
      router.canGoBack() ? router.back() : router.replace('/(tabs)');
      return;
    }
    setStep((s) => Math.max(s - 1, 0));
  };

  const onSubmit = async () => {
    const err = stepError(1);
    if (err) return setError(err);

    setSaving(true);
    setError(null);
    try {
      const input: EntityInput = {
        name: name.trim(),
        description: description.trim(),
        category: categoryId,
        subcategory_ids: subcategoryIds,
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
        } catch (e) {
          const detail = e instanceof Error ? e.message : null;
          failed.push(detail ? `${label} (${detail})` : label);
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

  const existingGallery = useMemo(
    () =>
      [...(initial?.photos ?? [])]
        .filter((p) => !removedPhotoIds.includes(p.id))
        .sort((a, b) => a.order - b.order),
    [initial?.photos, removedPhotoIds],
  );

  const isLastStep = step === STEPS.length - 1;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={goBack} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{editing ? 'Editar negocio' : 'Nuevo negocio'}</Text>
      </View>

      <View style={styles.stepper}>
        {STEPS.map((label, index) => {
          const active = index === step;
          const done = index < step;
          return (
            <View key={label} style={styles.stepItem}>
              <View style={[styles.stepDot, active && styles.stepDotActive, done && styles.stepDotDone]}>
                {done ? (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                ) : (
                  <Text style={[styles.stepDotText, active && styles.stepDotTextActive]}>{index + 1}</Text>
                )}
              </View>
              <Text style={[styles.stepLabel, active && styles.stepLabelActive]} numberOfLines={1}>
                {label}
              </Text>
              {index < STEPS.length - 1 ? <View style={styles.stepLine} /> : null}
            </View>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 ? (
          <>
            <TextField
              label="Nombre del negocio"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholder="Ej. Arepas de la Plaza"
            />

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
                        onPress={() => {
                          setCategoryId(category.id);
                          // Al cambiar de categoría, las subcategorías de la anterior ya no aplican.
                          setSubcategoryIds((prev) =>
                            prev.filter((id) => (category.subcategories ?? []).some((s) => s.id === id)),
                          );
                        }}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{category.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            {categoryId ? (
              <View style={styles.field}>
                <Text style={styles.label}>Subcategorías</Text>
                {availableSubcategories.length === 0 ? (
                  <Text style={styles.muted}>Esta categoría todavía no tiene subcategorías.</Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSubPickerOpen(true)}
                    style={styles.dropdown}
                  >
                    <Text style={styles.dropdownText} numberOfLines={1}>
                      {selectedSubcategories.length > 0
                        ? selectedSubcategories.map((s) => s.name).join(', ')
                        : 'Elegir subcategorías (opcional)'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={colors.muted} />
                  </Pressable>
                )}
              </View>
            ) : null}

            <TextField
              label="Descripción"
              value={description}
              onChangeText={setDescription}
              autoCapitalize="sentences"
              multiline
              placeholder="Cuéntale a la gente qué ofreces"
              style={styles.multiline}
            />
          </>
        ) : null}

        {step === 1 ? (
          <>
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
          </>
        ) : null}

        {step === 2 ? (
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
                <View key={photo.id} style={styles.galleryTile}>
                  <Image source={{ uri: resolveImageUrl(photo.url) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Quitar foto"
                    onPress={() => removeExistingPhoto(photo.id)}
                    style={styles.removeBadge}
                    disabled={deletingPhotoId === photo.id}
                  >
                    {deletingPhotoId === photo.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="close" size={14} color="#fff" />
                    )}
                  </Pressable>
                </View>
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
            <Text style={styles.muted}>Toca la X sobre una foto para quitarla.</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.navRow}>
          {step > 0 ? (
            <Button title="Atrás" variant="secondary" onPress={() => setStep((s) => Math.max(s - 1, 0))} style={styles.navButton} disabled={saving} />
          ) : null}
          {isLastStep ? (
            <Button
              title={editing ? 'Guardar cambios' : 'Crear negocio'}
              onPress={onSubmit}
              loading={saving}
              style={styles.navButton}
            />
          ) : (
            <Button title="Siguiente" onPress={goNext} style={styles.navButton} />
          )}
        </View>

        {!editing && isLastStep ? (
          <Text style={styles.muted}>Tu negocio quedará en revisión hasta que verifiquemos tu identidad.</Text>
        ) : null}
        {editing && isLastStep ? (
          <Button title="Eliminar negocio" variant="ghost" onPress={confirmDelete} disabled={saving} />
        ) : null}
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

      <SubcategoryPickerModal
        visible={subPickerOpen}
        categoryName={selectedCategory?.name ?? ''}
        options={availableSubcategories}
        selectedIds={subcategoryIds}
        onClose={() => setSubPickerOpen(false)}
        onToggle={(id) =>
          setSubcategoryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
        }
      />
    </KeyboardAvoidingView>
  );
}

function SubcategoryPickerModal({
  visible,
  categoryName,
  options,
  selectedIds,
  onToggle,
  onClose,
}: {
  visible: boolean;
  categoryName: string;
  options: Subcategory[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <Text style={styles.modalTitle}>Subcategorías de {categoryName}</Text>
        <Text style={styles.muted}>Puedes elegir varias.</Text>
        <ScrollView style={styles.modalList} contentContainerStyle={{ gap: spacing.xs }}>
          {options.map((sub) => {
            const active = selectedIds.includes(sub.id);
            return (
              <Pressable
                key={sub.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onToggle(sub.id)}
                style={[styles.modalOption, active && styles.modalOptionActive]}
              >
                <Text style={[styles.modalOptionText, active && styles.modalOptionTextActive]}>{sub.name}</Text>
                {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
        <Button title="Listo" onPress={onClose} />
      </View>
    </Modal>
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
  headerTitle: { fontSize: 17, fontWeight: '700', fontFamily: fonts.ui.bold, color: colors.ink },
  stepper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  stepItem: { flex: 1, alignItems: 'center' },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  stepDotActive: { borderColor: colors.primary },
  stepDotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepDotText: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  stepDotTextActive: { color: colors.primary },
  stepLabel: { fontSize: 11, fontFamily: fonts.ui.medium, color: colors.muted, marginTop: 4, textAlign: 'center' },
  stepLabelActive: { color: colors.ink, fontFamily: fonts.ui.semibold },
  stepLine: {
    position: 'absolute',
    top: 11,
    left: '62%',
    right: '-38%',
    height: 1.5,
    backgroundColor: colors.line,
  },
  content: { padding: spacing.lg, gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { fontSize: 14, fontWeight: '600', fontFamily: fonts.ui.semibold, color: colors.ink },
  subLabel: { marginTop: spacing.sm },
  muted: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
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
  chipText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.ui.semibold, color: colors.ink },
  chipTextActive: { color: '#fff' },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg,
  },
  dropdownText: { flex: 1, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink, marginRight: spacing.sm },
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
  slotText: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
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
  navRow: { flexDirection: 'row', gap: spacing.sm },
  navButton: { flex: 1 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 17, fontFamily: fonts.display.semibold, color: colors.ink },
  modalList: { marginVertical: spacing.sm },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  modalOptionActive: { backgroundColor: colors.primary + '1A' },
  modalOptionText: { fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink },
  modalOptionTextActive: { fontFamily: fonts.ui.semibold, color: colors.primary },
});
