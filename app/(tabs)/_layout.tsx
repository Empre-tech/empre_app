import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInboxSummary } from '@/chat/useInboxSummary';
import { badgeText, messagesA11y } from '@/lib/inbox';
import { cardShadow, colors, fonts } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** Ícono de pestaña: la activa va en tinta sobre una pastilla gris clara; las demás, en tinta sin pastilla. */
function tabIcon(name: IconName) {
  return ({ focused }: { focused: boolean }) => (
    <View style={[styles.pill, focused && styles.pillOn]}>
      <Ionicons name={focused ? (name.replace('-outline', '') as IconName) : name} color={colors.ink} size={20} />
    </View>
  );
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
        tabBarInactiveTintColor: colors.ink,
        // Barra flotante: separada de los bordes, redondeada y con sombra, como en los mockups.
        tabBarStyle: [styles.bar, { marginBottom: Math.max(insets.bottom, 12) }],
        tabBarItemStyle: styles.item,
        tabBarLabelStyle: { fontFamily: fonts.ui.bold, fontSize: 11, marginTop: 2 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Explorar', tabBarIcon: tabIcon('compass-outline') }} />
      <Tabs.Screen name="offers" options={{ title: 'Ofertas', tabBarIcon: tabIcon('pricetag-outline') }} />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Mensajes',
          tabBarIcon: tabIcon('chatbubbles-outline'),
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
          // Un punto (sin número) si algún negocio tiene solicitudes por revisar; el número va en el perfil.
          tabBarBadge: inbox.requests > 0 ? '' : undefined,
          tabBarBadgeStyle: styles.dot,
          tabBarAccessibilityLabel: inbox.requests > 0 ? `Perfil, ${inbox.requests} solicitudes por revisar` : 'Perfil',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'relative',
    marginHorizontal: 12,
    height: 68,
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: 24,
    borderTopWidth: 0,
    backgroundColor: colors.surface,
    ...cardShadow,
  },
  item: { paddingVertical: 0 },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.selectedSoft },
  badge: { backgroundColor: colors.danger, fontFamily: fonts.ui.extrabold, fontSize: 11 },
  dot: { backgroundColor: colors.danger, minWidth: 10, maxHeight: 10, borderRadius: 5, top: 2 },
});
