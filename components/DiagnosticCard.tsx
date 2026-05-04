import React from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInRight, FadeOutLeft } from "react-native-reanimated";

const { width } = Dimensions.get("window");

interface DiagnosticCardProps {
  question: {
    id: string;
    type: "socio" | "habit";
    label: string;
    options: string[];
  };
  onAnswer: (answer: string) => void;
}

export const DiagnosticCard = ({ question, onAnswer }: DiagnosticCardProps) => {
  return (
    <Animated.View
      entering={FadeInRight}
      exiting={FadeOutLeft}
      style={styles.card}
    >
      <Text style={styles.typeLabel}>
        {question.type === "socio" ? "ESTILO DE VIDA" : "HABITO ATUAL"}
      </Text>
      <Text style={styles.questionText}>{question.label}</Text>

      <View style={styles.optionsContainer}>
        {question.options.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={styles.optionButton}
            onPress={() => onAnswer(opt)}
          >
            <Text style={styles.optionText}>
              {opt.replace(/_/g, " ").toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: width * 0.9,
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 32,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#4CAF50",
    marginBottom: 8,
    letterSpacing: 1.5,
  },
  questionText: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 24,
    lineHeight: 28,
  },
  optionsContainer: { gap: 12 },
  optionButton: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#E9ECEF",
    alignItems: "center",
  },
  optionText: { fontSize: 14, fontWeight: "600", color: "#495057" },
});
