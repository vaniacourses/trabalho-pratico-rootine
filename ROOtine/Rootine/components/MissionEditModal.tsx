import { supabase } from "@/lib/supabase";
import { useEcoStore } from "@/store/useEcoStore";
import React, { useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface MissionEditModalProps {
  missionId: string;
  visible: boolean;
  onClose: () => void;
}

export default function MissionEditModal({
  missionId,
  visible,
  onClose,
}: MissionEditModalProps) {
  const [input, setInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const { editMission, loading, lastError } = useEcoStore();

  const handleEdit = async () => {
    if (!input.trim()) return;
    setLocalError(null);
    setAttemptedSave(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLocalError("Entre novamente para editar a missão.");
      return;
    }

    const edited = await editMission(user.id, missionId, input);
    if (edited) {
      setInput("");
      setLocalError(null);
      setAttemptedSave(false);
      onClose();
    } else {
      setLocalError("A edição não foi salva. A missão original continua ativa.");
    }
  };

  const handleClose = () => {
    if (loading) return;
    setLocalError(null);
    setAttemptedSave(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>Adaptar missão</Text>
          <Text style={styles.subtitle}>
            Descreva o que não encaixa na sua rotina. A adaptação mantém o objetivo ambiental e respeita suas restrições.
          </Text>

          <TextInput
            style={styles.input}
            multiline
            placeholder="Ex: Não tenho tempo de manhã, prefiro fazer isso à noite..."
            placeholderTextColor="#999"
            value={input}
            onChangeText={setInput}
            editable={!loading}
          />

          {localError || (attemptedSave && lastError) ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{localError || lastError}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={loading}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitButton,
                (loading || !input.trim()) && styles.submitButtonDisabled,
              ]}
              onPress={handleEdit}
              disabled={loading || !input.trim()}
            >
              <Text style={styles.submitText}>
                {loading ? "Salvando..." : localError ? "Tentar novamente" : "Adaptar missão"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: 300,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#2E7D32",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#546E7A",
    marginBottom: 20,
    lineHeight: 20,
  },
  input: {
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    padding: 16,
    minHeight: 100,
    textAlignVertical: "top",
    fontSize: 16,
    color: "#333",
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: "#FFEBEE",
    borderLeftColor: "#C62828",
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  errorText: {
    color: "#B71C1C",
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#EEEEEE",
  },
  cancelText: {
    color: "#666",
    fontWeight: "bold",
    fontSize: 16,
  },
  submitButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#9C27B0",
  },
  submitButtonDisabled: {
    backgroundColor: "#CE93D8",
  },
  submitText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 16,
  },
});
