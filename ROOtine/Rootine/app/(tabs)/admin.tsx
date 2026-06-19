import { supabase } from "@/lib/supabase";
import { useFlashcardStore } from "@/store/useFlashcardStore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function AdminTab() {
  const [loading, setLoading] = useState(false);
  const fetchActiveBatch = useFlashcardStore((s) => s.fetchActiveBatch);

  const handleResetBatch = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // Pega o último batch do usuário
      const { data: batches } = await supabase
        .from("user_daily_flashcards")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (batches && batches.length > 0) {
        const batchId = batches[0].id;

        // 1. Reativa o batch
        await supabase
          .from("user_daily_flashcards")
          .update({ active: true, completed_at: null, amount: 0 })
          .eq("id", batchId);

        // 2. Apaga as respostas dadas
        await supabase
          .from("user_flashcards_answers")
          .update({ answer: null })
          .eq("daily_batch", batchId);

        // 3. Marca no perfil como não completado hoje
        await supabase
          .from("profiles")
          .update({ daily_flashcards_completed: false })
          .eq("id", user.id);

        // 4. Atualiza a store
        await fetchActiveBatch(user.id);

        Alert.alert("Sucesso", "Último lote reiniciado. Vá para a aba Flashcards.");
      } else {
        Alert.alert("Erro", "Nenhum lote encontrado.");
      }
    } catch (err: any) {
      Alert.alert("Erro", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClearContext = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      await supabase
        .from("profiles")
        .update({
          learned_preferences: { interests: [], hard_blocks: [], evolution_tags: [], deficits: [], ai_justification: "" },
          affinities: {},
        })
        .eq("id", user.id);

      Alert.alert("Sucesso", "Contexto (learned_preferences e affinities) apagado.");
    } catch (err: any) {
      Alert.alert("Erro", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🛠️ Admin de Desenvolvimento</Text>
      <Text style={styles.subtitle}>
        Ferramentas fáceis de apagar antes do deploy final.
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color="#FF5722" style={{ marginTop: 20 }} />
      ) : (
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={[styles.button, { backgroundColor: "#FF9800" }]} onPress={handleResetBatch}>
            <Text style={styles.buttonText}>🔄 Reiniciar Lote Atual</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, { backgroundColor: "#F44336" }]} onPress={handleClearContext}>
            <Text style={styles.buttonText}>🗑️ Apagar Contexto (Cérebro)</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#F0F4F8",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 40,
  },
  buttonContainer: {
    gap: 16,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
  },
});
