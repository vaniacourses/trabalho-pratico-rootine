import TreeDisplay from "@/components/TreeDisplay";
import { useEcoStore } from "@/store/useEcoStore";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function HabitatScreen() {
  const { xp, impactTotals } = useEcoStore();

  return (
    <View style={styles.container}>
      {/* Header com XP */}
      <View style={styles.header}>
        <Text style={styles.xpLabel}>Nível de Harmonia</Text>
        <Text style={styles.xpValue}>{xp} XP</Text>
      </View>

      {/* Área da Árvore */}
      <View style={styles.treeContainer}>
        <TreeDisplay />
      </View>

      {/* Mini Stats de Impacto */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statEmoji}>💧</Text>
          <Text style={styles.statValue}>{impactTotals.water_l}L</Text>
          <Text style={styles.statLabel}>Água</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statEmoji}>☁️</Text>
          <Text style={styles.statValue}>{impactTotals.co2_kg}kg</Text>
          <Text style={styles.statLabel}>CO2</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F8" },
  header: { paddingTop: 60, paddingHorizontal: 20, alignItems: "center" },
  xpLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "bold",
    letterSpacing: 1,
  },
  xpValue: { fontSize: 32, fontWeight: "bold", color: "#2E7D32" },
  treeContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  statCard: {
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 15,
    alignItems: "center",
    width: "45%",
    elevation: 2,
  },
  statEmoji: { fontSize: 20, marginBottom: 5 },
  statValue: { fontSize: 18, fontWeight: "bold", color: "#333" },
  statLabel: { fontSize: 10, color: "#999" },
});
