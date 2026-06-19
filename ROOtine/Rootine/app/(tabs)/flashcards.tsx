import { BatchCountdown } from "@/components/BatchCountdown";
import { ProgressBar } from "@/components/ProgressBar";
import { SwipeFlashcard } from "@/components/SwipeFlashcard";
import { BATCH_SIZE } from "@/constants/flashcards";
import { supabase } from "@/lib/supabase";
import { invokeFunction } from "@/lib/rootineApi";
import { useFlashcardStore } from "@/store/useFlashcardStore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
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

interface QuizOption {
  id: string;
  text: string;
}

interface TrailQuiz {
  id: string;
  quiz_question_id: string;
  question: string;
  options: QuizOption[];
  correct_option: string;
  explanation: string;
  category: string;
  difficulty?: number;
  signal_key?: string;
}

export default function FlashcardsTab() {
  const [userId, setUserId] = useState<string | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [quiz, setQuiz] = useState<TrailQuiz | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizResult, setQuizResult] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [quizSaving, setQuizSaving] = useState(false);
  const [flashcardError, setFlashcardError] = useState<string | null>(null);
  const [flashcardRenderKey, setFlashcardRenderKey] = useState(0);
  const isInitialized = useRef(false);
  const completingBatchIdsRef = useRef<Set<string>>(new Set());

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

  // ── Inicialização ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      console.log("[ADVENTURE] Iniciando tela...");

      const {
        data: { session },
        error: sessionErr,
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (sessionErr || !user || cancelled) {
        console.log("[ADVENTURE] Sem usuário autenticado:", sessionErr?.message);
        return;
      }

      console.log("[ADVENTURE] userId:", user.id);
      setUserId(user.id);

      // Carrega batch ativo
      await fetchActiveBatch(user.id);

      if (cancelled) return;

      // Lê estado atual do store APÓS o fetch
      const store = useFlashcardStore.getState();
      console.log("[ADVENTURE] currentBatch após fetch:", store.currentBatch?.id ?? "null");
      console.log("[ADVENTURE] pendingFlashcards:", store.pendingFlashcards.length);
      console.log("[ADVENTURE] answeredCount:", store.answeredCount);

      if (store.currentBatch && store.pendingFlashcards.length > 0) {
        console.log("[ADVENTURE] Estado: ACTIVE");
        setScreenState("active");
      } else if (store.currentBatch && store.pendingFlashcards.length === 0) {
        console.log("[ADVENTURE] Estado: COMPLETED_TODAY (todas respondidas)");
        if (!completingBatchIdsRef.current.has(store.currentBatch.id)) {
          completingBatchIdsRef.current.add(store.currentBatch.id);
          try {
            await completeBatch(user.id, store.currentBatch.id);
          } catch (error) {
            completingBatchIdsRef.current.delete(store.currentBatch.id);
            console.error("[ADVENTURE] Erro ao finalizar lote completo:", error);
          }
        }
        setScreenState("completed_today");
      } else {
        // Sem batch — checar se já completou hoje
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("daily_flashcards_completed")
          .eq("id", user.id)
          .single();

        console.log("[ADVENTURE] daily_flashcards_completed:", profile?.daily_flashcards_completed, "erro:", profileErr?.message);

        if (cancelled) return;

        if (profile?.daily_flashcards_completed) {
          console.log("[ADVENTURE] Estado: COMPLETED_TODAY (perfil marcado)");
          setScreenState("completed_today");
        } else {
          console.log("[ADVENTURE] Estado: NO_BATCH");
          setScreenState("no_batch");
        }
      }

      isInitialized.current = true;
    };

    init();
    return () => { cancelled = true; };
  }, [completeBatch, fetchActiveBatch]);

  // ── Reage a mudanças do store após inicialização ───────────────
  useEffect(() => {
    if (!isInitialized.current || loading) return;

    console.log("[ADVENTURE][STORE UPDATE] currentBatch:", currentBatch?.id ?? "null",
      "| pending:", pendingFlashcards.length, "| loading:", loading);

    if (currentBatch && pendingFlashcards.length > 0) {
      setScreenState("active");
    } else if (currentBatch && pendingFlashcards.length === 0) {
      if (userId && !completingBatchIdsRef.current.has(currentBatch.id)) {
        completingBatchIdsRef.current.add(currentBatch.id);
        setScreenState("loading");
        completeBatch(userId, currentBatch.id)
          .then(() => {
            setScreenState("completed_today");
          })
          .catch((error) => {
            completingBatchIdsRef.current.delete(currentBatch.id);
            console.error("[ADVENTURE] Erro ao finalizar lote completo:", error);
            setScreenState("completed_today");
          });
        return;
      }
      setScreenState("completed_today");
    }
  }, [completeBatch, loading, currentBatch, pendingFlashcards, userId]);

  // ── Handlers ─────────────────────────────────────────────────
  const handleSwipe = useCallback(
    async (answer: boolean | null) => {
      if (!userId || pendingFlashcards.length === 0) return;
      const current = pendingFlashcards[0];
      console.log("[ADVENTURE] Respondendo:", current.answerId, "->", answer);
      setFlashcardError(null);
      const saved = await answerFlashcard(userId, current.answerId, answer);
      if (!saved) {
        setFlashcardRenderKey((value) => value + 1);
        setFlashcardError(
          "Não consegui registrar esta carta. Confira a conexão e tente de novo.",
        );
      }
    },
    [pendingFlashcards, answerFlashcard, userId],
  );

  const handleExpired = useCallback(() => {
    console.log("[ADVENTURE] Batch expirado");
    setScreenState("expired");
    setTimeout(() => setScreenState("no_batch"), 3000);
  }, []);

  const handleRequestBatch = useCallback(async () => {
    if (!userId) {
      console.log("[ADVENTURE] handleRequestBatch: userId ainda null");
      return;
    }
    console.log("[ADVENTURE] Solicitando novo batch para userId:", userId);
    setFlashcardError(null);
    setFlashcardRenderKey((value) => value + 1);
    setScreenState("loading");

    await requestNewBatch(userId);

    // Lê store atualizado
    const store = useFlashcardStore.getState();
    console.log("[ADVENTURE] Após requestNewBatch - currentBatch:", store.currentBatch?.id ?? "null");
    console.log("[ADVENTURE] Após requestNewBatch - pending:", store.pendingFlashcards.length);

    if (store.currentBatch && store.pendingFlashcards.length > 0) {
      console.log("[ADVENTURE] Novo batch carregado, indo para ACTIVE");
      isInitialized.current = true;
      setScreenState("active");
    } else if (store.currentBatch && store.pendingFlashcards.length === 0) {
      console.log("[ADVENTURE] Batch existente sem pendentes -> COMPLETED_TODAY");
      setScreenState("completed_today");
    } else {
      console.log("[ADVENTURE] requestNewBatch falhou ou não retornou batch -> NO_BATCH");
      setScreenState("no_batch");
    }
  }, [userId, requestNewBatch]);

  const handleGenerateQuiz = useCallback(async () => {
    if (!userId || quizLoading) return;
    setQuizLoading(true);
    setQuizResult(null);
    try {
      const { data, error } = await invokeFunction("generate-quiz", {
        body: { userId },
      });
      if (error) throw error;
      if (data?.error || !data?.quiz?.quiz_question_id) {
        throw new Error(String(data?.error ?? "Quiz sem origem determinística."));
      }
      setQuiz(data.quiz);
      setSelectedOption(null);
    } catch (error) {
      console.error("[ADVENTURE] Erro ao gerar quiz:", error);
      const detail = error instanceof Error ? error.message : String(error);
      setSelectedOption(null);
      setQuizResult(
        `Não foi possível carregar um quiz determinístico agora. Detalhe: ${detail}`,
      );
    } finally {
      setQuizLoading(false);
    }
  }, [quizLoading, userId]);

  const handleAnswerQuiz = useCallback(
    async (optionId: string) => {
      if (!userId || !quiz || quizResult || quizSaving) return;

      setQuizSaving(true);
      setSelectedOption(optionId);

      const correct = optionId === quiz.correct_option;

      try {
        const { data, error } = await invokeFunction(
          "answer-adventure-quiz",
          {
            body: {
              userId,
              quizId: quiz.id,
              quizQuestionId: quiz.quiz_question_id,
              selectedOption: optionId,
            },
          },
        );

        if (error || data?.error) {
          throw error ?? new Error(String(data?.error));
        }

        invokeFunction("sync-user-brain", {
            body: {
              userId,
              event_type: "QUIZ_COMPLETED",
              quizId: quiz.id,
            },
          })
          .catch((syncError) => {
            console.error("[BRAIN] Sync quiz da Aventura error:", syncError);
          });

        setQuizResult(
          correct
            ? `Resposta correta. ${quiz.explanation}`
            : `Resposta para revisar. A correta era ${quiz.correct_option}. ${quiz.explanation}`,
        );
      } catch (error) {
        console.error("[ADVENTURE] Erro ao salvar resposta do quiz:", error);
        const detail = error instanceof Error ? error.message : String(error);
        setQuizResult(`Não foi possível registrar sua resposta: ${detail}`);
      } finally {
        setQuizSaving(false);
      }
    },
    [quiz, quizResult, quizSaving, userId],
  );

  const getQuizOptionStyle = (optionId: string) => {
    if (!selectedOption) return styles.quizOption;

    if (optionId === quiz?.correct_option) {
      return [styles.quizOption, styles.quizOptionCorrect];
    }

    if (optionId === selectedOption) {
      return [styles.quizOption, styles.quizOptionWrong];
    }

    return [styles.quizOption, styles.quizOptionMuted];
  };

  const renderQuizPanel = () => (
    <View style={styles.quizPanel}>
      <View style={styles.quizHeader}>
        <View>
          <Text style={styles.panelEyebrow}>Treino rápido</Text>
          <Text style={styles.quizTitle}>Quiz da Aventura</Text>
        </View>
        <Text style={styles.quizBadge}>XP diário</Text>
      </View>
      <Text style={styles.quizSubtitle}>
        Uma pergunta curta para reforçar seu perfil sem usar IA no fluxo.
      </Text>

      {!quiz ? (
        <TouchableOpacity
          style={styles.quizButton}
          onPress={handleGenerateQuiz}
          disabled={quizLoading}
        >
          <Text style={styles.quizButtonText}>
            {quizLoading ? "Preparando..." : "Gerar quiz"}
          </Text>
        </TouchableOpacity>
      ) : (
        <View>
          <Text style={styles.quizQuestion}>{quiz.question}</Text>
          {quiz.options.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={getQuizOptionStyle(option.id)}
              onPress={() => handleAnswerQuiz(option.id)}
              disabled={!!quizResult || quizSaving}
            >
              <Text style={styles.quizOptionText}>
                {option.id}. {option.text}
              </Text>
            </TouchableOpacity>
          ))}
          {quizSaving && !quizResult ? (
            <ActivityIndicator color="#7B1FA2" style={{ marginTop: 8 }} />
          ) : null}
          {quizResult && <Text style={styles.quizResult}>{quizResult}</Text>}
          {quizResult && (
            <TouchableOpacity
              style={[styles.quizButton, styles.quizSecondaryButton]}
              onPress={() => {
                setQuiz(null);
                setQuizResult(null);
                setSelectedOption(null);
              }}
            >
              <Text style={styles.quizButtonText}>Novo quiz</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );

  const renderStateShell = ({
    eyebrow,
    title,
    subtitle,
    infoText,
    actionLabel,
    onAction,
    children,
  }: {
    eyebrow: string;
    title: string;
    subtitle: string;
    infoText?: string;
    actionLabel?: string;
    onAction?: () => void;
    children?: React.ReactNode;
  }) => (
    <GestureHandlerRootView style={styles.container}>
      <ScrollView contentContainerStyle={styles.stateContent}>
        <View style={styles.heroPanel}>
          <Text style={styles.panelEyebrow}>{eyebrow}</Text>
          <Text style={styles.messageTitle}>{title}</Text>
          <Text style={styles.messageSubtitle}>{subtitle}</Text>

          {infoText ? (
            <View style={styles.adventureInfoBox}>
              <Text style={styles.adventureInfoText}>{infoText}</Text>
            </View>
          ) : null}

          {actionLabel && onAction ? (
            <TouchableOpacity
              style={styles.startButton}
              onPress={onAction}
              activeOpacity={0.86}
            >
              <Text style={styles.startButtonText}>{actionLabel}</Text>
            </TouchableOpacity>
          ) : null}

          {nextBatchAt ? (
            <View style={styles.countdownBox}>
              <Text style={styles.countdownLabel}>Janela do lote</Text>
              <BatchCountdown expiresAt={nextBatchAt} onExpired={() => {}} />
            </View>
          ) : null}
        </View>

        {children}
      </ScrollView>
    </GestureHandlerRootView>
  );

  // ── Telas ─────────────────────────────────────────────────────
  if (screenState === "loading") {
    return (
      <GestureHandlerRootView style={styles.container}>
        <View style={styles.loadingPanel}>
          <ActivityIndicator size="large" color="#2E7D32" />
          <Text style={styles.loadingText}>Carregando Aventura...</Text>
          <Text style={styles.loadingSubtext}>Preparando cartas, quiz e progresso.</Text>
        </View>
      </GestureHandlerRootView>
    );
  }

  if (screenState === "expired") {
    return renderStateShell({
      eyebrow: "Lote encerrado",
      title: "A janela desta Aventura acabou",
      subtitle: "Você pode iniciar um novo lote quando a rotina permitir. O app não transforma pulos ou atrasos em bloqueios duros.",
    });
  }

  if (screenState === "completed_today") {
    return renderStateShell({
      eyebrow: "Lote concluído",
      title: "Questões de hoje concluídas",
      subtitle: "Suas respostas foram registradas e já podem ajudar o app a entender melhor sua rotina.",
      infoText: "Você já respondeu as questões do dia. A prática extra continua disponível, mas o ciclo principal de hoje está completo.",
      actionLabel: "Praticar mais",
      onAction: handleRequestBatch,
      children: renderQuizPanel(),
    });
  }

  if (screenState === "no_batch") {
    return renderStateShell({
      eyebrow: "Aventura do dia",
      title: "Ajude o app a entender sua rotina",
      subtitle: `Responda ${BATCH_SIZE} questões simples de Sim/Não para nos ajudar a criar missões mais adaptadas para você.`,
      infoText: "Você também pode pular perguntas que não fizerem sentido. Pular não cria bloqueio automático no seu perfil.",
      actionLabel: "Começar",
      onAction: handleRequestBatch,
      children: renderQuizPanel(),
    });
  }

  // Batch ativo — swipe cards
  const totalCards = answeredCount + pendingFlashcards.length;
  const progress = totalCards > 0 ? answeredCount / totalCards : 0;

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.panelEyebrow}>Cartas em andamento</Text>
            <Text style={styles.headerTitle}>Aventura</Text>
          </View>
          {nextBatchAt && (
            <BatchCountdown expiresAt={nextBatchAt} onExpired={handleExpired} />
          )}
        </View>
        <ProgressBar progress={progress} />
        <View style={styles.progressSummary}>
          <Text style={styles.counter}>{answeredCount} de {totalCards} respondidas</Text>
          <Text style={styles.gestureHint}>Arraste: esquerda não, direita sim, cima pular</Text>
        </View>
      </View>

      <View style={styles.cardArea}>
        {pendingFlashcards.length > 0 && (
          <SwipeFlashcard
            key={`${pendingFlashcards[0].answerId}-${flashcardRenderKey}`}
            question={pendingFlashcards[0].question}
            category={pendingFlashcards[0].category}
            signalType={pendingFlashcards[0].signalType}
            onSwipe={handleSwipe}
          />
        )}
        {flashcardError ? (
          <Text style={styles.cardErrorText}>{flashcardError}</Text>
        ) : null}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F8" },
  stateContent: {
    flexGrow: 1,
    paddingTop: 72,
    paddingHorizontal: 20,
    paddingBottom: 34,
    justifyContent: "center",
  },
  heroPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E0E7E3",
    shadowColor: "#1B5E20",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  loadingPanel: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  header: {
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E3ECE6",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    gap: 14,
  },
  panelEyebrow: {
    color: "#2E7D32",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  headerTitle: { fontSize: 24, fontWeight: "bold", color: "#263238", marginTop: 3 },
  progressSummary: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  counter: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#2E7D32",
  },
  gestureHint: {
    flex: 1,
    color: "#78909C",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "right",
  },
  cardArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 38,
    paddingHorizontal: 20,
  },
  cardErrorText: {
    color: "#B00020",
    fontSize: 13,
    marginTop: 16,
    maxWidth: 360,
    textAlign: "center",
  },
  messageTitle: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#263238",
    lineHeight: 32,
    marginTop: 8,
    marginBottom: 8,
  },
  messageSubtitle: {
    fontSize: 14,
    color: "#546E7A",
    lineHeight: 22,
  },
  loadingText: { marginTop: 16, fontSize: 17, color: "#263238", fontWeight: "800" },
  loadingSubtext: { marginTop: 6, color: "#78909C", fontWeight: "600" },
  adventureInfoBox: {
    backgroundColor: "#F1F8E9",
    borderRadius: 14,
    padding: 13,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#D7E9CC",
  },
  adventureInfoText: { color: "#315C39", fontSize: 13, fontWeight: "700", lineHeight: 19 },
  countdownBox: { alignItems: "center", gap: 8, marginTop: 18 },
  countdownLabel: { fontSize: 12, color: "#607D8B", fontWeight: "700" },
  startButton: {
    backgroundColor: "#2E7D32",
    paddingVertical: 15,
    paddingHorizontal: 28,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 20,
    shadowColor: "#1B5E20",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  startButtonText: { color: "#FFF", fontSize: 16, fontWeight: "bold" },
  quizPanel: {
    width: "100%",
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 18,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#E5E0EC",
  },
  quizHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  quizTitle: { fontSize: 18, fontWeight: "bold", color: "#1B5E20" },
  quizBadge: {
    backgroundColor: "#F3E5F5",
    color: "#6A1B9A",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: "800",
  },
  quizSubtitle: { color: "#607D8B", marginTop: 8, marginBottom: 14, lineHeight: 19 },
  quizButton: {
    backgroundColor: "#6A1B9A",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  quizSecondaryButton: { marginTop: 12, backgroundColor: "#2E7D32" },
  quizButtonText: { color: "#FFF", fontWeight: "bold" },
  quizQuestion: {
    color: "#263238",
    fontSize: 16,
    fontWeight: "bold",
    lineHeight: 22,
    marginBottom: 12,
  },
  quizOption: {
    backgroundColor: "#FAF7FC",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5D6EA",
  },
  quizOptionCorrect: { backgroundColor: "#C8E6C9", borderWidth: 2, borderColor: "#2E7D32" },
  quizOptionWrong: { backgroundColor: "#FFCDD2", borderWidth: 2, borderColor: "#C62828" },
  quizOptionMuted: { opacity: 0.55 },
  quizOptionText: { color: "#4A148C", fontWeight: "600" },
  quizResult: { color: "#2E7D32", lineHeight: 20, marginTop: 8, fontWeight: "600" },
});
