import MissionCard from "@/components/MissionCard";
import { supabase } from "@/lib/supabase";
import { useEcoStore } from "@/store/useEcoStore";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function TrailScreen() {
  const { missions, fetchPendingMissions, loading } = useEcoStore();

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) await fetchPendingMissions(user.id);
    }
    init();
  }, []);

  if (loading && missions.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>
          O Guardião está analisando seus hábitos...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sua Trilha</Text>
      <FlatList
        data={missions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MissionCard
            missionId={item.id}
            title={item.template.title}
            description={item.template.description}
            category={item.template.category}
            justification={item.ai_justification}
            xp={item.template.base_xp}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              Nenhuma missão pendente. Sua árvore agradece! 🌳
            </Text>
          </View>
        }
        contentContainerStyle={styles.listPadding}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F4F8",
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#666" },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1B5E20",
    marginBottom: 20,
  },
  emptyContainer: { marginTop: 100, alignItems: "center" },
  emptyText: { color: "#999", fontSize: 16, textAlign: "center" },
  listPadding: { paddingBottom: 40 },
});
