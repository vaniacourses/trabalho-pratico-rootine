import MissionCard from "@/components/MissionCard";
import { supabase } from "@/lib/supabase";
import { useEcoStore } from "@/store/useEcoStore";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function AdventureScreen() {
  const {
    missions,
    fetchPendingMissions,
    generateMissions,
    loading,
    lastError,
    lastNotice,
    lastProgressEvent,
    clearProgressEvent,
    clearLastError,
    clearLastNotice,
  } = useEcoStore();
  const [userId, setUserId] = useState<string | null>(null);

  const loadMissions = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      await fetchPendingMissions(user.id);
    }
  }, [fetchPendingMissions]);

  useFocusEffect(
    useCallback(() => {
      loadMissions();
    }, [loadMissions]),
  );

  useEffect(() => {
    if (!lastProgressEvent) return undefined;
    const timeoutId = setTimeout(clearProgressEvent, 4500);
    return () => clearTimeout(timeoutId);
  }, [clearProgressEvent, lastProgressEvent]);

  useEffect(() => {
    if (!lastError) return undefined;
    const timeoutId = setTimeout(clearLastError, 6500);
    return () => clearTimeout(timeoutId);
  }, [clearLastError, lastError]);

  useEffect(() => {
    if (!lastNotice) return undefined;
    const timeoutId = setTimeout(clearLastNotice, 5200);
    return () => clearTimeout(timeoutId);
  }, [clearLastNotice, lastNotice]);

  const dailyMissions = useMemo(
    () => missions.filter((mission) => (mission.mission_type || "daily") === "daily"),
    [missions],
  );
  const specializedMissions = useMemo(
    () => missions.filter((mission) => mission.mission_type === "specialized"),
    [missions],
  );

  const handleGenerate = async (missionType: "daily" | "specialized") => {
    if (!userId) return;
    console.log("[TRILHA] Solicitando geração de missão:", missionType);
    await generateMissions(userId, missionType);
  };

  if (loading && missions.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>
          A Trilha está compondo sua próxima missão...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trilha</Text>
      <Text style={styles.subtitle}>
        Missões diárias e semanais ajustadas ao seu perfil e aos seus fatos aprendidos.
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, loading && styles.actionButtonDisabled]}
          onPress={() => handleGenerate("daily")}
          disabled={loading}
        >
          <Text style={styles.actionText}>{loading ? "Gerando..." : "Gerar diária"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.specializedButton,
            loading && styles.actionButtonDisabled,
          ]}
          onPress={() => handleGenerate("specialized")}
          disabled={loading}
        >
          <Text style={styles.actionText}>{loading ? "Gerando..." : "Gerar semanal"}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={missions}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <Text style={styles.sectionTitle}>Diárias: {dailyMissions.length}</Text>
            <Text style={styles.sectionTitle}>
              Semanais: {specializedMissions.length}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <MissionCard
            missionId={item.id}
            title={item.title}
            description={item.description}
            category={item.category || item.ai_justification?.category || "consumption"}
            justification={
              item.personalization_reason || item.ai_justification?.reason || ""
            }
            expiresAt={item.expires_at}
            xp={item.xp_reward ?? (item.mission_type === "specialized" ? 25 : 10)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              Nenhuma missão ativa. Peça uma nova missão para continuar sua Trilha.
            </Text>
          </View>
        }
        contentContainerStyle={styles.listPadding}
      />

      {lastProgressEvent ? (
        <View style={styles.progressToast}>
          <View style={styles.progressToastHeader}>
            <Text style={styles.progressTitle}>Progresso registrado</Text>
            <TouchableOpacity onPress={clearProgressEvent} hitSlop={8}>
              <Text style={styles.progressDismiss}>OK</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.progressText}>
            +{lastProgressEvent.missionXp} XP da missão
            {lastProgressEvent.achievementXp > 0
              ? ` + ${lastProgressEvent.achievementXp} XP de ${lastProgressEvent.achievementCount} conquista(s)`
              : ""}
          </Text>
          {lastProgressEvent.pending ? (
            <Text style={styles.progressPendingText}>Sincronizando conquistas...</Text>
          ) : null}
        </View>
      ) : null}

      {lastError ? (
        <View style={styles.errorToast}>
          <View style={styles.errorToastHeader}>
            <Text style={styles.errorTitle}>Missão não gerada</Text>
            <TouchableOpacity onPress={clearLastError} hitSlop={8}>
              <Text style={styles.errorDismiss}>OK</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.errorText}>{lastError}</Text>
        </View>
      ) : null}

      {lastNotice ? (
        <View style={styles.noticeToast}>
          <View style={styles.errorToastHeader}>
            <Text style={styles.noticeTitle}>Limite de missões</Text>
            <TouchableOpacity onPress={clearLastNotice} hitSlop={8}>
              <Text style={styles.noticeDismiss}>OK</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.noticeText}>{lastNotice}</Text>
        </View>
      ) : null}
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
    fontSize: 30,
    fontWeight: "bold",
    color: "#1B5E20",
  },
  subtitle: {
    color: "#607D8B",
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 18,
  },
  actions: { flexDirection: "row", gap: 10, marginBottom: 16 },
  actionButton: {
    flex: 1,
    backgroundColor: "#2E7D32",
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
  },
  actionButtonDisabled: { opacity: 0.68 },
  specializedButton: { backgroundColor: "#7B1FA2" },
  actionText: { color: "#FFF", fontWeight: "bold" },
  sectionTitle: {
    color: "#607D8B",
    fontWeight: "700",
    marginBottom: 4,
  },
  emptyContainer: { marginTop: 80, alignItems: "center" },
  emptyText: { color: "#78909C", textAlign: "center", lineHeight: 22 },
  listPadding: { paddingBottom: 40 },
  errorToast: {
    position: "absolute",
    right: 16,
    top: 54,
    zIndex: 35,
    minWidth: 260,
    maxWidth: 380,
    backgroundColor: "#FFEBEE",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#C62828",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 8,
  },
  errorToastHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  errorTitle: { color: "#B71C1C", fontWeight: "bold", marginBottom: 4 },
  errorText: { color: "#C62828", lineHeight: 20 },
  errorDismiss: { color: "#B71C1C", fontWeight: "bold" },
  noticeToast: {
    position: "absolute",
    right: 16,
    top: 54,
    zIndex: 34,
    minWidth: 260,
    maxWidth: 380,
    backgroundColor: "#E3F2FD",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#1976D2",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 8,
  },
  noticeTitle: { color: "#0D47A1", fontWeight: "bold", marginBottom: 4 },
  noticeText: { color: "#1565C0", lineHeight: 20 },
  noticeDismiss: { color: "#0D47A1", fontWeight: "bold" },
  progressToast: {
    position: "absolute",
    right: 16,
    bottom: 22,
    zIndex: 30,
    minWidth: 240,
    maxWidth: 360,
    backgroundColor: "#E8F5E9",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#2E7D32",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 8,
  },
  progressToastHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  progressTitle: { color: "#1B5E20", fontWeight: "bold" },
  progressText: { color: "#2E7D32", fontWeight: "700", lineHeight: 20 },
  progressPendingText: { color: "#607D8B", fontSize: 12, marginTop: 2 },
  progressDismiss: { color: "#1B5E20", fontWeight: "bold" },
});
