import { DiagnosticCard } from "@/components/DiagnosticCard";
import { ProgressBar } from "@/components/ProgressBar";
import {
  ONBOARDING_QUESTIONS,
  type OnboardingAnswers,
} from "@/lib/domain/onboarding";
import { supabase } from "@/lib/supabase";
import { invokeFunction } from "@/lib/rootineApi";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";

export default function DiagnosticScreen() {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleAnswer = async (value: string) => {
    if (isSubmitting) return;

    const q = ONBOARDING_QUESTIONS[currentStep];
    const updatedAnswers = { ...answers, [q.id]: value };
    setAnswers(updatedAnswers);

    if (currentStep < ONBOARDING_QUESTIONS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setIsSubmitting(true);
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw userError ?? new Error("Sessão não encontrada.");
        }

        console.log("[ONBOARDING] Finalizando onboarding.", {
          userId: user.id,
          answerCount: Object.keys(updatedAnswers).length,
        });

        const { data, error } = await invokeFunction(
          "complete-onboarding",
          {
            body: {
              userId: user.id,
              answers: updatedAnswers,
            },
          },
        );

        if (error) throw error;
        if (data?.error) throw new Error(String(data.error));

        console.log("[ONBOARDING] Onboarding concluído.", {
          userId: user.id,
          eventCount: data?.event_count,
          factCount: data?.fact_count,
        });

        router.replace("/(tabs)");
      } catch (error) {
        console.error("Erro ao salvar onboarding:", error);
        Alert.alert(
          "Não foi possível salvar agora",
          "Suas respostas continuam nesta tela. Tente finalizar novamente em instantes.",
        );
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (isSubmitting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Preparando seu habitat...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ProgressBar progress={(currentStep + 1) / ONBOARDING_QUESTIONS.length} />

      <View style={styles.content}>
        <DiagnosticCard
          question={ONBOARDING_QUESTIONS[currentStep]}
          onAnswer={handleAnswer}
        />
        <Text style={styles.counter}>
          {currentStep + 1} de {ONBOARDING_QUESTIONS.length}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F8", paddingTop: 60 },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 40,
  },
  counter: {
    marginTop: 24,
    fontSize: 12,
    fontWeight: "bold",
    color: "#999",
    letterSpacing: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F0F4F8",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
});
