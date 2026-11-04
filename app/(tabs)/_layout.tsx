import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInboxSummary } from '@/chat/useInboxSummary';
import { badgeText, messagesA11y } from '@/lib/inbox';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';

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

/** Ícono de pestaña: la activa va en tinta sobre una pastilla gris clara con micro-resorte; las demás, en gris sin pastilla. */
function tabIcon(name: IconName) {
  return ({ focused }: { focused: boolean }) => <TabPillIcon name={name} focused={focused} />;
}

export default function TabsLayout() {
  // Insignias (3.37): conversaciones sin leer en Mensajes y un punto en Perfil si hay solicitudes de cita por revisar.
  const inbox = useInboxSummary();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: [styles.bar, { height: 76 + insets.bottom, paddingBottom: insets.bottom + 8 }],
        tabBarItemStyle: styles.item,
        tabBarLabelStyle: { fontFamily: fonts.ui.extrabold, fontSize: 12, marginTop: 2 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Explorar', tabBarIcon: tabIcon('map-outline') }} />
      <Tabs.Screen name="offers" options={{ title: 'Ofertas', tabBarIcon: tabIcon('pricetag-outline') }} />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Mensajes',
          tabBarIcon: tabIcon('chatbubble-outline'),
          tabBarBadge: badgeText(inbox.messages),
          tabBarBadgeStyle: styles.badge,
          tabBarAccessibilityLabel: messagesA11y(inbox.messages),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: tabIcon('person-outline'),
          tabBarBadge: inbox.requests > 0 ? '' : undefined,
          tabBarBadgeStyle: styles.dot,
          tabBarAccessibilityLabel: inbox.requests > 0 ? `Perfil, ${inbox.requests} solicitudes por revisar` : 'Perfil',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.surface, elevation: 0, shadowOpacity: 0 },
  item: { paddingVertical: 0 },
  pill: { width: 58, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.selectedSoft },
  badge: { backgroundColor: colors.danger, fontFamily: fonts.ui.extrabold, fontSize: 12 },
  dot: { backgroundColor: colors.danger, minWidth: 10, maxHeight: 10, borderRadius: 5, top: 2 },
});
