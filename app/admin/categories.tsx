import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { adminApi, categoriesApi } from '@/api/endpoints';
import type { Category, Subcategory } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { SignInPrompt } from '@/components/SignInPrompt';
import { TextField } from '@/components/TextField';
import { colors, fonts, radius, spacing } from '@/theme';

// Íconos de Ionicons (variante outline) que un admin puede asignar a una
// categoría; se usan también como marcador de esa categoría en el mapa.
const ICON_OPTIONS = [
  'restaurant-outline',
  'cafe-outline',
  'beer-outline',
  'wine-outline',
  'fast-food-outline',
  'pizza-outline',
  'storefront-outline',
  'cart-outline',
  'bag-handle-outline',
  'gift-outline',
  'cut-outline',
  'sparkles-outline',
  'flower-outline',
  'medkit-outline',
  'fitness-outline',
  'heart-outline',
  'hammer-outline',
  'construct-outline',
  'build-outline',
  'home-outline',
  'hardware-chip-outline',
  'phone-portrait-outline',
  'laptop-outline',
  'bed-outline',
  'business-outline',
  'car-outline',
  'bicycle-outline',
  'paw-outline',
  'school-outline',
  'book-outline',
  'musical-notes-outline',
  'football-outline',
  'camera-outline',
  'brush-outline',
  'shirt-outline',
  'diamond-outline',
  'ellipsis-horizontal-circle-outline',
] as const;

/** Panel de admin: crear, editar y eliminar categorías y subcategorías. */
export default function AdminCategoriesScreen() {
  const { status, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const isAdmin = status === 'signedIn' && user?.role === 'admin';
  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, enabled: isAdmin });

  const [editingCategory, setEditingCategory] = useState<Category | 'new' | null>(null);
  const [addingSubTo, setAddingSubTo] = useState<Category | null>(null);
  const [editingSub, setEditingSub] = useState<{ sub: Subcategory; categoryName: string } | null>(null);

  const invalidateCategories = () => queryClient.invalidateQueries({ queryKey: ['categories'] });

  const confirmDeleteCategory = (category: Category) => {
    Alert.alert(
      'Eliminar categoría',
      `¿Eliminar "${category.name}"? Esto también elimina sus subcategorías. Los negocios que la usan no se borran, pero quedarán sin categoría válida.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminApi.deleteCategory(category.id);
              await invalidateCategories();
            } catch (e) {
              Alert.alert('No pudimos eliminar la categoría', e instanceof Error ? e.message : 'Inténtalo de nuevo.');
            }
          },
        },
      ],
    );
  };

  const confirmDeleteSub = (sub: Subcategory) => {
    Alert.alert('Eliminar subcategoría', `¿Eliminar "${sub.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await adminApi.deleteSubcategory(sub.id);
            await invalidateCategories();
          } catch (e) {
            Alert.alert('No pudimos eliminar la subcategoría', e instanceof Error ? e.message : 'Inténtalo de nuevo.');
          }
        },
      },
    ]);
  };

  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Volver"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))}
      style={styles.backButton}
      hitSlop={8}
    >
      <Ionicons name="chevron-back" size={24} color={colors.ink} />
    </Pressable>
  );

  if (status !== 'signedIn' || !user) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {back}
          <Text style={styles.headerTitle}>Categorías</Text>
        </View>
        <SignInPrompt title="Categorías" message="Inicia sesión con una cuenta de administrador." />
      </View>
    );
  }

  if (user.role !== 'admin') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {back}
          <Text style={styles.headerTitle}>Categorías</Text>
        </View>
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.muted} />
          <Text style={styles.empty}>No tienes permisos para ver esta sección.</Text>
        </View>
      </View>
    );
  }

  const data = categories.data ?? [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        {back}
        <Text style={styles.headerTitle}>Categorías</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nueva categoría"
          onPress={() => setEditingCategory('new')}
          style={styles.addButton}
          hitSlop={8}
        >
          <Ionicons name="add" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {categories.isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.centered} />
      ) : categories.isError ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>No pudimos cargar las categorías.</Text>
        </View>
      ) : data.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="pricetags-outline" size={32} color={colors.muted} />
          <Text style={styles.empty}>Todavía no hay categorías. Toca + para crear la primera.</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.iconBadge}>
                  <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.primary} />
                </View>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Editar ${item.name}`}
                  onPress={() => setEditingCategory(item)}
                  hitSlop={8}
                  style={styles.cardAction}
                >
                  <Ionicons name="pencil" size={16} color={colors.muted} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Eliminar ${item.name}`}
                  onPress={() => confirmDeleteCategory(item)}
                  hitSlop={8}
                  style={styles.cardAction}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </Pressable>
              </View>

              <View style={styles.subList}>
                {(item.subcategories ?? []).map((sub) => (
                  <View key={sub.id} style={styles.subRow}>
                    <Text style={styles.subText} numberOfLines={1}>
                      {sub.name}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Editar ${sub.name}`}
                      onPress={() => setEditingSub({ sub, categoryName: item.name })}
                      hitSlop={8}
                      style={styles.subAction}
                    >
                      <Ionicons name="pencil" size={13} color={colors.muted} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Eliminar ${sub.name}`}
                      onPress={() => confirmDeleteSub(sub)}
                      hitSlop={8}
                      style={styles.subAction}
                    >
                      <Ionicons name="close" size={14} color={colors.danger} />
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Agregar subcategoría a ${item.name}`}
                  onPress={() => setAddingSubTo(item)}
                  style={styles.addSubRow}
                >
                  <Ionicons name="add" size={14} color={colors.primary} />
                  <Text style={styles.addSubText}>Agregar subcategoría</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <CategoryModal
        visible={editingCategory !== null}
        category={editingCategory === 'new' ? null : editingCategory}
        onClose={() => setEditingCategory(null)}
        onSaved={invalidateCategories}
      />

      <SubcategoryModal
        visible={addingSubTo !== null}
        title={addingSubTo ? `Nueva subcategoría en ${addingSubTo.name}` : ''}
        initialName=""
        onClose={() => setAddingSubTo(null)}
        onSubmit={async (name) => {
          if (!addingSubTo) return;
          await adminApi.createSubcategory({ name, category_id: addingSubTo.id });
          await invalidateCategories();
          setAddingSubTo(null);
        }}
      />

      <SubcategoryModal
        visible={editingSub !== null}
        title={editingSub ? `Editar subcategoría de ${editingSub.categoryName}` : ''}
        initialName={editingSub?.sub.name ?? ''}
        onClose={() => setEditingSub(null)}
        onSubmit={async (name) => {
          if (!editingSub) return;
          await adminApi.updateSubcategory(editingSub.sub.id, name);
          await invalidateCategories();
          setEditingSub(null);
        }}
      />
    </View>
  );
}

function CategoryModal({
  visible,
  category,
  onClose,
  onSaved,
}: {
  visible: boolean;
  category: Category | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? ICON_OPTIONS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reinicia el formulario cada vez que se abre para una categoría distinta.
  const key = category?.id ?? 'new';

  const save = async () => {
    if (name.trim().length < 2) {
      setError('Escribe un nombre.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (category) await adminApi.updateCategory(category.id, { name: name.trim(), icon });
      else await adminApi.createCategory({ name: name.trim(), icon });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar la categoría.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      key={key}
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      onShow={() => {
        setName(category?.name ?? '');
        setIcon(category?.icon ?? ICON_OPTIONS[0]);
        setError(null);
      }}
    >
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.modalTitle}>{category ? 'Editar categoría' : 'Nueva categoría'}</Text>
          <TextField label="Nombre" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Ej. Restaurantes" />

          <Text style={styles.label}>Ícono</Text>
          <ScrollView style={styles.iconGrid} contentContainerStyle={styles.iconGridContent}>
            {ICON_OPTIONS.map((opt) => {
              const active = opt === icon;
              return (
                <Pressable
                  key={opt}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setIcon(opt)}
                  style={[styles.iconOption, active && styles.iconOptionActive]}
                >
                  <Ionicons name={opt as keyof typeof Ionicons.glyphMap} size={20} color={active ? '#fff' : colors.ink} />
                </Pressable>
              );
            })}
          </ScrollView>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title={category ? 'Guardar cambios' : 'Crear categoría'} onPress={save} loading={saving} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SubcategoryModal({
  visible,
  title,
  initialName,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  initialName: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (name.trim().length < 2) {
      setError('Escribe un nombre.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(name.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar la subcategoría.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      onShow={() => {
        setName(initialName);
        setError(null);
      }}
    >
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TextField label="Nombre" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Ej. Comida rápida" autoFocus />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Guardar" onPress={save} loading={saving} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backButton: { padding: 4, marginLeft: -4 },
  headerTitle: { flex: 1, fontSize: 20, fontFamily: fonts.display.semibold, color: colors.ink },
  addButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  empty: { color: colors.muted, fontSize: 14, fontFamily: fonts.ui.medium, textAlign: 'center' },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { flex: 1, fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  cardAction: { padding: 4 },
  subList: { gap: 4, paddingLeft: spacing.md + 34 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 3 },
  subText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  subAction: { padding: 3 },
  addSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  addSubText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.primary },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 17, fontFamily: fonts.display.semibold, color: colors.ink },
  label: { fontSize: 14, fontWeight: '600', fontFamily: fonts.ui.semibold, color: colors.ink },
  iconGrid: { maxHeight: 180 },
  iconGridContent: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.xs },
  iconOption: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
});
