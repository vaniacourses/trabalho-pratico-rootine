import React, { useCallback } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SWIPE_THRESHOLD = 120;

interface SwipeFlashcardProps {
  question: string;
  category?: string | null;
  signalType?: string | null;
  onSwipe: (answer: boolean | null) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  water: "Água",
  energy: "Energia",
  waste: "Resíduos",
  transport: "Transporte",
  food: "Alimentação",
  consumption: "Consumo",
};

const SIGNAL_LABELS: Record<string, string> = {
  habit: "Hábito",
  capability: "Capacidade",
  constraint: "Restrição",
  preference: "Preferência",
  interest: "Interesse",
};

export const SwipeFlashcard = ({
  question,
  category,
  signalType,
  onSwipe,
}: SwipeFlashcardProps) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const cardOpacity = useSharedValue(1);

  const handleSwipe = useCallback(
    (answer: boolean | null) => {
      onSwipe(answer);
    },
    [onSwipe],
  );

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      if (event.translationX > SWIPE_THRESHOLD) {
        // Swipe DIREITA → true (SIM)
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 300 });
        cardOpacity.value = withTiming(0, { duration: 300 }, () => {
          runOnJS(handleSwipe)(true);
        });
      } else if (event.translationX < -SWIPE_THRESHOLD) {
        // Swipe ESQUERDA → false (NÃO)
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 300 });
        cardOpacity.value = withTiming(0, { duration: 300 }, () => {
          runOnJS(handleSwipe)(false);
        });
      } else if (event.translationY < -SWIPE_THRESHOLD) {
        // Swipe CIMA → null (PULAR)
        translateY.value = withTiming(-600, { duration: 300 });
        cardOpacity.value = withTiming(0, { duration: 300 }, () => {
          runOnJS(handleSwipe)(null);
        });
      } else {
        // Volta ao centro (não passou do threshold)
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      {
        rotate: `${interpolate(translateX.value, [-SCREEN_WIDTH, 0, SCREEN_WIDTH], [-15, 0, 15])}deg`,
      },
    ],
    opacity: cardOpacity.value,
  }));

  // Overlay verde (SIM) — aparece ao arrastar para direita
  const yesOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], "clamp"),
  }));

  // Overlay vermelho (NÃO) — aparece ao arrastar para esquerda
  const noOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, -SWIPE_THRESHOLD], [0, 1], "clamp"),
  }));

  // Overlay cinza (PULAR) — aparece ao arrastar para cima
  const skipOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, -SWIPE_THRESHOLD], [0, 1], "clamp"),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        {/* Overlay SIM (Direita) */}
        <Animated.View style={[styles.overlay, styles.yesOverlay, yesOverlayStyle]}>
          <Text style={styles.overlayEmoji}>✅</Text>
          <Text style={[styles.overlayText, { color: "#2E7D32" }]}>SIM</Text>
        </Animated.View>

        {/* Overlay NÃO (Esquerda) */}
        <Animated.View style={[styles.overlay, styles.noOverlay, noOverlayStyle]}>
          <Text style={styles.overlayEmoji}>❌</Text>
          <Text style={[styles.overlayText, { color: "#C62828" }]}>NÃO</Text>
        </Animated.View>

        {/* Overlay PULAR (Cima) */}
        <Animated.View style={[styles.overlay, styles.skipOverlay, skipOverlayStyle]}>
          <Text style={styles.overlayEmoji}>⏭</Text>
          <Text style={[styles.overlayText, { color: "#616161" }]}>PULAR</Text>
        </Animated.View>

        <View style={styles.metaRow}>
          <Text style={styles.typeLabel}>
            {CATEGORY_LABELS[String(category ?? "")] ?? "Aventura"}
          </Text>
          {signalType ? (
            <Text style={styles.signalLabel}>
              {SIGNAL_LABELS[String(signalType)] ?? signalType}
            </Text>
          ) : null}
        </View>
        <Text style={styles.questionText}>{question}</Text>

        <View style={styles.hints}>
          <Text style={styles.hintText}>← NÃO</Text>
          <Text style={styles.hintText}>PULAR ↑</Text>
          <Text style={styles.hintText}>SIM →</Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  card: {
    width: SCREEN_WIDTH * 0.9,
    minHeight: 300,
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 32,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  yesOverlay: {
    backgroundColor: "rgba(200, 230, 201, 0.85)",
  },
  noOverlay: {
    backgroundColor: "rgba(255, 205, 210, 0.85)",
  },
  skipOverlay: {
    backgroundColor: "rgba(238, 238, 238, 0.85)",
  },
  overlayEmoji: {
    fontSize: 48,
  },
  overlayText: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 8,
    letterSpacing: 2,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#4CAF50",
    letterSpacing: 1.5,
  },
  signalLabel: {
    backgroundColor: "#E8F5E9",
    borderRadius: 8,
    color: "#2E7D32",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  questionText: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    lineHeight: 30,
    marginBottom: 24,
  },
  hints: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  hintText: {
    fontSize: 10,
    color: "#BDBDBD",
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});
