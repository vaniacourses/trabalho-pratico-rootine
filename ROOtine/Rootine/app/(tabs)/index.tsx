import TreeDisplay from "@/components/TreeDisplay";
import { getLevelFromXp } from "@/lib/domain/xp";
import { supabase } from "@/lib/supabase";
import { invokeFunction } from "@/lib/rootineApi";
import { useEcoStore } from "@/store/useEcoStore";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

interface HabitatLeaf {
  id?: string;
  position: number;
  title: string;
  message: string;
}

const FALLBACK_LEAVES: HabitatLeaf[] = [
  {
    position: 1,
    title: "Raiz da Jornada",
    message: "Jovem guardião, tuas escolhas já tocaram o solo. Cada resposta tua alimenta as raízes deste bosque interior.",
  },
  {
    position: 2,
    title: "Folha da Memória",
    message: "Recordo tuas missões como inscrições antigas: pequenas ações, quando repetidas, tornam-se linhagem.",
  },
  {
    position: 3,
    title: "Vento do Perfil",
    message: "Teu contexto é terreno sagrado. Nenhum conselho deve exigir de ti o que tua realidade não permite sustentar.",
  },
  {
    position: 4,
    title: "Copa do Amanhã",
    message: "Segue com constância, não com pressa. Florestas antigas nasceram de gestos quase invisíveis.",
  },
];

export default function HabitatScreen() {
  const { xp, impactTotals, fetchProfile } = useEcoStore();
  const [leaves, setLeaves] = useState<HabitatLeaf[]>(FALLBACK_LEAVES);
  const [selectedLeaf, setSelectedLeaf] = useState<HabitatLeaf | null>(null);
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  const levelInfo = getLevelFromXp(xp || 0);

  const impactPulse = Math.min(
    45,
    (impactTotals.water_l || 0) * 0.08 +
      (impactTotals.co2_kg || 0) * 8 +
      (impactTotals.waste_g || 0) * 0.015 +
      (impactTotals.energy_kwh || 0) * 10,
  );
  const vitalityScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (xp > 0 ? 20 : 8) +
          levelInfo.progress * 35 +
          impactPulse,
      ),
    ),
  );
  const vitalityLabel =
    vitalityScore >= 70
      ? "alta"
      : vitalityScore >= 35
        ? "em crescimento"
        : "em recuperação";
  const xpToNext = Math.max(0, levelInfo.xpNext - (xp || 0));

  const loadLeaves = useCallback(async () => {
    setLoadingLeaves(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await fetchProfile(user.id);
      console.log("[HABITAT] Perfil do Habitat carregado:", {
        userId: user.id,
      });

      const { data, error } = await invokeFunction("habitat-leaves", {
        body: { userId: user.id },
      });

      if (error) throw error;
      if (data?.leaves?.length) {
        setLeaves(data.leaves);
      }
    } catch (error) {
      console.error("[HABITAT] Erro ao carregar folhas:", error);
      setLeaves(FALLBACK_LEAVES);
    } finally {
      setLoadingLeaves(false);
    }
  }, [fetchProfile]);

  useFocusEffect(
    useCallback(() => {
      loadLeaves();
    }, [loadLeaves]),
  );

  const handleLeafPress = (index: number) => {
    setSelectedLeaf(leaves[index] || FALLBACK_LEAVES[index]);
  };

  return (
    <View style={styles.container}>
      <HabitatBackdrop />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Habitat</Text>
          <Text style={styles.title}>A Árvore Ancestral</Text>
          <Text style={styles.subtitle}>
            Toque nas folhas numeradas para ouvir memórias criadas a partir da sua jornada.
          </Text>
        </View>

        <View style={styles.treeShell}>
          <View style={styles.treeContainer}>
            <TreeDisplay
              onLeafPress={handleLeafPress}
              vitalityScore={vitalityScore}
            />
          </View>
          {loadingLeaves ? (
            <View style={styles.loadingLeavesPill}>
              <ActivityIndicator color="#2E7D32" size="small" />
              <Text style={styles.loadingLeavesText}>Atualizando folhas</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.progressPanel}>
          <View style={styles.levelHeader}>
            <View>
              <Text style={styles.panelEyebrow}>Progresso do habitat</Text>
              <Text style={styles.levelTitle}>
                Nível {levelInfo.level} · {levelInfo.milestone}
              </Text>
            </View>
            <Text style={styles.vitalityBadge}>{vitalityLabel}</Text>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(levelInfo.progress * 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {xp || 0} XP acumulados · faltam {xpToNext} XP para o próximo marco
          </Text>
        </View>
      </ScrollView>

      <Modal visible={!!selectedLeaf} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalLabel}>Mensagem da árvore</Text>
            <Text style={styles.modalTitle}>{selectedLeaf?.title}</Text>
            <Text style={styles.modalMessage}>{selectedLeaf?.message}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelectedLeaf(null)}
            >
              <Text style={styles.closeText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function HabitatBackdrop() {
  return (
    <View pointerEvents="none" style={styles.backdrop}>
      <Svg width="100%" height="100%" viewBox="0 0 390 820" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="habitat-sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#D9F2D5" />
            <Stop offset="0.52" stopColor="#B8DDB9" />
            <Stop offset="1" stopColor="#6B946E" />
          </LinearGradient>
          <LinearGradient id="habitat-ground" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#7FA56F" stopOpacity="0.86" />
            <Stop offset="1" stopColor="#274C2E" />
          </LinearGradient>
        </Defs>

        <Rect width="390" height="820" fill="url(#habitat-sky)" />
        <Path
          d="M0 610 C60 560 111 592 168 548 C230 500 292 526 390 472 L390 820 L0 820 Z"
          fill="#88B879"
          opacity="0.7"
        />
        <Path
          d="M0 675 C72 624 116 650 188 615 C256 581 315 596 390 542 L390 820 L0 820 Z"
          fill="url(#habitat-ground)"
        />
        <Path
          d="M0 760 C54 724 122 732 190 700 C257 669 323 676 390 642 L390 820 L0 820 Z"
          fill="#244C2D"
          opacity="0.82"
        />

        <Path d="M34 820 L42 440" stroke="#496D3A" strokeWidth="10" strokeLinecap="round" opacity="0.34" />
        <Path d="M332 820 L324 382" stroke="#395D32" strokeWidth="13" strokeLinecap="round" opacity="0.32" />
        <Path d="M94 820 L108 524" stroke="#547A42" strokeWidth="7" strokeLinecap="round" opacity="0.28" />
        <Path d="M278 820 L286 490" stroke="#4B7140" strokeWidth="8" strokeLinecap="round" opacity="0.26" />

        <Path
          d="M-18 398 C-5 352 28 326 65 345 C101 363 113 410 86 445 C54 486 4 463 -18 398 Z"
          fill="#5F8D4E"
          opacity="0.28"
        />
        <Path
          d="M265 346 C280 286 337 255 382 288 C428 322 419 395 362 430 C312 461 252 416 265 346 Z"
          fill="#4F7E43"
          opacity="0.24"
        />
        <Path
          d="M54 510 C68 469 111 452 143 477 C174 501 163 551 124 571 C87 590 42 552 54 510 Z"
          fill="#78A865"
          opacity="0.24"
        />
        <Path
          d="M239 476 C251 430 296 410 331 438 C368 469 348 526 303 542 C266 556 227 520 239 476 Z"
          fill="#668F56"
          opacity="0.22"
        />

        <Path
          d="M24 618 C38 596 57 592 72 604 C52 611 42 626 36 648 C31 637 25 628 24 618 Z"
          fill="#D8EBC7"
          opacity="0.42"
        />
        <Path
          d="M307 590 C326 566 349 570 364 590 C339 591 326 604 314 625 C313 615 309 603 307 590 Z"
          fill="#D8EBC7"
          opacity="0.36"
        />
        <Path
          d="M145 710 C166 686 193 693 208 718 C177 711 164 724 154 744 C153 731 149 720 145 710 Z"
          fill="#BBDDA1"
          opacity="0.42"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#7FA56F" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  content: { flexGrow: 1, paddingTop: 58, paddingHorizontal: 20, paddingBottom: 34 },
  header: { alignItems: "center" },
  eyebrow: {
    fontSize: 12,
    color: "#24542D",
    fontWeight: "bold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: { fontSize: 28, fontWeight: "bold", color: "#14391D", marginTop: 6, textAlign: "center" },
  subtitle: {
    color: "#2E5736",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },
  treeShell: {
    marginTop: 18,
    backgroundColor: "rgba(232, 245, 220, 0.32)",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.36)",
    overflow: "hidden",
    minHeight: 410,
    shadowColor: "#1B5E20",
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 2,
  },
  treeContainer: { height: 410, justifyContent: "center", alignItems: "center" },
  loadingLeavesPill: {
    position: "absolute",
    right: 14,
    top: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 249, 230, 0.92)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },
  loadingLeavesText: { color: "#2E7D32", fontSize: 12, fontWeight: "800" },
  progressPanel: {
    marginTop: 16,
    backgroundColor: "rgba(239, 249, 230, 0.84)",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.48)",
  },
  levelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  panelEyebrow: {
    color: "#2E7D32",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  levelTitle: { color: "#173F20", fontSize: 17, fontWeight: "bold", marginTop: 4 },
  vitalityBadge: {
    backgroundColor: "#E8F5E9",
    color: "#1B5E20",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: "800",
  },
  progressTrack: {
    height: 9,
    backgroundColor: "rgba(46, 125, 50, 0.16)",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 14,
  },
  progressFill: { height: "100%", backgroundColor: "#2E7D32", borderRadius: 999 },
  progressText: { color: "#315C39", marginTop: 8, fontWeight: "700", lineHeight: 18 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 24,
    elevation: 8,
  },
  modalLabel: {
    color: "#7B1FA2",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  modalTitle: { fontSize: 24, fontWeight: "bold", color: "#1B5E20", marginBottom: 12 },
  modalMessage: { fontSize: 16, color: "#455A64", lineHeight: 24 },
  closeButton: {
    backgroundColor: "#2E7D32",
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 22,
    alignItems: "center",
  },
  closeText: { color: "#FFF", fontWeight: "bold" },
});
