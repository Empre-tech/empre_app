import { Ionicons } from '@/components/Icon';
import { Tabs, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { useInboxSummary } from '@/chat/useInboxSummary';
import { getPhoneFlag } from '@/lib/phoneFlags';
import { EmpreButton } from '@/components/EmpreButton';
import { badgeText, messagesA11y } from '@/lib/inbox';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

// La pestaña elegida (2026-11-16): el ícono en el rojo de referencia y la palabra en tinta, sobre su cápsula clara.
const ON = colors.brandRef;
const OFF = colors.faint;

function TabPillIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const reduce = useReduceMotion();
  const [pop] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    if (reduce) {
      pop.setValue(focused ? 1 : 0);
      return;
    }
    // La cápsula aparece con un pequeño resorte al llegar a la pestaña.
    Animated.spring(pop, { toValue: focused ? 1 : 0, friction: 6, tension: 170, useNativeDriver: true }).start();
  }, [focused, reduce, pop]);

  return (
    <View style={styles.pillBox}>
      <Animated.View style={[styles.pill, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }] }]} />
      <Ionicons name={focused ? (name.replace('-outline', '') as IconName) : name} color={focused ? ON : OFF} size={21} />
    </View>
  );
}

const TAB_META: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Inicio', icon: 'home-outline' },
  offers: { label: 'Ofertas', icon: 'pricetag-outline' },
  chats: { label: 'Mensajes', icon: 'chatbubble-outline' },
  profile: { label: 'Perfil', icon: 'person-outline' },
};

/** Alto de la barra sin el borde inferior del teléfono. */
const BAR = 8 + 52;

export default function TabsLayout() {
  // Insignias (3.37): conversaciones sin leer en Mensajes y un punto en Perfil si hay solicitudes de cita por revisar.
  const inbox = useInboxSummary();
  const insets = useSafeAreaInsets();
  const dockBottom = Math.max(insets.bottom, 10);
  const msgBadge = badgeText(inbox.messages);
  // La primera vez sin sesión, la bienvenida (tablero «Primera vez»): una sola vez en este teléfono.
  const router = useRouter();
  const { status } = useAuth();
  useEffect(() => {
    if (status !== 'signedOut') return;
    let alive = true;
    void getPhoneFlag('welcome-seen').then((seen) => {
      if (alive && !seen) router.push('/(auth)/welcome');
    });
    return () => {
      alive = false;
    };
  }, [status, router]);

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
              const a11yLabel =
                route.name === 'chats'
                  ? messagesA11y(inbox.messages)
                  : route.name === 'profile' && inbox.requests > 0
                    ? `Perfil, ${inbox.requests} solicitudes por revisar`
                    : meta.label;

              return (
                <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={a11yLabel} onPress={onPress} style={styles.tabItem}>
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

      {/* El botón Empre flota sobre todas las pestañas, a la derecha y encima de la barra. */}
      <EmpreButton bottom={BAR + dockBottom + 14} />
    </>
  );
}

const styles = StyleSheet.create({
  // La barra en blanco (tablero «Dirección clara»): la pestaña elegida en rojo sobre su cápsula clara.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 6,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  tabItem: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  pillBox: { width: 56, height: 28, alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', width: 56, height: 28, borderRadius: 14, backgroundColor: colors.brandRefSoft },
  label: { fontFamily: fonts.ui.semibold, fontSize: 12, marginTop: 3, color: OFF },
  labelOn: { color: colors.ink },
  badge: {
    position: 'absolute',
    top: -4,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.ui.bold, fontSize: 11, color: '#FFFFFF' },
  dot: {
    position: 'absolute',
    top: 2,
    right: 12,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.brand,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});
