export const ONBOARDING_SCHEMA_VERSION = 2;
export const ONBOARDING_ALGORITHM_VERSION = "deterministic_onboarding_v2";

export const ONBOARDING_CATEGORIES = [
  "water",
  "energy",
  "waste",
  "transport",
  "food",
  "consumption",
] as const;

export type OnboardingCategory = typeof ONBOARDING_CATEGORIES[number];

export type OnboardingFactType =
  | "constraint"
  | "hard_block"
  | "deficit"
  | "capability"
  | "preference"
  | "interest"
  | "habit"
  | "context"
  | "goal"
  | "risk";

export interface OnboardingOption {
  label: string;
  value: string;
}

export const ONBOARDING_QUESTION_IDS = [
  "housing",
  "utility_control",
  "kitchen_access",
  "reuse_storage_space",
  "main_mobility",
  "work_study_routine",
  "free_time",
  "financial_friction",
  "dietary_restrictions",
  "health_safety_limits",
  "change_readiness",
  "sustainability_experience",
  "personal_goal",
] as const;

export type OnboardingQuestionId = typeof ONBOARDING_QUESTION_IDS[number];

export interface OnboardingQuestion {
  id: OnboardingQuestionId;
  label: string;
  options: readonly OnboardingOption[];
}

export const ONBOARDING_QUESTIONS = [
  {
    id: "housing",
    label: "Como é sua moradia hoje?",
    options: [
      { label: "Divido casa, apê ou república", value: "shared_home" },
      { label: "Apartamento", value: "apartment" },
      { label: "Casa", value: "house" },
      { label: "Moro com família ou responsáveis", value: "family_home" },
    ],
  },
  {
    id: "utility_control",
    label: "Quanto controle você tem sobre água e luz?",
    options: [
      { label: "Tenho controle direto", value: "full" },
      { label: "Divido decisões ou contas", value: "partial" },
      { label: "Tenho pouco controle", value: "limited" },
    ],
  },
  {
    id: "kitchen_access",
    label: "Como é seu acesso a cozinha?",
    options: [
      { label: "Uso quase todos os dias", value: "daily" },
      { label: "Tenho acesso compartilhado ou limitado", value: "shared_limited" },
      { label: "Quase não tenho acesso", value: "rare" },
    ],
  },
  {
    id: "reuse_storage_space",
    label: "Você tem espaço para guardar ou reutilizar coisas?",
    options: [
      { label: "Quase nenhum espaço", value: "none" },
      { label: "Um cantinho ou gaveta", value: "small" },
      { label: "Espaço razoável", value: "moderate" },
    ],
  },
  {
    id: "main_mobility",
    label: "Como você se desloca na maior parte dos dias?",
    options: [
      { label: "A pé ou bicicleta", value: "walking_bike" },
      { label: "Transporte público", value: "public_transport" },
      { label: "Carro ou moto", value: "car_motorcycle" },
      { label: "Misto, depende do dia", value: "mixed" },
      { label: "Quase não me desloco", value: "mostly_remote" },
    ],
  },
  {
    id: "work_study_routine",
    label: "Sua rotina de trabalho ou estudo costuma ser:",
    options: [
      { label: "Horários previsíveis", value: "fixed" },
      { label: "Horários variáveis", value: "variable" },
      { label: "Intensa e pouco flexível", value: "intense" },
      { label: "Mais concentrada em casa", value: "mostly_home" },
    ],
  },
  {
    id: "free_time",
    label: "Quanto tempo livre real cabe num dia comum?",
    options: [
      { label: "Até 5 minutos", value: "micro" },
      { label: "10 a 15 minutos", value: "short" },
      { label: "20 a 30 minutos", value: "medium" },
      { label: "Mais de 30 minutos", value: "long" },
    ],
  },
  {
    id: "financial_friction",
    label: "Como devemos tratar gastos nas missões?",
    options: [
      { label: "Evitar gastos", value: "high" },
      { label: "Pequenos gastos se fizer sentido", value: "medium" },
      { label: "Tenho alguma folga para investir", value: "low" },
    ],
  },
  {
    id: "dietary_restrictions",
    label: "Existe alguma restrição alimentar ampla?",
    options: [
      { label: "Sem restrição relevante", value: "none" },
      { label: "Vegetariana ou vegetariano", value: "vegetarian" },
      { label: "Vegana ou vegano", value: "vegan" },
      { label: "Por saúde, religião ou cultura", value: "broad_restriction" },
      { label: "Prefiro não detalhar", value: "prefer_not_to_detail" },
    ],
  },
  {
    id: "health_safety_limits",
    label: "Há algum cuidado amplo de saúde ou segurança?",
    options: [
      { label: "Nenhum cuidado especial agora", value: "none" },
      { label: "Evitar peso, esforço ou deslocamento intenso", value: "avoid_effort" },
      { label: "Evitar rua, calor, chuva ou local inseguro", value: "avoid_environment" },
      { label: "Tenho limitação de mobilidade, energia ou tempo", value: "limited_mobility_energy" },
      { label: "Prefiro só missões de baixo risco", value: "low_risk_only" },
    ],
  },
  {
    id: "change_readiness",
    label: "Que tamanho de mudança parece viável agora?",
    options: [
      { label: "Pequenas mudanças", value: "small" },
      { label: "Mudanças médias", value: "medium" },
      { label: "Mudanças grandes", value: "large" },
      { label: "Quero observar antes", value: "observe_first" },
    ],
  },
  {
    id: "sustainability_experience",
    label: "Qual sua experiência prévia com sustentabilidade?",
    options: [
      { label: "Estou começando", value: "starting" },
      { label: "Já faço algumas ações", value: "some_habits" },
      { label: "Já tenho uma rotina consistente", value: "consistent" },
      { label: "Já tentei e foi difícil manter", value: "frustrated" },
    ],
  },
  {
    id: "personal_goal",
    label: "Qual objetivo pessoal mais combina com você no app?",
    options: [
      { label: "Economizar dinheiro ou recursos", value: "save_resources" },
      { label: "Gerar menos lixo", value: "reduce_waste" },
      { label: "Aprender com calma", value: "learn_calmly" },
      { label: "Reduzir impacto climático", value: "climate_impact" },
      { label: "Construir uma rotina mais saudável", value: "healthier_routine" },
    ],
  },
] as const satisfies readonly OnboardingQuestion[];

export type OnboardingAnswers = Partial<Record<OnboardingQuestionId, string>>;

export interface OnboardingAnswerSummary {
  question_id: OnboardingQuestionId;
  question_label: string;
  answer_value: string;
  answer_label: string;
  index: number;
}

export interface DerivedOnboardingFact {
  fact_key: string;
  fact_type: OnboardingFactType;
  category: OnboardingCategory | null;
  value: Record<string, unknown>;
  confidence: number;
  source_question_id: OnboardingQuestionId;
}

export interface OnboardingValidationResult {
  valid: boolean;
  errors: string[];
}

type AffinityMap = Record<OnboardingCategory, number>;

const QUESTION_BY_ID = ONBOARDING_QUESTIONS.reduce(
  (acc, question) => {
    acc[question.id] = question;
    return acc;
  },
  {} as Record<OnboardingQuestionId, OnboardingQuestion>,
);

function optionFor(questionId: OnboardingQuestionId, value: string | undefined) {
  if (!value) return null;
  return QUESTION_BY_ID[questionId].options.find((option) => option.value === value) ?? null;
}

function labelFor(questionId: OnboardingQuestionId, value: string | undefined) {
  return optionFor(questionId, value)?.label ?? "Não informado";
}

function baseAffinityMap(): AffinityMap {
  return {
    water: 0,
    energy: 0,
    waste: 0,
    transport: 0,
    food: 0,
    consumption: 0,
  };
}

function addAffinity(affinities: AffinityMap, category: OnboardingCategory, amount: number) {
  affinities[category] = Math.max(-1, Math.min(1, affinities[category] + amount));
}

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function fact(
  answers: Required<OnboardingAnswers>,
  sourceQuestionId: OnboardingQuestionId,
  input: Omit<DerivedOnboardingFact, "source_question_id">,
): DerivedOnboardingFact {
  return {
    ...input,
    source_question_id: sourceQuestionId,
    value: {
      answer: answers[sourceQuestionId],
      label: labelFor(sourceQuestionId, answers[sourceQuestionId]),
      ...input.value,
    },
  };
}

function goalCategory(goal: string): OnboardingCategory {
  if (goal === "reduce_waste") return "waste";
  if (goal === "climate_impact") return "transport";
  if (goal === "healthier_routine") return "food";
  if (goal === "save_resources") return "energy";
  return "consumption";
}

export function normalizeOnboardingAnswers(input: Record<string, unknown>): OnboardingAnswers {
  const normalized: OnboardingAnswers = {};

  for (const question of ONBOARDING_QUESTIONS) {
    const raw = input[question.id];
    if (typeof raw !== "string") continue;
    if (!question.options.some((option) => option.value === raw)) continue;
    normalized[question.id] = raw;
  }

  return normalized;
}

export function validateOnboardingAnswers(answers: OnboardingAnswers): OnboardingValidationResult {
  const errors: string[] = [];

  for (const question of ONBOARDING_QUESTIONS) {
    const value = answers[question.id];
    if (!value) {
      errors.push(`missing:${question.id}`);
      continue;
    }

    if (!question.options.some((option) => option.value === value)) {
      errors.push(`invalid:${question.id}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function getOnboardingAnswerSummaries(
  answers: Required<OnboardingAnswers>,
): OnboardingAnswerSummary[] {
  return ONBOARDING_QUESTIONS.map((question, index) => ({
    question_id: question.id,
    question_label: question.label,
    answer_value: answers[question.id],
    answer_label: labelFor(question.id, answers[question.id]),
    index: index + 1,
  }));
}

export function deriveOnboardingFacts(answers: Required<OnboardingAnswers>): DerivedOnboardingFact[] {
  const utilityControl = answers.utility_control;
  const storage = answers.reuse_storage_space;
  const kitchen = answers.kitchen_access;
  const freeTime = answers.free_time;
  const finance = answers.financial_friction;
  const diet = answers.dietary_restrictions;
  const safety = answers.health_safety_limits;

  return [
    fact(answers, "housing", {
      fact_key: "onboarding.housing_type",
      fact_type: "context",
      category: "consumption",
      confidence: 0.95,
      value: {
        housing_scope: answers.housing === "shared_home" || answers.housing === "family_home"
          ? "shared_decisions"
          : "mostly_direct_decisions",
      },
    }),
    fact(answers, "utility_control", {
      fact_key: "onboarding.water_control",
      fact_type: utilityControl === "limited" ? "constraint" : "capability",
      category: "water",
      confidence: 0.95,
      value: {
        control_level: utilityControl,
        mission_guidance: utilityControl === "limited"
          ? "avoid_actions_that_require_bill_or_fixture_control"
          : "can_receive_basic_water_saving_actions",
      },
    }),
    fact(answers, "utility_control", {
      fact_key: "onboarding.energy_control",
      fact_type: utilityControl === "limited" ? "constraint" : "capability",
      category: "energy",
      confidence: 0.95,
      value: {
        control_level: utilityControl,
        mission_guidance: utilityControl === "limited"
          ? "prefer_personal_device_or_behavior_actions"
          : "can_receive_basic_energy_saving_actions",
      },
    }),
    fact(answers, "kitchen_access", {
      fact_key: "onboarding.kitchen_access",
      fact_type: kitchen === "rare" ? "constraint" : "capability",
      category: "food",
      confidence: 0.95,
      value: {
        access_level: kitchen,
        mission_guidance: kitchen === "rare"
          ? "avoid_cooking_required_missions"
          : "food_missions_can_use_kitchen_context",
      },
    }),
    fact(answers, "reuse_storage_space", {
      fact_key: "onboarding.reuse_storage_space",
      fact_type: storage === "none" ? "constraint" : "capability",
      category: "waste",
      confidence: 0.92,
      value: {
        space_level: storage,
        mission_guidance: storage === "none"
          ? "avoid_storage_heavy_reuse_missions"
          : "small_reuse_or_separation_actions_are_possible",
      },
    }),
    fact(answers, "main_mobility", {
      fact_key: "onboarding.primary_mobility",
      fact_type: answers.main_mobility === "mostly_remote" ? "context" : "habit",
      category: "transport",
      confidence: 0.93,
      value: {
        mobility_mode: answers.main_mobility,
      },
    }),
    fact(answers, "work_study_routine", {
      fact_key: "onboarding.work_study_routine",
      fact_type: "context",
      category: null,
      confidence: 0.9,
      value: {
        routine_pattern: answers.work_study_routine,
      },
    }),
    fact(answers, "free_time", {
      fact_key: "onboarding.free_time_window",
      fact_type: freeTime === "micro" ? "constraint" : "capability",
      category: null,
      confidence: 0.95,
      value: {
        time_window: freeTime,
        suggested_effort_minutes: freeTime === "micro"
          ? 5
          : freeTime === "short"
            ? 15
            : freeTime === "medium"
              ? 30
              : 45,
      },
    }),
    fact(answers, "financial_friction", {
      fact_key: "onboarding.financial_friction",
      fact_type: finance === "high" ? "constraint" : "context",
      category: "consumption",
      confidence: 0.95,
      value: {
        friction_level: finance,
        mission_guidance: finance === "high"
          ? "prefer_free_missions"
          : "low_cost_missions_allowed_when_relevant",
      },
    }),
    fact(answers, "dietary_restrictions", {
      fact_key: "onboarding.dietary_context",
      fact_type: diet === "none" ? "context" : "constraint",
      category: "food",
      confidence: diet === "prefer_not_to_detail" ? 0.75 : 0.92,
      value: {
        restriction_type: diet,
        mission_guidance: diet === "none"
          ? "standard_food_missions_allowed"
          : "avoid_assuming_specific_food_swaps",
      },
    }),
    fact(answers, "health_safety_limits", {
      fact_key: "onboarding.safety_boundary",
      fact_type: safety === "none" ? "context" : "risk",
      category: null,
      confidence: safety === "none" ? 0.85 : 0.95,
      value: {
        safety_boundary: safety,
        mission_guidance: safety === "none"
          ? "standard_low_risk_missions_allowed"
          : "prefer_low_risk_low_effort_missions",
      },
    }),
    fact(answers, "change_readiness", {
      fact_key: "onboarding.change_readiness",
      fact_type: "preference",
      category: null,
      confidence: 0.95,
      value: {
        readiness_level: answers.change_readiness,
      },
    }),
    fact(answers, "sustainability_experience", {
      fact_key: "onboarding.sustainability_experience",
      fact_type: answers.sustainability_experience === "some_habits" ||
        answers.sustainability_experience === "consistent"
        ? "habit"
        : "context",
      category: null,
      confidence: 0.9,
      value: {
        experience_level: answers.sustainability_experience,
      },
    }),
    fact(answers, "personal_goal", {
      fact_key: "onboarding.personal_goal",
      fact_type: "goal",
      category: goalCategory(answers.personal_goal),
      confidence: 0.95,
      value: {
        goal: answers.personal_goal,
      },
    }),
  ];
}

export function buildOnboardingSocioeconomicContext(
  answers: Required<OnboardingAnswers>,
  generatedAt: string,
) {
  return {
    schema_version: ONBOARDING_SCHEMA_VERSION,
    generated_by: ONBOARDING_ALGORITHM_VERSION,
    generated_at: generatedAt,
    constraints: {
      housing: answers.housing,
      mobility: answers.main_mobility,
      diet: answers.dietary_restrictions,
      utility_control: answers.utility_control,
      kitchen_access: answers.kitchen_access,
      reuse_storage_space: answers.reuse_storage_space,
      health_safety_limits: answers.health_safety_limits,
    },
    financial_friction: answers.financial_friction,
    time_availability: answers.free_time,
    routine: {
      work_study: answers.work_study_routine,
      free_time: answers.free_time,
    },
    sustainability: {
      change_readiness: answers.change_readiness,
      experience: answers.sustainability_experience,
      personal_goal: answers.personal_goal,
    },
    labels: Object.fromEntries(
      getOnboardingAnswerSummaries(answers).map((summary) => [
        summary.question_id,
        summary.answer_label,
      ]),
    ),
  };
}

export function buildOnboardingAffinities(answers: Required<OnboardingAnswers>): AffinityMap {
  const affinities = baseAffinityMap();

  if (answers.utility_control === "full") {
    addAffinity(affinities, "water", 0.15);
    addAffinity(affinities, "energy", 0.15);
  } else if (answers.utility_control === "limited") {
    addAffinity(affinities, "water", -0.1);
    addAffinity(affinities, "energy", -0.1);
  }

  if (answers.kitchen_access === "daily") addAffinity(affinities, "food", 0.25);
  if (answers.kitchen_access === "rare") addAffinity(affinities, "food", -0.15);

  if (answers.reuse_storage_space === "moderate") {
    addAffinity(affinities, "waste", 0.2);
    addAffinity(affinities, "consumption", 0.15);
  } else if (answers.reuse_storage_space === "small") {
    addAffinity(affinities, "waste", 0.1);
  } else {
    addAffinity(affinities, "waste", -0.1);
  }

  if (answers.main_mobility === "walking_bike") addAffinity(affinities, "transport", 0.3);
  if (answers.main_mobility === "public_transport") addAffinity(affinities, "transport", 0.2);
  if (answers.main_mobility === "car_motorcycle") addAffinity(affinities, "transport", -0.1);
  if (answers.main_mobility === "mostly_remote") addAffinity(affinities, "transport", 0.1);

  if (answers.personal_goal === "save_resources") {
    addAffinity(affinities, "energy", 0.2);
    addAffinity(affinities, "water", 0.15);
    addAffinity(affinities, "consumption", 0.15);
  } else if (answers.personal_goal === "reduce_waste") {
    addAffinity(affinities, "waste", 0.3);
    addAffinity(affinities, "consumption", 0.1);
  } else if (answers.personal_goal === "climate_impact") {
    addAffinity(affinities, "transport", 0.2);
    addAffinity(affinities, "energy", 0.15);
  } else if (answers.personal_goal === "healthier_routine") {
    addAffinity(affinities, "food", 0.2);
    addAffinity(affinities, "water", 0.1);
  } else {
    for (const category of ONBOARDING_CATEGORIES) addAffinity(affinities, category, 0.05);
  }

  if (answers.change_readiness === "large") {
    for (const category of ONBOARDING_CATEGORIES) addAffinity(affinities, category, 0.12);
  } else if (answers.change_readiness === "medium") {
    for (const category of ONBOARDING_CATEGORIES) addAffinity(affinities, category, 0.06);
  } else if (answers.change_readiness === "observe_first") {
    for (const category of ONBOARDING_CATEGORIES) addAffinity(affinities, category, -0.05);
  }

  if (answers.sustainability_experience === "consistent") {
    for (const category of ONBOARDING_CATEGORIES) addAffinity(affinities, category, 0.08);
  } else if (answers.sustainability_experience === "some_habits") {
    for (const category of ONBOARDING_CATEGORIES) addAffinity(affinities, category, 0.04);
  } else if (answers.sustainability_experience === "frustrated") {
    for (const category of ONBOARDING_CATEGORIES) addAffinity(affinities, category, -0.04);
  }

  return affinities;
}

export function buildOnboardingLearnedPreferences(
  answers: Required<OnboardingAnswers>,
  generatedAt: string,
) {
  const interests: string[] = [
    `Objetivo pessoal: ${labelFor("personal_goal", answers.personal_goal)}`,
  ];
  const hardBlocks: string[] = [];
  const deficits: string[] = [];

  if (answers.main_mobility === "walking_bike") interests.push("Mobilidade ativa no dia a dia");
  if (answers.main_mobility === "public_transport") interests.push("Uso de transporte público");
  if (answers.main_mobility === "mostly_remote") interests.push("Rotina com poucos deslocamentos");
  if (answers.kitchen_access === "daily") interests.push("Acesso frequente à cozinha");
  if (answers.reuse_storage_space !== "none") interests.push("Alguma abertura para reutilização e organização");

  if (answers.sustainability_experience === "some_habits") {
    interests.push("Já pratica algumas ações sustentáveis");
  }
  if (answers.sustainability_experience === "consistent") {
    interests.push("Já mantém uma rotina sustentável consistente");
  }

  if (answers.utility_control === "limited") {
    hardBlocks.push("Evitar missões que dependam de controle direto da conta ou estrutura de água e luz");
  }
  if (answers.kitchen_access === "rare") hardBlocks.push("Evitar missões que exijam cozinhar");
  if (answers.reuse_storage_space === "none") hardBlocks.push("Evitar missões que precisem guardar muitos itens");
  if (answers.financial_friction === "high") hardBlocks.push("Priorizar missões sem gasto");
  if (answers.health_safety_limits !== "none") hardBlocks.push("Priorizar missões de baixo risco físico e logístico");
  if (answers.dietary_restrictions !== "none") hardBlocks.push("Respeitar restrições alimentares sem pedir detalhes sensíveis");

  if (answers.free_time === "micro") deficits.push("Precisa de missões de até 5 minutos");
  if (answers.work_study_routine === "intense") deficits.push("Rotina intensa pede ações simples e previsíveis");
  if (answers.sustainability_experience === "starting") deficits.push("Está começando e precisa de instruções curtas");
  if (answers.sustainability_experience === "frustrated") deficits.push("Já teve dificuldade de manter hábitos e precisa de baixa fricção");
  if (answers.change_readiness === "observe_first") deficits.push("Prefere observar antes de assumir mudanças maiores");

  return {
    schema_version: ONBOARDING_SCHEMA_VERSION,
    generated_by: ONBOARDING_ALGORITHM_VERSION,
    generated_at: generatedAt,
    interests: unique(interests),
    hard_blocks: unique(hardBlocks),
    deficits: unique(deficits),
    evolution_tags: unique([
      "onboarding_v2",
      `readiness_${answers.change_readiness}`,
      `experience_${answers.sustainability_experience}`,
      `goal_${answers.personal_goal}`,
      `time_${answers.free_time}`,
    ]),
    ai_justification:
      "Sem IA: perfil inicial derivado deterministicamente das respostas estruturadas do onboarding.",
    cache_metadata: {
      source: "onboarding",
      source_event_type: "ONBOARDING_ANSWERED",
      question_count: ONBOARDING_QUESTIONS.length,
      facts_algorithm: ONBOARDING_ALGORITHM_VERSION,
      affinities_algorithm: ONBOARDING_ALGORITHM_VERSION,
    },
  };
}
