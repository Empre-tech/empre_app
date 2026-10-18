import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, type ColorValue } from 'react-native';
import { useInboxSummary } from '@/chat/useInboxSummary';
import { badgeText, messagesA11y } from '@/lib/inbox';
import { colors, fonts } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />;
}

export default function TabsLayout() {
  // Insignias (3.37): conversaciones sin leer en Mensajes y un punto en Perfil si hay solicitudes de cita por revisar.
  const inbox = useInboxSummary();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: fonts.ui.bold, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Explorar', tabBarIcon: tabIcon('map-outline') }} />
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
  badge: { backgroundColor: colors.danger, fontFamily: fonts.ui.extrabold, fontSize: 11 },
  dot: { backgroundColor: colors.danger, minWidth: 10, maxHeight: 10, borderRadius: 5, top: 2 },
});
