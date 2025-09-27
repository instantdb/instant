import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: 'Home',
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="home" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="play/authhello"
        options={{
          tabBarLabel: 'Auth Hello',
          title: 'Auth Hello',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="lock" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="play/expo-auth-session"
        options={{
          tabBarLabel: 'Expo Auth',
          title: 'Expo Auth',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="lock" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="play/colors"
        options={{
          tabBarLabel: 'Colors',
          title: 'Colors',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="color-lens" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen name="play/ephemeral-demo" options={{ href: null }} />
      <Tabs.Screen name="play/colors-schema" options={{ href: null }} />
      <Tabs.Screen name="play/auth-hooks" options={{ href: null }} />
    </Tabs>
  );
}
