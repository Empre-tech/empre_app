import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { useInboxSummary } from '@/chat/useInboxSummary';
import { BUTTON, QuickActionSheet } from '@/components/QuickActionSheet';
import { badgeText, messagesA11y } from '@/lib/inbox';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, softShadow } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function TabPillIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(focused ? 1 : 0.94)).current;

  useEffect(() => {
    if (reduce) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, {
      toValue: focused ? 1 : 0.94,
      friction: 6,
      tension: 160,
      useNativeDriver: true,
    }).start();
  }, [focused, reduce, scale]);

  return (
    <Animated.View style={[styles.pill, focused && styles.pillOn, { transform: [{ scale }] }]}>
      <Ionicons name={focused ? (name.replace('-outline', '') as IconName) : name} color={focused ? colors.ink : colors.faint} size={20} />
    </Animated.View>
  );
}

const TAB_META: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Inicio', icon: 'home-outline' },
  offers: { label: 'Ofertas', icon: 'pricetag-outline' },
  chats: { label: 'Mensajes', icon: 'chatbubble-outline' },
  profile: { label: 'Perfil', icon: 'person-outline' },
};

export default function TabsLayout() {
  // Insignias (3.37): conversaciones sin leer en Mensajes y un punto en Perfil si hay solicitudes de cita por revisar.
  const inbox = useInboxSummary();
  const insets = useSafeAreaInsets();
  const [quickOpen, setQuickOpen] = useState(false);
  const [capsuleHeight, setCapsuleHeight] = useState(66);
  const dockBottom = Math.max(insets.bottom, 10);
  const msgBadge = badgeText(inbox.messages);
  const { status } = useAuth();
  const mine = useQuery({ queryKey: ['my-entities'], queryFn: entitiesApi.mine, enabled: status === 'signedIn', staleTime: 60_000 });
  const hasBusiness = (mine.data ?? []).length > 0;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
        }}
        tabBar={({ state, navigation }) => (
          <View pointerEvents="box-none" style={[styles.dock, { paddingBottom: dockBottom }]}>
            <View style={styles.capsule} onLayout={(e) => setCapsuleHeight(e.nativeEvent.layout.height)}>
              {state.routes.map((route, index) => {
                const meta = TAB_META[route.name];
                if (!meta) return null;
                const focused = state.index === index;
                const onPress = () => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) {
                    navigation.navigate(route.name, route.params);
                  }
                };
                const a11yLabel =
                  route.name === 'chats'
                    ? messagesA11y(inbox.messages)
                    : route.name === 'profile' && inbox.requests > 0
                      ? `Perfil, ${inbox.requests} solicitudes por revisar`
                      : meta.label;

                return (
                  <Pressable
                    key={route.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: focused }}
                    accessibilityLabel={a11yLabel}
                    onPress={onPress}
                    style={styles.tabItem}
                  >
                    <View style={styles.iconWrap}>
                      <TabPillIcon name={meta.icon} focused={focused} />
                      {route.name === 'chats' && msgBadge ? (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{msgBadge}</Text>
                        </View>
                      ) : null}
                      {route.name === 'profile' && inbox.requests > 0 ? <View style={styles.dot} /> : null}
                    </View>
                    <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1}>
                      {meta.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={hasBusiness ? 'Abrir acciones rápidas de tu negocio' : 'Abrir acciones rápidas'}
              onPress={() => setQuickOpen(true)}
              style={({ pressed }) => [styles.plusBtn, pressed && styles.plusPressed]}
            >
              <Ionicons name={hasBusiness ? 'add' : 'sparkles'} size={hasBusiness ? 26 : 22} color="#fff" />
            </Pressable>
          </View>
        )}
      >
        <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
        <Tabs.Screen name="offers" options={{ title: 'Ofertas' }} />
        <Tabs.Screen name="chats" options={{ title: 'Mensajes' }} />
        <Tabs.Screen name="profile" options={{ title: 'Perfil' }} />
      </Tabs>

      <QuickActionSheet visible={quickOpen} onClose={() => setQuickOpen(false)} anchorBottom={dockBottom + (capsuleHeight - BUTTON) / 2} />
    </>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  capsule: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 30,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...softShadow,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    width: 50,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillOn: {
    backgroundColor: colors.selectedSoft,
  },
  label: {
    fontFamily: fonts.ui.extrabold,
    fontSize: 11,
    marginTop: 2,
    color: colors.faint,
  },
  labelOn: {
    color: colors.ink,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: fonts.ui.extrabold,
    fontSize: 10.5,
    color: '#fff',
  },
  dot: {
    position: 'absolute',
    top: 1,
    right: 10,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  plusBtn: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...softShadow,
  },
  plusPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
});
