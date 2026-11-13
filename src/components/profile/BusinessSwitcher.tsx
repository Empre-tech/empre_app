import { Ionicons } from '@/components/Icon';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { colors, fonts } from '@/theme';

/**
 * La casilla para elegir negocio (tablero «Mi negocio»): una sola línea dice en cuál estás; al tocarla ves todos y
 * entras a otro con un toque. Con un solo negocio no se dibuja.
 */
export function BusinessSwitcher({ currentId, onPick, onAdd }: { currentId: string; onPick: (id: string) => void; onAdd: () => void }) {
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const mine = useQuery({ queryKey: ['my-entities'], queryFn: entitiesApi.mine, enabled: status === 'signedIn', staleTime: 60_000 });
  const [open, setOpen] = useState(false);
  const list = mine.data ?? [];
  if (list.length < 2) return null;
  const idx = Math.max(0, list.findIndex((e) => e.id === currentId));
  const cur = list[idx];

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Tu negocio: ${cur?.name}. ${idx + 1} de ${list.length}. Cambiar`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={[styles.box, open && styles.boxOpen]}
      >
        <Avatar uri={cur?.profile_url} name={cur?.name ?? ''} size={34} />
        <View style={styles.boxText}>
          <Text style={styles.boxLead}>{`Tu negocio · ${idx + 1} de ${list.length}`}</Text>
          <Text style={styles.boxName} numberOfLines={1}>
            {cur?.name}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.ink} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.veil} onPress={() => setOpen(false)} />
        <View style={[styles.panel, { top: insets.top + 64 }]} accessibilityRole="list">
          {list.map((e) => {
            const on = e.id === currentId;
            return (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={e.name}
                onPress={() => {
                  setOpen(false);
                  if (!on) onPick(e.id);
                }}
                style={styles.row}
              >
                <Avatar uri={e.profile_url} name={e.name} size={44} />
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {e.name}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {e.category_name}
                  </Text>
                </View>
                <View style={[styles.check, on && styles.checkOn]}>{on ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}</View>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setOpen(false);
              onAdd();
            }}
            style={styles.add}
          >
            <Text style={styles.addText}>+ Sumar negocio</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 6, paddingRight: 12 },
  boxOpen: { borderColor: colors.ink, borderWidth: 2 },
  boxText: { flex: 1, minWidth: 0 },
  boxLead: { fontFamily: fonts.ui.bold, fontSize: 11, color: colors.muted },
  boxName: { fontFamily: fonts.ui.extrabold, fontSize: 14.5, color: colors.ink },
  veil: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(17,19,24,0.32)' },
  panel: { position: 'absolute', left: 12, right: 12, borderRadius: 20, backgroundColor: colors.surface, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10, shadowColor: colors.ink, shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.selectedSoft },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: fonts.ui.extrabold, fontSize: 14.5, color: colors.ink },
  rowSub: { fontFamily: fonts.ui.bold, fontSize: 12, color: colors.muted },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.placeholder, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  add: { minHeight: 44, marginTop: 10, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  addText: { fontFamily: fonts.ui.extrabold, fontSize: 13.5, color: colors.ink },
});
