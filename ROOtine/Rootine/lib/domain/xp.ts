export const XP_LEVEL_THRESHOLDS = [
  { level: 0, xp: 0, milestone: "Semente" },
  { level: 1, xp: 10, milestone: "Broto" },
  { level: 2, xp: 45, milestone: "Folhas novas" },
  { level: 3, xp: 100, milestone: "Muda firme" },
  { level: 4, xp: 180, milestone: "Primeiros galhos" },
  { level: 5, xp: 300, milestone: "Arvore jovem" },
  { level: 6, xp: 470, milestone: "Copa aberta" },
  { level: 7, xp: 700, milestone: "Habitat vivo" },
  { level: 8, xp: 1000, milestone: "Florescimento" },
  { level: 9, xp: 1400, milestone: "Frutos" },
  { level: 10, xp: 1900, milestone: "Ecossistema maduro" },
  { level: 11, xp: 2500, milestone: "Bosque" },
  { level: 12, xp: 3200, milestone: "Referencia sustentavel" },
] as const;

export const MISSION_XP_REWARDS: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 10,
  2: 16,
  3: 25,
  4: 40,
  5: 60,
};

export interface LevelProgress {
  xp: number;
  level: number;
  xpMin: number;
  xpNext: number;
  progress: number;
  milestone: string;
}

export function getXpMinimumForLevel(level: number) {
  const normalizedLevel = Math.max(0, Math.floor(level));
  const known = XP_LEVEL_THRESHOLDS.find((entry) => entry.level === normalizedLevel);
  if (known) return known.xp;

  let xp = XP_LEVEL_THRESHOLDS[XP_LEVEL_THRESHOLDS.length - 1].xp;
  for (let currentLevel = 12; currentLevel < normalizedLevel; currentLevel += 1) {
    xp += Math.round(700 + (currentLevel - 12) * 180);
  }
  return xp;
}

export function getLevelFromXp(rawXp: number): LevelProgress {
  const xp = Math.max(0, Math.floor(Number.isFinite(rawXp) ? rawXp : 0));
  let level = 0;

  while (getXpMinimumForLevel(level + 1) <= xp) {
    level += 1;
  }

  const xpMin = getXpMinimumForLevel(level);
  const xpNext = getXpMinimumForLevel(level + 1);
  const range = Math.max(1, xpNext - xpMin);
  const progress = Math.min(1, Math.max(0, (xp - xpMin) / range));
  const known = XP_LEVEL_THRESHOLDS.find((entry) => entry.level === level);

  return {
    xp,
    level,
    xpMin,
    xpNext,
    progress,
    milestone: known?.milestone ?? `Nivel ${level}`,
  };
}

export function getMissionXpReward(difficulty: unknown) {
  const normalizedDifficulty = Number(difficulty);
  if (![1, 2, 3, 4, 5].includes(normalizedDifficulty)) {
    return 0;
  }

  return MISSION_XP_REWARDS[normalizedDifficulty as 1 | 2 | 3 | 4 | 5];
}
