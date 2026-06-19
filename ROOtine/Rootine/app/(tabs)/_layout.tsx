import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="flashcards"
        options={{
          title: 'Aventura',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="bolt.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="adventure"
        options={{
          title: 'Trilha',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="map.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Habitat',
          tabBarIcon: ({ color }) => <IconSymbol size={34} name="leaf.fill" color={color} />,
          tabBarItemStyle: {
            transform: [{ translateY: -8 }],
          },
          tabBarLabelStyle: {
            fontWeight: '700',
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="biosphere"
        options={{
          title: 'Biosfera',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="globe.americas.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          href: null,
          title: 'Admin',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gear" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="missions"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
