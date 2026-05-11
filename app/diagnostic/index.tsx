import { DiagnosticCard } from "@/components/DiagnosticCard";
import { ProgressBar } from "@/components/ProgressBar";
import { supabase } from "@/lib/supabase";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

// Perguntas de Onboarding — captura contexto socioeconômico (template profiles.socioeconomic_context)
const ONBOARDING_QUESTIONS = [
  {
    id: "housing",
    label: "Sua moradia atual é:",
    options: [
      { label: "República", value: "shared_housing" },
      { label: "Apartamento", value: "apartment" },
      { label: "Casa", value: "house" },
    ],
  },
  {
    id: "mobility",
    label: "Como você se locomove no dia a dia?",
    options: [
      { label: "Carro", value: "car" },
      { label: "Transporte Público", value: "public_transport" },
      { label: "Bicicleta", value: "bicycle" },
      { label: "A pé", value: "walking" },
    ],
  },
  {
    id: "diet",
    label: "Possui alguma restrição alimentar?",
    options: [
      { label: "Nenhuma", value: "none" },
      { label: "Vegetariano", value: "vegetarian" },
      { label: "Vegano", value: "vegan" },
    ],
  },
  {
    id: "financial_friction",
    label: "Como está sua disponibilidade financeira?",
    options: [
      { label: "Apertada", value: "high" },
      { label: "Moderada", value: "medium" },
      { label: "Confortável", value: "low" },
    ],
  },
  {
    id: "time_availability",
    label: "Quanto tempo livre você tem no dia?",
    options: [
      { label: "Pouco", value: "low" },
      { label: "Moderado", value: "medium" },
      { label: "Bastante", value: "high" },
    ],
  },
];

export default function DiagnosticScreen() {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
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
      // Última pergunta: montar JSON do template socioeconomic_context
      setIsSubmitting(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const socioContext = {
            constraints: {
              housing: updatedAnswers.housing,
              mobility: updatedAnswers.mobility,
              diet: updatedAnswers.diet,
            },
            financial_friction: updatedAnswers.financial_friction,
            time_availability: updatedAnswers.time_availability,
          };

          const { error } = await supabase
            .from("profiles")
            .update({
              socioeconomic_context: socioContext,
              onboarding_completed: true,
            })
            .eq("id", user.id);

          if (error) throw error;

          router.replace("/(tabs)");
        }
      } catch (error) {
        console.error("Erro ao salvar onboarding:", error);
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
