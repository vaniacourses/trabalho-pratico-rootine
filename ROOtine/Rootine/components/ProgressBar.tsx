import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

interface ProgressBarProps {
  progress: number; // 0 a 1
}

export const ProgressBar = ({ progress }: ProgressBarProps) => {
  const animatedStyle = useAnimatedStyle(() => ({
    width: withSpring(`${progress * 100}%`),
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.fill, animatedStyle]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 6,
    backgroundColor: "#E0E0E0",
    width: "100%",
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: "#4CAF50" },
});
