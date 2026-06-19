import { useEcoStore } from "@/store/useEcoStore";
import { getLevelFromXp } from "@/lib/domain/xp";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const COLORS = {
  bg: "transparent",
  trunk: "#5C4033",
  branch: "#6B4E31",
  leaf: "#4CAF50",
  leafDark: "#388E3C",
  fruit: "#F44336",
  earthDead: "#8D6E63",
  earthAlive: "#81C784",
  bgTreeTrunk: "#A1887F",
  bgTreeLeaf: "#66BB6A",
};

interface TreeDisplayProps {
  onLeafPress?: (index: number) => void;
  vitalityScore?: number;
  previewXp?: number;
}

export default function TreeDisplay({ onLeafPress, vitalityScore = 50, previewXp }: TreeDisplayProps) {
  const progress = useSharedValue(0);
  const xp = useEcoStore((state: { xp: number }) => state.xp);
  const displayXp = previewXp ?? xp;
  const levelProgress = getLevelFromXp(displayXp);
  const structuralProgress = levelProgress.level >= 12
    ? 1
    : Math.min(1, Math.max(0.02, (levelProgress.level + levelProgress.progress) / 12));
  const normalizedScore = Math.max(0, Math.min(100, vitalityScore));
  const mood = normalizedScore >= 70 ? "thriving" : normalizedScore >= 35 ? "growing" : "withered";
  const palette = TREE_PALETTES[mood];

  // XP define porte por nível; pontuação define beleza/saúde.
  useEffect(() => {
    progress.value = withTiming(structuralProgress, { duration: 1500 });
  }, [structuralProgress, progress]);

  // =========================================================================
  // INTERPOLAÇÕES NATIVAS PURAS
  // Não usamos arrays de "transform". Injetamos propriedades diretas do SVG.
  // =========================================================================

  // 1. CHÃO E TRONCO (Usando 'scale' e 'translateY' como props diretas)
  const risingTreeProps = useAnimatedProps(
    () =>
      ({
        translateY: interpolate(
          progress.value,
          [0, 0.6],
          [700, 0],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );

  const liveGroundProps = useAnimatedProps(
    () =>
      ({
        scale: interpolate(
          progress.value,
          [0, 0.2],
          [0.01, 1],
          Extrapolation.CLAMP,
        ),
        originX: 400,
        originY: 700,
      }) as any,
  );

  const bgCanopyLeftProps = useAnimatedProps(
    () =>
      ({
        scale: interpolate(
          progress.value,
          [0.15, 0.3],
          [0.01, 1],
          Extrapolation.CLAMP,
        ),
        originX: 120,
        originY: 520,
      }) as any,
  );

  const bgCanopyRightProps = useAnimatedProps(
    () =>
      ({
        scale: interpolate(
          progress.value,
          [0.15, 0.3],
          [0.01, 1],
          Extrapolation.CLAMP,
        ),
        originX: 680,
        originY: 480,
      }) as any,
  );

  // 2. GALHOS
  const topBranchProps = useAnimatedProps(
    () =>
      ({
        scale: interpolate(
          progress.value,
          [0.25, 0.35],
          [0.01, 1],
          Extrapolation.CLAMP,
        ),
        originX: 403,
        originY: 200,
      }) as any,
  );

  const midBranchProps = useAnimatedProps(
    () =>
      ({
        scale: interpolate(
          progress.value,
          [0.45, 0.55],
          [0.01, 1],
          Extrapolation.CLAMP,
        ),
        originX: 407,
        originY: 300,
      }) as any,
  );

  const lowBranchProps = useAnimatedProps(
    () =>
      ({
        scale: interpolate(
          progress.value,
          [0.6, 0.7],
          [0.01, 1],
          Extrapolation.CLAMP,
        ),
        originX: 393,
        originY: 400,
      }) as any,
  );

  // 3. FOLHAS (A Mágica: Animamos os raios 'rx' e 'ry' em vez de usar transforms!)
  const topLeaf1Props = useAnimatedProps(
    () =>
      ({
        rx: interpolate(
          progress.value,
          [0.35, 0.45],
          [0, 85],
          Extrapolation.CLAMP,
        ),
        ry: interpolate(
          progress.value,
          [0.35, 0.45],
          [0, 60],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );
  const topLeaf2Props = useAnimatedProps(
    () =>
      ({
        rx: interpolate(
          progress.value,
          [0.35, 0.45],
          [0, 80],
          Extrapolation.CLAMP,
        ),
        ry: interpolate(
          progress.value,
          [0.35, 0.45],
          [0, 55],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );
  const topLeaf3Props = useAnimatedProps(
    () =>
      ({
        rx: interpolate(
          progress.value,
          [0.35, 0.45],
          [0, 115],
          Extrapolation.CLAMP,
        ),
        ry: interpolate(
          progress.value,
          [0.35, 0.45],
          [0, 80],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );

  const midLeaf1Props = useAnimatedProps(
    () =>
      ({
        rx: interpolate(
          progress.value,
          [0.55, 0.65],
          [0, 95],
          Extrapolation.CLAMP,
        ),
        ry: interpolate(
          progress.value,
          [0.55, 0.65],
          [0, 65],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );
  const midLeaf2Props = useAnimatedProps(
    () =>
      ({
        rx: interpolate(
          progress.value,
          [0.55, 0.65],
          [0, 65],
          Extrapolation.CLAMP,
        ),
        ry: interpolate(
          progress.value,
          [0.55, 0.65],
          [0, 45],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );

  const lowLeaf1Props = useAnimatedProps(
    () =>
      ({
        rx: interpolate(
          progress.value,
          [0.7, 0.8],
          [0, 90],
          Extrapolation.CLAMP,
        ),
        ry: interpolate(
          progress.value,
          [0.7, 0.8],
          [0, 60],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );
  const lowLeaf2Props = useAnimatedProps(
    () =>
      ({
        rx: interpolate(
          progress.value,
          [0.7, 0.8],
          [0, 80],
          Extrapolation.CLAMP,
        ),
        ry: interpolate(
          progress.value,
          [0.7, 0.8],
          [0, 55],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );
  const lowLeaf3Props = useAnimatedProps(
    () =>
      ({
        rx: interpolate(
          progress.value,
          [0.7, 0.8],
          [0, 70],
          Extrapolation.CLAMP,
        ),
        ry: interpolate(
          progress.value,
          [0.7, 0.8],
          [0, 45],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );

  // 4. FRUTOS (Animamos o raio 'r' diretamente)
  const topFruit1Props = useAnimatedProps(
    () =>
      ({
        r: interpolate(
          progress.value,
          [0.8, 0.95],
          [0, 14],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );
  const topFruit2Props = useAnimatedProps(
    () =>
      ({
        r: interpolate(
          progress.value,
          [0.8, 0.95],
          [0, 20],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );
  const midFruitProps = useAnimatedProps(
    () =>
      ({
        r: interpolate(
          progress.value,
          [0.8, 0.95],
          [0, 18],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );
  const lowFruitProps = useAnimatedProps(
    () =>
      ({
        r: interpolate(
          progress.value,
          [0.8, 0.95],
          [0, 16],
          Extrapolation.CLAMP,
        ),
      }) as any,
  );

  return (
    <View style={styles.container}>
      <Svg
        viewBox="0 0 800 800"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
      >
        <Defs>
          <ClipPath id="ground-clip">
            <Rect x="0" y="0" width="800" height="700" />
          </ClipPath>
          <LinearGradient id="leaf-orb" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.orbLight} />
            <Stop offset="1" stopColor={palette.orbDark} />
          </LinearGradient>
        </Defs>

        {/* CENÁRIO DE FUNDO */}
        <G id="bg-trees">
          <Path
            stroke={palette.bgTreeTrunk}
            strokeWidth={20}
            strokeLinecap="round"
            fill="none"
            d="M 120 700 L 120 520"
          />
          <AnimatedCircle
            cx="120"
            cy="460"
            r="140"
            fill={palette.bgTreeLeaf}
            animatedProps={bgCanopyLeftProps}
          />

          <Path
            stroke={palette.bgTreeTrunk}
            strokeWidth={20}
            strokeLinecap="round"
            fill="none"
            d="M 680 700 L 680 480"
          />
          <AnimatedCircle
            cx="680"
            cy="400"
            r="160"
            fill={palette.bgTreeLeaf}
            animatedProps={bgCanopyRightProps}
          />
        </G>

        {/* CHÃO */}
        <Ellipse cx="400" cy="700" rx="350" ry="80" fill={palette.earthDead} />
        <AnimatedEllipse
          cx="400"
          cy="700"
          rx="350"
          ry="80"
          fill={palette.earthAlive}
          animatedProps={liveGroundProps}
        />

        {/* ÁRVORE PRINCIPAL */}
        <G clipPath="url(#ground-clip)">
          <AnimatedG animatedProps={risingTreeProps}>
            <Path
              fill={palette.trunk}
              d="M 350 700 Q 380 350 400 50 Q 420 350 450 700 Z"
            />

            {/* === GALHOS SUPERIORES === */}
            <AnimatedG animatedProps={topBranchProps}>
              <Path
                fill={palette.branch}
                d="M 395 250 Q 300 230 180 80 Q 300 180 403 200 Z"
              />
              <Path
                fill={palette.branch}
                d="M 405 150 Q 500 130 570 30 Q 500 100 400 100 Z"
              />

              {/* Folhas agora animam seus próprios tamanhos. Fim da dependência de transforms! */}
              <AnimatedEllipse
                cx="180"
                cy="80"
                fill={palette.leaf}
                animatedProps={topLeaf1Props}
              />
              <AnimatedEllipse
                cx="570"
                cy="30"
                fill={palette.leafDark}
                animatedProps={topLeaf2Props}
              />
              <AnimatedEllipse
                cx="400"
                cy="50"
                fill={palette.leaf}
                animatedProps={topLeaf3Props}
              />

              <AnimatedCircle
                cx="190"
                cy="100"
                fill={palette.fruit}
                animatedProps={topFruit1Props}
              />
              <AnimatedCircle
                cx="400"
                cy="90"
                fill={palette.fruit}
                animatedProps={topFruit2Props}
              />
              <G onPress={() => onLeafPress?.(0)}>
                <Circle cx="180" cy="80" r="34" fill={palette.orbGlow} opacity="0.32" />
                <Circle
                  cx="180"
                  cy="80"
                  r="22"
                  fill="url(#leaf-orb)"
                  stroke={palette.orbStroke}
                  strokeWidth="5"
                />
                <SvgText
                  x="180"
                  y="85"
                  fill="#FFFFFF"
                  fontSize="15"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  I
                </SvgText>
              </G>
              <G onPress={() => onLeafPress?.(1)}>
                <Circle cx="570" cy="30" r="34" fill={palette.orbGlow} opacity="0.32" />
                <Circle
                  cx="570"
                  cy="30"
                  r="22"
                  fill="url(#leaf-orb)"
                  stroke={palette.orbStroke}
                  strokeWidth="5"
                />
                <SvgText
                  x="570"
                  y="35"
                  fill="#FFFFFF"
                  fontSize="15"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  II
                </SvgText>
              </G>
            </AnimatedG>

            {/* === GALHOS INTERMEDIÁRIOS === */}
            <AnimatedG animatedProps={midBranchProps}>
              <Path
                fill={palette.branch}
                d="M 412 350 Q 550 380 670 180 Q 550 300 407 300 Z"
              />
              <Path
                fill={palette.branch}
                d="M 550 310 Q 620 330 700 230 Q 620 290 530 270 Z"
              />

              <AnimatedEllipse
                cx="670"
                cy="180"
                fill={palette.leaf}
                animatedProps={midLeaf1Props}
              />
              <AnimatedEllipse
                cx="700"
                cy="230"
                fill={palette.leafDark}
                animatedProps={midLeaf2Props}
              />

              <AnimatedCircle
                cx="650"
                cy="200"
                fill={palette.fruit}
                animatedProps={midFruitProps}
              />
              <G onPress={() => onLeafPress?.(2)}>
                <Circle cx="670" cy="180" r="36" fill={palette.orbGlow} opacity="0.32" />
                <Circle
                  cx="670"
                  cy="180"
                  r="23"
                  fill="url(#leaf-orb)"
                  stroke={palette.orbStroke}
                  strokeWidth="5"
                />
                <SvgText
                  x="670"
                  y="185"
                  fill="#FFFFFF"
                  fontSize="14"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  III
                </SvgText>
              </G>
            </AnimatedG>

            {/* === GALHOS INFERIORES === */}
            <AnimatedG animatedProps={lowBranchProps}>
              <Path
                fill={palette.branch}
                d="M 388 450 Q 280 470 120 320 Q 280 400 393 400 Z"
              />
              <Path
                fill={palette.branch}
                d="M 250 410 Q 200 350 80 250 Q 200 320 270 380 Z"
              />

              <AnimatedEllipse
                cx="120"
                cy="320"
                fill={palette.leaf}
                animatedProps={lowLeaf1Props}
              />
              <AnimatedEllipse
                cx="250"
                cy="410"
                fill={palette.leafDark}
                animatedProps={lowLeaf2Props}
              />
              <AnimatedEllipse
                cx="80"
                cy="250"
                fill={palette.leaf}
                animatedProps={lowLeaf3Props}
              />

              <AnimatedCircle
                cx="120"
                cy="340"
                fill={palette.fruit}
                animatedProps={lowFruitProps}
              />
              <G onPress={() => onLeafPress?.(3)}>
                <Circle cx="120" cy="320" r="36" fill={palette.orbGlow} opacity="0.32" />
                <Circle
                  cx="120"
                  cy="320"
                  r="23"
                  fill="url(#leaf-orb)"
                  stroke={palette.orbStroke}
                  strokeWidth="5"
                />
                <SvgText
                  x="120"
                  y="325"
                  fill="#FFFFFF"
                  fontSize="14"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  IV
                </SvgText>
              </G>
            </AnimatedG>
          </AnimatedG>
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});

const TREE_PALETTES = {
  withered: {
    trunk: "#4B342B",
    branch: "#5A4031",
    leaf: "#A1885F",
    leafDark: "#795548",
    fruit: "#8D3A2B",
    earthDead: "#5D4037",
    earthAlive: "#A1887F",
    bgTreeTrunk: "#8D6E63",
    bgTreeLeaf: "#BCAAA4",
    orbLight: "#D7CCC8",
    orbDark: "#8D6E63",
    orbStroke: "#FFF3E0",
    orbGlow: "#FFCC80",
  },
  growing: {
    trunk: "#5C4033",
    branch: "#6B4E31",
    leaf: "#4CAF50",
    leafDark: "#2E7D32",
    fruit: "#F4511E",
    earthDead: "#8D6E63",
    earthAlive: "#81C784",
    bgTreeTrunk: "#A1887F",
    bgTreeLeaf: "#66BB6A",
    orbLight: "#AED581",
    orbDark: "#43A047",
    orbStroke: "#E8F5E9",
    orbGlow: "#A5D6A7",
  },
  thriving: {
    trunk: "#4E342E",
    branch: "#6D4C41",
    leaf: "#00C853",
    leafDark: "#1B5E20",
    fruit: "#FFD54F",
    earthDead: "#6D4C41",
    earthAlive: "#69F0AE",
    bgTreeTrunk: "#8D6E63",
    bgTreeLeaf: "#00E676",
    orbLight: "#FFF59D",
    orbDark: "#00C853",
    orbStroke: "#FFFDE7",
    orbGlow: "#FFD54F",
  },
} as const;
