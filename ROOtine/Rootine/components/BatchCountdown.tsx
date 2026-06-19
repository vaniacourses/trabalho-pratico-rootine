import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

interface BatchCountdownProps {
  expiresAt: string; // ISO string
  onExpired: () => void;
}

export const BatchCountdown = ({ expiresAt, onExpired }: BatchCountdownProps) => {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const target = new Date(expiresAt).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft("00:00:00");
        onExpired();
        return false;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`,
      );
      return true;
    };

    // Roda imediatamente para evitar "flash" de 00:00:00
    tick();

    const interval = setInterval(() => {
      const shouldContinue = tick();
      if (!shouldContinue) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  return (
    <View style={styles.badge}>
      <Text style={styles.icon}>⏱</Text>
      <Text style={styles.text}>{timeLeft}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF3E0",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
  },
  icon: {
    fontSize: 14,
  },
  text: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#E65100",
    fontVariant: ["tabular-nums"],
  },
});
