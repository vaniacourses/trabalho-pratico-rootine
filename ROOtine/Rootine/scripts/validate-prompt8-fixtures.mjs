const ISSUE_TYPES = new Set([
  "time",
  "cost",
  "access",
  "health",
  "safety",
  "preference",
  "already_doing",
  "too_easy",
  "too_hard",
  "unclear",
]);

const CONSTRAINT_STRENGTHS = new Set(["hard", "soft", "temporary"]);
const FACT_TYPES = new Set([
  "constraint",
  "deficit",
  "capability",
  "preference",
  "interest",
  "habit",
  "context",
  "goal",
  "risk",
]);
const CATEGORIES = new Set(["water", "energy", "waste", "transport", "food", "consumption"]);

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(value) {
  return normalizeText(value).replace(/[\s.-]+/g, "_");
}

function inferIssueType(feedbackText) {
  const text = normalizeText(feedbackText);
  if (/\b(remedio|medicamento|saude|dor|medico|tratamento)\b/.test(text)) return "health";
  if (/\b(perigoso|risco|inseguro|seguranca|chuva|calor|rua)\b/.test(text)) return "safety";
  if (/\b(nao tenho acesso|sem acesso|nao controlo|nao tenho controle|nao sei|sem habilidade|nao tenho habilidade|nao consigo usar|nao tenho carona|sem carona|carona indisponivel|nao tenho carona disponivel)\b/.test(text)) return "access";
  if (/\b(dinheiro|caro|custo|gasto|comprar|sem grana|apertado)\b/.test(text)) return "cost";
  if (/\b(prefiro|gostaria|melhor|nao gosto)\b/.test(text)) return "preference";
  if (/\b(tempo|demora|manha|noite|correria|ocupado|rapido|minutos)\b/.test(text)) return "time";
  if (/\b(ja faco|faco isso|habito meu)\b/.test(text)) return "already_doing";
  if (/\b(muito facil|facil demais|mais dificil|desafio maior)\b/.test(text)) return "too_easy";
  if (/\b(muito dificil|dificil demais|nao consigo|pesado|complicado)\b/.test(text)) return "too_hard";
  return "unclear";
}

function normalizeIssueType(value, fallbackText) {
  const normalized = normalizeToken(value);
  const aliases = {
    tempo: "time",
    dinheiro: "cost",
    custo: "cost",
    acesso: "access",
    saude: "health",
    remedio: "health",
    seguranca: "safety",
    preferencia: "preference",
    ja_faco: "already_doing",
    muito_facil: "too_easy",
    muito_dificil: "too_hard",
  };
  if (ISSUE_TYPES.has(normalized)) return normalized;
  return aliases[normalized] ?? inferIssueType(fallbackText);
}

function normalizeStrength(value, issueType) {
  const normalized = normalizeToken(value);
  const aliases = {
    permanente: "hard",
    forte: "hard",
    alto: "hard",
    medio: "soft",
    baixo: "soft",
    temporario: "temporary",
  };
  if (CONSTRAINT_STRENGTHS.has(normalized)) return normalized;
  if (aliases[normalized]) return aliases[normalized];
  if (issueType === "health" || issueType === "safety" || issueType === "access") return "hard";
  if (issueType === "time" || issueType === "cost" || issueType === "too_hard") return "soft";
  return "temporary";
}

function validateClassification(classification) {
  const errors = [];
  if (!classification || typeof classification !== "object" || Array.isArray(classification)) {
    return ["classification_required"];
  }
  if (!ISSUE_TYPES.has(classification.issue_type)) errors.push("issue_type_invalid");
  if (!CONSTRAINT_STRENGTHS.has(classification.constraint_strength)) errors.push("constraint_strength_invalid");
  if (!Array.isArray(classification.blocked_actions)) errors.push("blocked_actions_invalid");
  if (!Array.isArray(classification.allowed_adjustments)) errors.push("allowed_adjustments_invalid");
  if (!Array.isArray(classification.new_fact_candidates)) errors.push("new_fact_candidates_invalid");

  for (const fact of classification.new_fact_candidates ?? []) {
    if (!fact || typeof fact !== "object" || Array.isArray(fact)) {
      errors.push("fact_candidate_invalid");
      continue;
    }
    if (typeof fact.fact_key !== "string" || fact.fact_key.length < 6) errors.push("fact_key_invalid");
    if (!FACT_TYPES.has(fact.fact_type)) errors.push("fact_type_invalid");
    if (fact.category !== null && fact.category !== undefined && !CATEGORIES.has(fact.category)) {
      errors.push("fact_category_invalid");
    }
    if (!Number.isFinite(Number(fact.confidence))) errors.push("fact_confidence_invalid");
  }
  return [...new Set(errors)];
}

const fixtures = [
  { name: "banho_remedio", text: "Nao consigo tomar banhos rapidos porque preciso passar um remedio durante o banho", expectedIssue: "health" },
  { name: "sem_dinheiro", text: "Nao tenho dinheiro para comprar nada agora", expectedIssue: "cost" },
  { name: "sem_tempo", text: "Nao tenho tempo de manha, preciso de algo rapido", expectedIssue: "time" },
  { name: "sem_acesso", text: "Nao tenho acesso a esse local nem controle sobre a torneira", expectedIssue: "access" },
  { name: "ja_faco", text: "Ja faco isso todos os dias", expectedIssue: "already_doing" },
  { name: "muito_facil", text: "Isso esta muito facil, quero um desafio maior", expectedIssue: "too_easy" },
  { name: "muito_dificil", text: "Essa missao esta muito dificil e pesada para hoje", expectedIssue: "too_hard" },
  { name: "ambiguo", text: "Nao da", expectedIssue: "unclear" },
  { name: "seguranca_rua", text: "Nao quero fazer isso na rua porque parece inseguro", expectedIssue: "safety" },
  { name: "preferencia_noite", text: "Prefiro fazer isso a noite", expectedIssue: "preference" },
  { name: "nao_sei_bike", text: "Gostaria de realizar essa missao, mas nao sei andar de bike", ai: { issue_type: "preference", constraint_strength: "soft" }, expectedIssue: "access" },
  { name: "nao_tenho_carona", text: "Nao tenho carona disponivel", ai: { issue_type: "preference", constraint_strength: "soft" }, expectedIssue: "access" },
  { name: "ai_issue_portuguese", text: "qualquer", ai: { issue_type: "dinheiro", constraint_strength: "forte" }, expectedIssue: "cost" },
  { name: "ai_accent_fact_type", text: "misturo reciclaveis", ai: { issue_type: "preference", constraint_strength: "soft", new_fact_candidates: [{ fact_key: "feedback.waste.deficit", fact_type: "déficit", category: "waste", confidence: 0.7 }] }, expectedIssue: "preference", expectInvalid: true },
  { name: "ai_invalid_issue", text: "prefiro outra coisa", ai: { issue_type: "jardim", constraint_strength: "soft" }, expectedIssue: "preference" },
  { name: "ai_generic_unclear", text: "", ai: { issue_type: "unclear", constraint_strength: "temporary" }, expectedIssue: "unclear" },
  { name: "ai_sem_sustentabilidade", text: "compre mais potes novos", ai: { issue_type: "cost", constraint_strength: "soft" }, expectedIssue: "cost" },
];

let failures = 0;

for (const fixture of fixtures) {
  const inferredIssueType = inferIssueType(fixture.text);
  let issueType = normalizeIssueType(fixture.ai?.issue_type, fixture.text);
  if (
    ["health", "safety", "access", "cost"].includes(inferredIssueType) &&
    ["preference", "unclear", "too_hard"].includes(issueType)
  ) {
    issueType = inferredIssueType;
  }
  const classification = {
    issue_type: issueType,
    constraint_strength: normalizeStrength(fixture.ai?.constraint_strength, issueType),
    blocked_actions: [],
    allowed_adjustments: ["conservative_safe_edit"],
    new_fact_candidates: fixture.ai?.new_fact_candidates ?? [
      {
        fact_key: `feedback.fixture.${fixture.name}`,
        fact_type: issueType === "already_doing" ? "capability" : issueType === "safety" ? "risk" : "constraint",
        category: "waste",
        value: { fixture: fixture.name },
        confidence: 0.72,
      },
    ],
    raw_text_summary: fixture.text.slice(0, 220),
    confidence: 0.72,
  };
  const errors = validateClassification(classification);
  const issueOk = issueType === fixture.expectedIssue;
  const validityOk = fixture.expectInvalid ? errors.length > 0 : errors.length === 0;

  if (!issueOk || !validityOk) {
    failures += 1;
    console.error("[PROMPT8_FIXTURE_FAIL]", {
      name: fixture.name,
      issueType,
      expectedIssue: fixture.expectedIssue,
      errors,
    });
  }
}

if (fixtures.length < 15) {
  failures += 1;
  console.error("[PROMPT8_FIXTURE_FAIL]", { reason: "expected_at_least_15_fixtures", count: fixtures.length });
}

if (failures > 0) {
  process.exit(1);
}

console.log(`[PROMPT8_FIXTURES] ${fixtures.length} fixtures validados com sucesso.`);
