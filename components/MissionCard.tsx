import { useEcoStore } from "@/store/useEcoStore";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";
import relativeTime from "dayjs/plugin/relativeTime";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

dayjs.extend(relativeTime);
dayjs.locale("pt-br");

interface MissionCardProps {
  missionId: string;
  title: string;
  description: string;
  category: string;
  justification: string;
  xp: number;
  expiresAt: string;
}

export default function MissionCard({
  missionId,
  title,
  description,
  category,
  justification,
  xp,
  expiresAt,
}: MissionCardProps) {
  const { completeMission, refuseMission } = useEcoStore();

  const timeLeft = dayjs(expiresAt).fromNow();
  const isExpired = dayjs().isAfter(dayjs(expiresAt));

  if (isExpired) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.badgeRow}>
          <Text style={styles.categoryTag}>
            {category?.toUpperCase() || "GERAL"}
          </Text>
          <Text style={styles.deadlineTag}>⌛ {timeLeft}</Text>
        </View>
        <Text style={styles.xpText}>+{xp} XP</Text>
      </View>

      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      <View style={styles.aiBox}>
        <Text style={styles.aiLabel}>POR QUE ESTA MISSÃO?</Text>
        <Text style={styles.aiContent}>{justification}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.refuseButton]}
          onPress={() => refuseMission(missionId)}
        >
          <Text style={styles.refuseText}>Recusar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.completeButton]}
          onPress={() => completeMission(missionId)}
        >
          <Text style={styles.buttonText}>Concluir</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  badgeRow: { flexDirection: "row", gap: 8 },
  categoryTag: {
    backgroundColor: "#E8F5E9",
    color: "#2E7D32",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 10,
    fontWeight: "bold",
  },
  deadlineTag: {
    backgroundColor: "#FFF3E0",
    color: "#E65100",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 10,
    fontWeight: "bold",
  },
  xpText: { color: "#1976D2", fontWeight: "bold", fontSize: 14 },
  cardTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1B5E20",
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    color: "#546E7A",
    marginBottom: 16,
    lineHeight: 20,
  },
  aiBox: {
    backgroundColor: "#F3E5F5",
    borderLeftWidth: 4,
    borderLeftColor: "#9C27B0",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  aiLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#7B1FA2",
    marginBottom: 4,
    letterSpacing: 1,
  },
  aiContent: {
    fontSize: 13,
    fontStyle: "italic",
    color: "#4A148C",
    lineHeight: 18,
  },
  actions: { flexDirection: "row", gap: 12 },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  completeButton: { backgroundColor: "#4CAF50" },
  refuseButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#FF5252",
  },
  buttonText: { color: "#FFF", fontWeight: "bold", fontSize: 16 },
  refuseText: { color: "#FF5252", fontWeight: "bold", fontSize: 16 },
});
