import { useEcoStore } from "@/store/useEcoStore";
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
  Path,
  Rect,
} from "react-native-svg";

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const COLORS = {
  bg: "#F0F4F8",
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

export default function TreeDisplay() {
  const progress = useSharedValue(0);
  const xp = useEcoStore((state: { xp: number }) => state.xp);

  // Normaliza o progresso: 0 XP = Semente | 50 XP = Árvore Adulta
  useEffect(() => {
    progress.value = withTiming(Math.min(xp / 50, 1), { duration: 1500 });
  }, [xp]);

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
        </Defs>

        {/* CENÁRIO DE FUNDO */}
        <G id="bg-trees">
          <Path
            stroke={COLORS.bgTreeTrunk}
            strokeWidth={20}
            strokeLinecap="round"
            fill="none"
            d="M 120 700 L 120 520"
          />
          <AnimatedCircle
            cx="120"
            cy="460"
            r="140"
            fill={COLORS.bgTreeLeaf}
            animatedProps={bgCanopyLeftProps}
          />

          <Path
            stroke={COLORS.bgTreeTrunk}
            strokeWidth={20}
            strokeLinecap="round"
            fill="none"
            d="M 680 700 L 680 480"
          />
          <AnimatedCircle
            cx="680"
            cy="400"
            r="160"
            fill={COLORS.bgTreeLeaf}
            animatedProps={bgCanopyRightProps}
          />
        </G>

        {/* CHÃO */}
        <Ellipse cx="400" cy="700" rx="350" ry="80" fill={COLORS.earthDead} />
        <AnimatedEllipse
          cx="400"
          cy="700"
          rx="350"
          ry="80"
          fill={COLORS.earthAlive}
          animatedProps={liveGroundProps}
        />

        {/* ÁRVORE PRINCIPAL */}
        <G clipPath="url(#ground-clip)">
          <AnimatedG animatedProps={risingTreeProps}>
            <Path
              fill={COLORS.trunk}
              d="M 350 700 Q 380 350 400 50 Q 420 350 450 700 Z"
            />

            {/* === GALHOS SUPERIORES === */}
            <AnimatedG animatedProps={topBranchProps}>
              <Path
                fill={COLORS.branch}
                d="M 395 250 Q 300 230 180 80 Q 300 180 403 200 Z"
              />
              <Path
                fill={COLORS.branch}
                d="M 405 150 Q 500 130 570 30 Q 500 100 400 100 Z"
              />

              {/* Folhas agora animam seus próprios tamanhos. Fim da dependência de transforms! */}
              <AnimatedEllipse
                cx="180"
                cy="80"
                fill={COLORS.leaf}
                animatedProps={topLeaf1Props}
              />
              <AnimatedEllipse
                cx="570"
                cy="30"
                fill={COLORS.leafDark}
                animatedProps={topLeaf2Props}
              />
              <AnimatedEllipse
                cx="400"
                cy="50"
                fill={COLORS.leaf}
                animatedProps={topLeaf3Props}
              />

              <AnimatedCircle
                cx="190"
                cy="100"
                fill={COLORS.fruit}
                animatedProps={topFruit1Props}
              />
              <AnimatedCircle
                cx="400"
                cy="90"
                fill={COLORS.fruit}
                animatedProps={topFruit2Props}
              />
            </AnimatedG>

            {/* === GALHOS INTERMEDIÁRIOS === */}
            <AnimatedG animatedProps={midBranchProps}>
              <Path
                fill={COLORS.branch}
                d="M 412 350 Q 550 380 670 180 Q 550 300 407 300 Z"
              />
              <Path
                fill={COLORS.branch}
                d="M 550 310 Q 620 330 700 230 Q 620 290 530 270 Z"
              />

              <AnimatedEllipse
                cx="670"
                cy="180"
                fill={COLORS.leaf}
                animatedProps={midLeaf1Props}
              />
              <AnimatedEllipse
                cx="700"
                cy="230"
                fill={COLORS.leafDark}
                animatedProps={midLeaf2Props}
              />

              <AnimatedCircle
                cx="650"
                cy="200"
                fill={COLORS.fruit}
                animatedProps={midFruitProps}
              />
            </AnimatedG>

            {/* === GALHOS INFERIORES === */}
            <AnimatedG animatedProps={lowBranchProps}>
              <Path
                fill={COLORS.branch}
                d="M 388 450 Q 280 470 120 320 Q 280 400 393 400 Z"
              />
              <Path
                fill={COLORS.branch}
                d="M 250 410 Q 200 350 80 250 Q 200 320 270 380 Z"
              />

              <AnimatedEllipse
                cx="120"
                cy="320"
                fill={COLORS.leaf}
                animatedProps={lowLeaf1Props}
              />
              <AnimatedEllipse
                cx="250"
                cy="410"
                fill={COLORS.leafDark}
                animatedProps={lowLeaf2Props}
              />
              <AnimatedEllipse
                cx="80"
                cy="250"
                fill={COLORS.leaf}
                animatedProps={lowLeaf3Props}
              />

              <AnimatedCircle
                cx="120"
                cy="340"
                fill={COLORS.fruit}
                animatedProps={lowFruitProps}
              />
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
