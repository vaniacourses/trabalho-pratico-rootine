import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
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

export default function RootineTreeAnimation() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 15000, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, []);

  // --- 1. ÁRVORE CRESCE MAIS CEDO (Começa do 0 em vez do 0.1) ---
  const risingTreeProps = useAnimatedProps(() => {
    const y = interpolate(
      progress.value,
      [0, 0.6],
      [600, 0],
      Extrapolation.CLAMP,
    );
    return { transform: [{ translateY: y }] } as any;
  });

  const liveGroundProps = useAnimatedProps(
    () =>
      ({
        transform: [
          {
            scale: interpolate(
              progress.value,
              [0, 0.2],
              [0, 1],
              Extrapolation.CLAMP,
            ),
          },
        ],
      }) as any,
  );

  const bgCanopyProps = useAnimatedProps(
    () =>
      ({
        transform: [
          {
            scale: interpolate(
              progress.value,
              [0.15, 0.3],
              [0, 1],
              Extrapolation.CLAMP,
            ),
          },
        ],
      }) as any,
  );

  const topBranchProps = useAnimatedProps(
    () =>
      ({
        transform: [
          {
            scale: interpolate(
              progress.value,
              [0.25, 0.35],
              [0, 1],
              Extrapolation.CLAMP,
            ),
          },
        ],
      }) as any,
  );

  const topLeafProps = useAnimatedProps(
    () =>
      ({
        transform: [
          {
            scale: interpolate(
              progress.value,
              [0.35, 0.45],
              [0, 1],
              Extrapolation.CLAMP,
            ),
          },
        ],
      }) as any,
  );

  const midBranchProps = useAnimatedProps(
    () =>
      ({
        transform: [
          {
            scale: interpolate(
              progress.value,
              [0.45, 0.55],
              [0, 1],
              Extrapolation.CLAMP,
            ),
          },
        ],
      }) as any,
  );

  const midLeafProps = useAnimatedProps(
    () =>
      ({
        transform: [
          {
            scale: interpolate(
              progress.value,
              [0.55, 0.65],
              [0, 1],
              Extrapolation.CLAMP,
            ),
          },
        ],
      }) as any,
  );

  const lowBranchProps = useAnimatedProps(
    () =>
      ({
        transform: [
          {
            scale: interpolate(
              progress.value,
              [0.6, 0.7],
              [0, 1],
              Extrapolation.CLAMP,
            ),
          },
        ],
      }) as any,
  );

  const lowLeafProps = useAnimatedProps(
    () =>
      ({
        transform: [
          {
            scale: interpolate(
              progress.value,
              [0.7, 0.8],
              [0, 1],
              Extrapolation.CLAMP,
            ),
          },
        ],
      }) as any,
  );

  const fruitProps = useAnimatedProps(
    () =>
      ({
        transform: [
          {
            scale: interpolate(
              progress.value,
              [0.8, 0.95],
              [0, 1],
              Extrapolation.CLAMP,
            ),
          },
        ],
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
          <AnimatedG originX="120" originY="520" animatedProps={bgCanopyProps}>
            <Circle cx="120" cy="460" r="140" fill={COLORS.bgTreeLeaf} />
          </AnimatedG>

          <Path
            stroke={COLORS.bgTreeTrunk}
            strokeWidth={20}
            strokeLinecap="round"
            fill="none"
            d="M 680 700 L 680 480"
          />
          <AnimatedG originX="680" originY="480" animatedProps={bgCanopyProps}>
            <Circle cx="680" cy="400" r="160" fill={COLORS.bgTreeLeaf} />
          </AnimatedG>
        </G>

        {/* CHÃO */}
        <Ellipse cx="400" cy="700" rx="350" ry="80" fill={COLORS.earthDead} />
        <AnimatedG originX="400" originY="700" animatedProps={liveGroundProps}>
          <Ellipse
            cx="400"
            cy="700"
            rx="350"
            ry="80"
            fill={COLORS.earthAlive}
          />
        </AnimatedG>

        {/* ÁRVORE PRINCIPAL */}
        <G clipPath="url(#ground-clip)">
          <AnimatedG animatedProps={risingTreeProps}>
            <Path
              fill={COLORS.trunk}
              d="M 350 700 Q 380 350 400 50 Q 420 350 450 700 Z"
            />

            {/* === GALHOS SUPERIORES === */}
            <AnimatedG
              originX="403"
              originY="200"
              animatedProps={topBranchProps}
            >
              <Path
                fill={COLORS.branch}
                d="M 395 250 Q 300 230 180 80 Q 300 180 403 200 Z"
              />
              <Path
                fill={COLORS.branch}
                d="M 405 150 Q 500 130 570 30 Q 500 100 400 100 Z"
              />

              {/* 2. FOLHAS MAIORES (rx e ry aumentados em média ~30%) */}
              <AnimatedG
                originX="180"
                originY="80"
                animatedProps={topLeafProps}
              >
                <Ellipse cx="180" cy="80" rx="85" ry="60" fill={COLORS.leaf} />
              </AnimatedG>

              <AnimatedG
                originX="570"
                originY="30"
                animatedProps={topLeafProps}
              >
                <Ellipse
                  cx="570"
                  cy="30"
                  rx="80"
                  ry="55"
                  fill={COLORS.leafDark}
                />
              </AnimatedG>

              <AnimatedG
                originX="400"
                originY="50"
                animatedProps={topLeafProps}
              >
                <Ellipse cx="400" cy="50" rx="115" ry="80" fill={COLORS.leaf} />
              </AnimatedG>

              <AnimatedG originX="180" originY="80" animatedProps={fruitProps}>
                <Circle cx="190" cy="100" r="14" fill={COLORS.fruit} />
              </AnimatedG>

              <AnimatedG originX="400" originY="50" animatedProps={fruitProps}>
                <Circle cx="400" cy="90" r="20" fill={COLORS.fruit} />
              </AnimatedG>
            </AnimatedG>

            {/* === GALHOS INTERMEDIÁRIOS === */}
            <AnimatedG
              originX="407"
              originY="300"
              animatedProps={midBranchProps}
            >
              <Path
                fill={COLORS.branch}
                d="M 412 350 Q 550 380 670 180 Q 550 300 407 300 Z"
              />
              <Path
                fill={COLORS.branch}
                d="M 550 310 Q 620 330 700 230 Q 620 290 530 270 Z"
              />

              {/* 2. FOLHAS MAIORES */}
              <AnimatedG
                originX="670"
                originY="180"
                animatedProps={midLeafProps}
              >
                <Ellipse cx="670" cy="180" rx="95" ry="65" fill={COLORS.leaf} />
              </AnimatedG>

              <AnimatedG
                originX="700"
                originY="230"
                animatedProps={midLeafProps}
              >
                <Ellipse
                  cx="700"
                  cy="230"
                  rx="65"
                  ry="45"
                  fill={COLORS.leafDark}
                />
              </AnimatedG>

              <AnimatedG originX="670" originY="180" animatedProps={fruitProps}>
                <Circle cx="650" cy="200" r="18" fill={COLORS.fruit} />
              </AnimatedG>
            </AnimatedG>

            {/* === GALHOS INFERIORES === */}
            <AnimatedG
              originX="393"
              originY="400"
              animatedProps={lowBranchProps}
            >
              <Path
                fill={COLORS.branch}
                d="M 388 450 Q 280 470 120 320 Q 280 400 393 400 Z"
              />
              <Path
                fill={COLORS.branch}
                d="M 250 410 Q 200 350 80 250 Q 200 320 270 380 Z"
              />

              {/* 2. FOLHAS MAIORES */}
              <AnimatedG
                originX="120"
                originY="320"
                animatedProps={lowLeafProps}
              >
                <Ellipse cx="120" cy="320" rx="90" ry="60" fill={COLORS.leaf} />
              </AnimatedG>

              <AnimatedG
                originX="250"
                originY="410"
                animatedProps={lowLeafProps}
              >
                <Ellipse
                  cx="250"
                  cy="410"
                  rx="80"
                  ry="55"
                  fill={COLORS.leafDark}
                />
              </AnimatedG>

              <AnimatedG
                originX="80"
                originY="250"
                animatedProps={lowLeafProps}
              >
                <Ellipse cx="80" cy="250" rx="70" ry="45" fill={COLORS.leaf} />
              </AnimatedG>

              <AnimatedG originX="120" originY="320" animatedProps={fruitProps}>
                <Circle cx="120" cy="340" r="16" fill={COLORS.fruit} />
              </AnimatedG>
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
