import { DiagnosticCard } from "@/components/DiagnosticCard";
import { ProgressBar } from "@/components/ProgressBar";
import { supabase } from "@/lib/supabase";
import { useEcoStore } from "@/store/useEcoStore";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

// PERGUNTAS ATUALIZADAS (Removi menção obrigatória à faculdade)
const DIAGNOSTIC_QUESTIONS = [
  // SOCIO (RESTRIÇÕES)
  {
    id: "restricao_fisica",
    type: "socio",
    label: "Possui limitacao fisica para caminhadas?",
    options: ["sim", "nao"],
  },
  {
    id: "infra_bairro",
    type: "socio",
    label: "Existe coleta seletiva no seu bairro?",
    options: ["sim", "nao", "nao_sei"],
  },
  {
    id: "tipo_moradia",
    type: "socio",
    label: "Sua moradia atual e:",
    options: ["republica", "apartamento", "casa"],
  },
  {
    id: "clima_extremo",
    type: "socio",
    label: "O calor onde voce mora e muito intenso?",
    options: ["sim", "nao"],
  },
  // HABITOS
  {
    id: "banho_longo",
    type: "habit",
    label: "Banhos costumam passar de 10 minutos?",
    options: ["faco", "nao"],
  },
  {
    id: "carne_vermelha",
    type: "habit",
    label: "Consome carne quase todo dia?",
    options: ["faco", "nao"],
  },
  {
    id: "oleo_pia",
    type: "habit",
    label: "Descarta oleo de fritura na pia?",
    options: ["faco", "nao"],
  },
  {
    id: "sacola",
    type: "habit",
    label: "Usa sacolas descartaveis no mercado?",
    options: ["faco", "nao"],
  },
  {
    id: "garrafa",
    type: "habit",
    label: "Compra garrafas de agua na rua?",
    options: ["faco", "nao"],
  },
  {
    id: "eletronicos",
    type: "habit",
    label: "Deixa aparelhos em standby na tomada?",
    options: ["faco", "nao"],
  },
  {
    id: "luzes",
    type: "habit",
    label: "Esquece luzes acesas em locais vazios?",
    options: ["faco", "nao"],
  },
  {
    id: "maquina",
    type: "habit",
    label: "Lava pouca roupa por vez na maquina?",
    options: ["faco", "nao"],
  },
  {
    id: "copos",
    type: "habit",
    label: "Usa copos descartaveis fora de casa?",
    options: ["faco", "nao"],
  }, // AJUSTADO
  {
    id: "roupas",
    type: "habit",
    label: "Compra roupas novas sem necessidade?",
    options: ["faco", "nao"],
  },
];

export default function DiagnosticScreen() {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState({ socio: {}, habit: {} });
  const [isSubmitting, setIsSubmitting] = useState(false); // Estado de Loading
  const router = useRouter();
  const generateMissions = useEcoStore((state) => state.generateMissions);

  const handleAnswer = async (answer: string) => {
    // Evita cliques múltiplos durante o salvamento
    if (isSubmitting) return;

    const q = DIAGNOSTIC_QUESTIONS[currentStep];
    const updatedData = {
      ...data,
      [q.type]: { ...data[q.type as keyof typeof data], [q.id]: answer },
    };

    setData(updatedData);

    if (currentStep < DIAGNOSTIC_QUESTIONS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // ÚLTIMA PERGUNTA: Dispara o salvamento
      setIsSubmitting(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          // 1. Atualiza o banco
          const { error } = await supabase
            .from("profiles")
            .update({
              socioeconomic_context: updatedData.socio,
              current_habits: updatedData.habit,
            })
            .eq("id", user.id);

          if (error) throw error;

          // 2. Chuta a árvore de missões
          await generateMissions(user.id);

          // 3. Força a ida pra aba Tabs diretamente e com força
          router.push("/(tabs)");
        }
      } catch (error) {
        console.error("Erro final do diagnóstico:", error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (isSubmitting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Sintetizando seu Habitat...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ProgressBar progress={(currentStep + 1) / DIAGNOSTIC_QUESTIONS.length} />

      <View style={styles.content}>
        <DiagnosticCard
          question={DIAGNOSTIC_QUESTIONS[currentStep] as any}
          onAnswer={handleAnswer}
        />
        <Text style={styles.counter}>
          {currentStep + 1} de {DIAGNOSTIC_QUESTIONS.length}
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
