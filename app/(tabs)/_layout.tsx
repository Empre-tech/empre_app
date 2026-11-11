import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { useInboxSummary } from '@/chat/useInboxSummary';
import { EmpreAISheet } from '@/components/ai/EmpreAISheet';
import { QuickActionSheet } from '@/components/QuickActionSheet';
import { badgeText, messagesA11y } from '@/lib/inbox';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function TabPillIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const reduce = useReduceMotion();
  const [pop] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    if (reduce) {
      pop.setValue(focused ? 1 : 0);
      return;
    }
    // La cápsula verde aparece con un pequeño resorte al llegar a la pestaña.
    Animated.spring(pop, { toValue: focused ? 1 : 0, friction: 6, tension: 170, useNativeDriver: true }).start();
  }, [focused, reduce, pop]);

  return (
    <View style={styles.pillBox}>
      <Animated.View style={[styles.pill, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }] }]} />
      <Ionicons name={focused ? (name.replace('-outline', '') as IconName) : name} color={focused ? colors.glow : '#8E929A'} size={21} />
    </View>
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
  const [aiOpen, setAiOpen] = useState(false);
  // Dónde quedó la pestaña Perfil, para que los atajos del negocio salgan encima de ella.
  const [anchor, setAnchor] = useState<{ bottom: number; x: number } | null>(null);
  const profileRef = useRef<View>(null);
  const win = useWindowDimensions();
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
          <View style={[styles.bar, { paddingBottom: dockBottom }]}>
            {state.routes.map((route, index) => {
              const meta = TAB_META[route.name];
              if (!meta) return null;
              const focused = state.index === index;
              const onPress = () => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              };
              // Atajos (tablero «Atajos»): mantener presionado Inicio abre Empre AI; Perfil, los atajos del negocio.
              const onLongPress =
                route.name === 'index'
                  ? () => setAiOpen(true)
                  : route.name === 'profile' && hasBusiness
                    ? () =>
                        profileRef.current?.measureInWindow((x, y, w, h) => {
                          setAnchor({ bottom: win.height - y - h + 8, x: x + w / 2 });
                          setQuickOpen(true);
                        })
                    : undefined;
              const a11yLabel =
                route.name === 'chats'
                  ? messagesA11y(inbox.messages)
                  : route.name === 'profile' && inbox.requests > 0
                    ? `Perfil, ${inbox.requests} solicitudes por revisar`
                    : meta.label;
              const hint =
                route.name === 'index' ? 'Mantén presionado para preguntarle a Empre AI' : route.name === 'profile' && hasBusiness ? 'Mantén presionado para los atajos de tu negocio' : undefined;

              return (
                <Pressable
                  key={route.key}
                  ref={route.name === 'profile' ? profileRef : undefined}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={a11yLabel}
                  accessibilityHint={hint}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  delayLongPress={350}
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
        )}
      >
        <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
        <Tabs.Screen name="offers" options={{ title: 'Ofertas' }} />
        <Tabs.Screen name="chats" options={{ title: 'Mensajes' }} />
        <Tabs.Screen name="profile" options={{ title: 'Perfil' }} />
      </Tabs>

      <QuickActionSheet visible={quickOpen} onClose={() => setQuickOpen(false)} anchorBottom={anchor?.bottom ?? dockBottom + 40} anchorX={anchor?.x ?? win.width / 2} />
      <EmpreAISheet visible={aiOpen} onClose={() => setAiOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  // La barra es un ancla negra (tablero «Luz con anclas negras»): la pestaña activa se enciende en verde.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 6,
    backgroundColor: colors.night,
  },
  tabItem: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  pillBox: { width: 58, height: 30, alignItems: 'center', justifyContent: 'center' },
  pill: {
    position: 'absolute',
    width: 58,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.glowSoft,
    shadowColor: colors.glow,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  label: { fontFamily: fonts.ui.extrabold, fontSize: 11.5, marginTop: 3, color: '#8E929A' },
  labelOn: { color: colors.glow },
  badge: {
    position: 'absolute',
    top: -4,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.glow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.ui.extrabold, fontSize: 10.5, color: colors.night },
  dot: {
    position: 'absolute',
    top: 2,
    right: 12,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.glow,
    borderWidth: 1.5,
    borderColor: colors.night,
  },
});
