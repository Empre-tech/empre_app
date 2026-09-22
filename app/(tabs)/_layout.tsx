import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { colors, fonts } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: fonts.ui.bold, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Explorar', tabBarIcon: tabIcon('map-outline') }} />
      <Tabs.Screen name="chats" options={{ title: 'Mensajes', tabBarIcon: tabIcon('chatbubbles-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: tabIcon('person-outline') }} />
    </Tabs>
  );
}
