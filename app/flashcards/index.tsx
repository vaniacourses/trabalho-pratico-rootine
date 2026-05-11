import { BatchCountdown } from "@/components/BatchCountdown";
import { ProgressBar } from "@/components/ProgressBar";
import { SwipeFlashcard } from "@/components/SwipeFlashcard";
import { BATCH_SIZE } from "@/constants/flashcards";
import { supabase } from "@/lib/supabase";
import { useFlashcardStore } from "@/store/useFlashcardStore";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

type ScreenState =
  | "loading"
  | "no_batch"
  | "active"
  | "expired"
  | "completed_today";

export default function FlashcardsScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  // Ref para evitar que checkIfCompletedToday rode durante operações em andamento
  const isInitialized = useRef(false);
  const completeBatchCalledRef = useRef(false);

  const {
    currentBatch,
    pendingFlashcards,
    answeredCount,
    loading,
    nextBatchAt,
    fetchActiveBatch,
    answerFlashcard,
    completeBatch,
    requestNewBatch,
  } = useFlashcardStore();

  // 1. Obter userId e fazer carga inicial completa antes de qualquer outra coisa
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || cancelled) return;
      setUserId(user.id);

      // Carrega batch primeiro
      await fetchActiveBatch(user.id);

      // Só agora lê o estado do store e do perfil
      const store = useFlashcardStore.getState();

      if (cancelled) return;

      if (store.currentBatch && store.pendingFlashcards.length > 0) {
        setScreenState("active");
      } else if (store.currentBatch && store.pendingFlashcards.length === 0) {
        // Todas respondidas — completar batch
        if (!completeBatchCalledRef.current) {
          completeBatchCalledRef.current = true;
          await completeBatch(user.id, store.currentBatch.id);
        }
        setScreenState("completed_today");
      } else {
        // Sem batch ativo — checar se já completou hoje
        const { data } = await supabase
          .from("profiles")
          .select("daily_flashcards_completed")
          .eq("id", user.id)
          .single();

        if (cancelled) return;

        if (data?.daily_flashcards_completed) {
          setScreenState("completed_today");
        } else {
          setScreenState("no_batch");
        }
      }

      isInitialized.current = true;
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []); // Roda apenas uma vez na montagem

  // 2. Reagir às mudanças do store SOMENTE após inicialização
  useEffect(() => {
    if (!isInitialized.current || loading) return;

    if (currentBatch && pendingFlashcards.length > 0) {
      setScreenState("active");
    } else if (currentBatch && pendingFlashcards.length === 0) {
      if (userId && !completeBatchCalledRef.current) {
        completeBatchCalledRef.current = true;
        completeBatch(userId, currentBatch.id);
      }
      setScreenState("completed_today");
    }
  }, [loading, currentBatch, pendingFlashcards, userId]);

  // Handlers
  const handleSwipe = useCallback(
    async (answer: boolean | null) => {
      if (pendingFlashcards.length === 0) return;
      const current = pendingFlashcards[0];
      await answerFlashcard(current.answerId, answer);
    },
    [pendingFlashcards, answerFlashcard],
  );

  const handleExpired = useCallback(() => {
    setScreenState("expired");
    setTimeout(() => {
      router.replace("/(tabs)");
    }, 3000);
  }, [router]);

  const handleRequestBatch = useCallback(async () => {
    if (!userId) return;
    setScreenState("loading");
    await requestNewBatch(userId);
    // Após criar, checar o store atualizado
    const store = useFlashcardStore.getState();
    if (store.currentBatch && store.pendingFlashcards.length > 0) {
      setScreenState("active");
    } else {
      setScreenState("no_batch");
    }
  }, [userId, requestNewBatch]);

  // ── TELAS ───────────────────────────────────────────────

  if (screenState === "loading") {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Carregando flashcards...</Text>
      </View>
    );
  }

  if (screenState === "expired") {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.bigEmoji}>🌿</Text>
        <Text style={styles.messageTitle}>Lote expirado</Text>
        <Text style={styles.messageSubtitle}>
          O tempo acabou! Não se preocupe,{"\n"}amanhã você pode tentar de novo.
        </Text>
        <Text style={styles.redirectText}>Redirecionando...</Text>
      </View>
    );
  }

  if (screenState === "completed_today") {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.bigEmoji}>🎉</Text>
        <Text style={styles.messageTitle}>Parabéns!</Text>
        <Text style={styles.messageSubtitle}>
          Você já respondeu seus flashcards hoje.{"\n"}Volte amanhã para um novo
          lote!
        </Text>
        {nextBatchAt && (
          <View style={styles.nextBatchContainer}>
            <Text style={styles.nextBatchLabel}>Próximo lote em:</Text>
            <BatchCountdown expiresAt={nextBatchAt} onExpired={() => {}} />
          </View>
        )}
        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => router.replace("/(tabs)")}
        >
          <Text style={styles.homeButtonText}>Voltar para Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (screenState === "no_batch") {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.bigEmoji}>🃏</Text>
        <Text style={styles.messageTitle}>Flashcards do Dia</Text>
        <Text style={styles.messageSubtitle}>
          Responda {BATCH_SIZE} perguntas rápidas{"\n"}sobre seus hábitos de
          hoje.
        </Text>
        <TouchableOpacity
          style={[styles.startButton, loading && styles.buttonDisabled]}
          onPress={handleRequestBatch}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.startButtonText}>Começar 🌱</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // TELA: Batch ativo — Swipe cards
  const totalCards = answeredCount + pendingFlashcards.length;
  const progress = totalCards > 0 ? answeredCount / totalCards : 0;

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Flashcards</Text>
          {nextBatchAt && (
            <BatchCountdown expiresAt={nextBatchAt} onExpired={handleExpired} />
          )}
        </View>
        <ProgressBar progress={progress} />
        <Text style={styles.counter}>
          {answeredCount} de {totalCards}
        </Text>
      </View>

      <View style={styles.cardArea}>
        {pendingFlashcards.length > 0 && (
          <SwipeFlashcard
            key={pendingFlashcards[0].answerId}
            question={pendingFlashcards[0].question}
            onSwipe={handleSwipe}
          />
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F8" },
  centeredContainer: {
    flex: 1,
    backgroundColor: "#F0F4F8",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#333" },
  counter: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "bold",
    color: "#999",
    letterSpacing: 1,
    textAlign: "center",
  },
  cardArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 40,
  },
  bigEmoji: { fontSize: 64, marginBottom: 16 },
  messageTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  messageSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
  redirectText: {
    marginTop: 16,
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
  },
  nextBatchContainer: {
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },
  nextBatchLabel: { fontSize: 12, color: "#999", fontWeight: "600" },
  startButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 16,
    elevation: 3,
    shadowColor: "#4CAF50",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  buttonDisabled: { backgroundColor: "#A5D6A7" },
  startButtonText: { color: "#FFF", fontSize: 18, fontWeight: "bold" },
  homeButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  homeButtonText: { color: "#4CAF50", fontSize: 14, fontWeight: "600" },
});
