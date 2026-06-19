import { getLevelFromXp } from "@/lib/domain/xp";
import { supabase } from "@/lib/supabase";
import { invokeFunction } from "@/lib/rootineApi";
import { useEcoStore } from "@/store/useEcoStore";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type ProfileTab = "stats" | "achievements" | "history" | "facts" | "scientist";

type AchievementView = {
  key: string;
  title: string;
  description: string;
  xpReward: number;
  grantedXp: number;
  unlocked: boolean;
  unlockedAt: string | null;
  sortOrder: number;
};

type ImpactTotals = {
  co2_kg: number;
  water_l: number;
  waste_g: number;
  energy_kwh: number;
};

const EMPTY_IMPACT: ImpactTotals = {
  co2_kg: 0,
  water_l: 0,
  waste_g: 0,
  energy_kwh: 0,
};

const FACT_ACTION_LABEL: Record<string, string> = {
  FACT_HIDDEN: "Ocultar",
  FACT_TYPE_REPORTED: "Tipo incorreto",
  FACT_INTERPRETATION_REPORTED: "Interpretação incorreta",
};

const CATEGORY_LABELS: Record<string, string> = {
  water: "Água",
  energy: "Energia",
  waste: "Resíduos",
  transport: "Transporte",
  food: "Alimentação",
  consumption: "Consumo",
};

const FACT_TYPE_LABELS: Record<string, string> = {
  habit: "Hábito observado",
  capability: "Algo que você consegue fazer",
  constraint: "Limitação a respeitar",
  preference: "Preferência",
  interest: "Interesse",
  deficit: "Ponto para aprender",
  context: "Contexto da rotina",
  goal: "Objetivo",
  risk: "Cuidado de segurança",
};

const FACT_ACTION_HELP = {
  FACT_HIDDEN: "Ocultar tira este fato da sua visualização. Ele continua registrado como histórico para auditoria.",
  FACT_TYPE_REPORTED: "Tipo incorreto avisa que o app classificou mal o fato, por exemplo chamou de hábito algo que era limitação.",
  FACT_INTERPRETATION_REPORTED: "Interpretação incorreta avisa que a frase não representa bem sua realidade.",
};

const IMPACT_METRICS = [
  { key: "water_l", label: "Água", unit: "L", color: "#1976D2" },
  { key: "co2_kg", label: "CO2", unit: "kg", color: "#455A64" },
  { key: "waste_g", label: "Resíduos", unit: "g", color: "#6D4C41" },
  { key: "energy_kwh", label: "Energia", unit: "kWh", color: "#F57F17" },
] as const;

function safeDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: unknown) {
  const date = safeDate(value);
  return date
    ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    : "sem data";
}

function startOfWeekMs() {
  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const diff = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - diff);
  return day.getTime();
}

function startOfMonthMs() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundImpact(totals: ImpactTotals): ImpactTotals {
  return {
    co2_kg: Number(totals.co2_kg.toFixed(3)),
    water_l: Number(totals.water_l.toFixed(1)),
    waste_g: Number(totals.waste_g.toFixed(1)),
    energy_kwh: Number(totals.energy_kwh.toFixed(3)),
  };
}

function addImpact(target: ImpactTotals, impact: any) {
  target.co2_kg += numberValue(impact?.co2_kg?.mid, 0);
  target.water_l += numberValue(impact?.water_l?.mid, 0);
  target.waste_g += numberValue(impact?.waste_g?.mid, 0);
  target.energy_kwh += numberValue(impact?.energy_kwh?.mid, 0);
}

function aggregateImpact(rows: any[]) {
  const week = { ...EMPTY_IMPACT };
  const month = { ...EMPTY_IMPACT };
  const total = { ...EMPTY_IMPACT };
  const weekStart = startOfWeekMs();
  const monthStart = startOfMonthMs();

  rows.forEach((row) => {
    const loggedAt = safeDate(row.logged_at)?.getTime() ?? 0;
    addImpact(total, row.impact);
    if (loggedAt >= monthStart) addImpact(month, row.impact);
    if (loggedAt >= weekStart) addImpact(week, row.impact);
  });

  return {
    week: roundImpact(week),
    month: roundImpact(month),
    total: roundImpact(total),
  };
}

function aggregateXp(rows: any[]) {
  const weekStart = startOfWeekMs();
  const monthStart = startOfMonthMs();
  return rows.reduce(
    (acc, row) => {
      const createdAt = safeDate(row.created_at)?.getTime() ?? 0;
      const xp = numberValue(row.xp_delta, 0);
      acc.total += xp;
      if (createdAt >= monthStart) acc.month += xp;
      if (createdAt >= weekStart) acc.week += xp;
      return acc;
    },
    { week: 0, month: 0, total: 0 },
  );
}

function dateKey(value: unknown) {
  const date = safeDate(value);
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function calculateStreak(days: Set<string>) {
  let streak = 0;
  const cursor = new Date();
  while (streak < 365) {
    const key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function factLabel(fact: any) {
  const value = fact?.value && typeof fact.value === "object" ? fact.value : {};
  return value.label || value.signal_key || value.summary || fact.fact_key;
}

function humanizeToken(value: unknown) {
  return String(value ?? "")
    .replace(/^trail\.mission\./, "")
    .replace(/^adventure\./, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function categoryLabel(category: unknown) {
  const key = String(category ?? "").trim();
  if (!key) return "Geral";
  return CATEGORY_LABELS[key] ?? humanizeToken(key);
}

function factTypeLabel(type: unknown) {
  return FACT_TYPE_LABELS[String(type ?? "")] ?? "Aprendizado";
}

function factConfidenceLabel(confidence: unknown) {
  const value = numberValue(confidence, 0);
  if (value >= 0.8) return "Alta certeza";
  if (value >= 0.55) return "Certeza média";
  return "Baixa certeza";
}

function factSentence(fact: any) {
  const value = fact?.value && typeof fact.value === "object" ? fact.value : {};
  const raw = factLabel(fact);
  const readable = raw && raw !== fact.fact_key ? humanizeToken(raw) : humanizeToken(fact.fact_key);
  const type = String(fact.fact_type ?? "");

  if (typeof value.summary === "string" && value.summary.trim()) return value.summary.trim();
  if (type === "habit") return `Você demonstrou este hábito: ${readable}.`;
  if (type === "capability") return `O app acredita que você consegue fazer algo relacionado a: ${readable}.`;
  if (type === "constraint") return `Há uma limitação que as missões devem respeitar: ${readable}.`;
  if (type === "preference") return `Você parece preferir algo relacionado a: ${readable}.`;
  if (type === "deficit") return `Este é um ponto em que o app pode propor aprendizado: ${readable}.`;
  if (type === "risk") return `Este é um cuidado de segurança identificado: ${readable}.`;
  return `Aprendizado observado: ${readable}.`;
}

function factSourceLabel(source: unknown) {
  const text = String(source ?? "");
  if (text.includes("brain")) return "Aventura, missões ou feedback";
  if (text.includes("onboarding")) return "Diagnóstico inicial";
  if (text.includes("mission_edit")) return "Edição de missão";
  return "Histórico do app";
}

function buildLocalScientistAnswer(message: string) {
  return `Modo local do Cientista: ainda não consegui alcançar a Edge Function.

Para "${message}", siga uma versão segura: escolha uma ação ambiental pequena, sem compra nova, teste por um dia e observe se tempo, acesso ou custo atrapalharam.

Resposta educativa. Não substitui orientação médica, legal, financeira ou profissional especializada.`;
}

export default function ProfileScreen() {
  const [profileData, setProfileData] = useState<any>(null);
  const [missions, setMissions] = useState<any[]>([]);
  const [quizHistory, setQuizHistory] = useState<any[]>([]);
  const [flashcardHistory, setFlashcardHistory] = useState<any[]>([]);
  const [achievementRows, setAchievementRows] = useState<AchievementView[]>([]);
  const [xpRows, setXpRows] = useState<any[]>([]);
  const [impactRows, setImpactRows] = useState<any[]>([]);
  const [facts, setFacts] = useState<any[]>([]);
  const [factEvents, setFactEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>("stats");
  const [scientistInput, setScientistInput] = useState("");
  const [scientistMessages, setScientistMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [scientistLoading, setScientistLoading] = useState(false);
  const [factActionLoading, setFactActionLoading] = useState<string | null>(null);
  const [factHelpVisible, setFactHelpVisible] = useState(false);
  const { xp, fetchProfile } = useEcoStore();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await fetchProfile(user.id);

      const [
        { data: profile },
        { data: missionRows },
        { data: flashcardRows },
        { data: quizRows },
        { data: achievementDefinitions },
        { data: userAchievements },
        { data: xpLedgerRows },
        { data: impactLedgerRows },
        { data: factRows },
        { data: eventRows },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase
          .from("user_missions")
          .select("id,title,status,created_at,completed_at,mission_type,category,difficulty,xp_reward,pattern_key,action_fingerprint")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(80),
        supabase
          .from("user_flashcards_answers")
          .select("id,answer,answered_at,flashcards(question,category,signal_key)")
          .eq("user_id", user.id)
          .order("answered_at", { ascending: false })
          .limit(40),
        supabase
          .from("user_quiz_answers")
          .select("id,selected_option,correct,answered_at,quiz_questions(question,category,signal_key)")
          .eq("user_id", user.id)
          .order("answered_at", { ascending: false })
          .limit(30),
        supabase
          .from("achievement_definitions")
          .select("key,title,description,xp_reward,sort_order")
          .order("sort_order", { ascending: true }),
        supabase
          .from("user_achievements")
          .select("achievement_key,unlocked_at,xp_ledger_id")
          .eq("user_id", user.id),
        supabase
          .from("xp_ledger")
          .select("id,source_type,source_id,reason,xp_delta,metadata,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(120),
        supabase
          .from("impact_ledger")
          .select("impact,source_type,mission_id,metadata,logged_at")
          .eq("user_id", user.id)
          .order("logged_at", { ascending: false })
          .limit(120),
        supabase
          .from("user_profile_facts")
          .select("id,fact_key,fact_type,category,value,confidence,source_event_ids,evidence_count,active,derived_by,last_seen_at")
          .eq("user_id", user.id)
          .eq("active", true)
          .order("last_seen_at", { ascending: false })
          .limit(80),
        supabase
          .from("user_profile_events")
          .select("id,event_type,source_table,source_id,payload,occurred_at")
          .eq("user_id", user.id)
          .order("occurred_at", { ascending: false })
          .limit(200),
      ]);

      const xpByLedgerId = new Map<string, any>(
        (xpLedgerRows || [])
          .filter((row: any) => typeof row.id === "string")
          .map((row: any): [string, any] => [row.id, row]),
      );
      const xpByAchievementKey = new Map<string, any>(
        (xpLedgerRows || [])
          .filter((row: any) => typeof row.metadata?.achievement_key === "string")
          .map((row: any): [string, any] => [row.metadata.achievement_key, row]),
      );
      const unlockedByKey = new Map<string, any>(
        (userAchievements || [])
          .filter((achievement: any) => typeof achievement.achievement_key === "string")
          .map((achievement: any): [string, any] => [achievement.achievement_key, achievement]),
      );
      const mergedAchievements = new Map<string, AchievementView>();

      (achievementDefinitions || []).forEach((definition: any) => {
        const unlocked = unlockedByKey.get(definition.key);
        const xpRow = unlocked?.xp_ledger_id
          ? xpByLedgerId.get(unlocked.xp_ledger_id)
          : xpByAchievementKey.get(definition.key);
        mergedAchievements.set(definition.key, {
          key: definition.key,
          title: definition.title,
          description: definition.description,
          xpReward: numberValue(definition.xp_reward, 0),
          grantedXp: numberValue(xpRow?.xp_delta, definition.xp_reward ?? 0),
          unlocked: Boolean(unlocked),
          unlockedAt: unlocked?.unlocked_at ?? null,
          sortOrder: numberValue(definition.sort_order, 9999),
        });
      });

      setProfileData(profile);
      setMissions(missionRows || []);
      setFlashcardHistory(flashcardRows || []);
      setQuizHistory(quizRows || []);
      setXpRows(xpLedgerRows || []);
      setImpactRows(impactLedgerRows || []);
      setFacts(factRows || []);
      setFactEvents(eventRows || []);
      setAchievementRows(
        [...mergedAchievements.values()].sort((left, right) =>
          left.sortOrder - right.sortOrder || left.title.localeCompare(right.title)
        ),
      );

      console.log("[PROFILE] Perfil carregado.", {
        userId: user.id,
        missions: missionRows?.length ?? 0,
        facts: factRows?.length ?? 0,
        xpRows: xpLedgerRows?.length ?? 0,
        impactRows: impactLedgerRows?.length ?? 0,
      });
    } finally {
      setLoading(false);
    }
  }, [fetchProfile]);

  const hiddenFactKeys = useMemo(() => {
    return new Set(
      factEvents
        .filter((event) => event.event_type === "FACT_HIDDEN")
        .map((event) => event.payload?.fact_key)
        .filter((key): key is string => typeof key === "string"),
    );
  }, [factEvents]);

  const visibleFacts = useMemo(
    () => facts.filter((fact) => !hiddenFactKeys.has(fact.fact_key)),
    [facts, hiddenFactKeys],
  );

  const impactPeriods = useMemo(() => aggregateImpact(impactRows), [impactRows]);
  const xpPeriods = useMemo(() => aggregateXp(xpRows), [xpRows]);
  const levelInfo = getLevelFromXp(xp || 0);

  const derivedStats = useMemo(() => {
    const completed = missions.filter((mission) => mission.status === "completed");
    const refused = missions.filter((mission) => mission.status === "refused");
    const failed = missions.filter((mission) => mission.status === "failed");
    const decided = completed.length + refused.length + failed.length;
    const categoryCounts = completed.reduce((acc: Record<string, number>, mission) => {
      const category = mission.category || "sem categoria";
      acc[category] = (acc[category] ?? 0) + 1;
      return acc;
    }, {});
    const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Ainda sem dados";
    const activeDays = new Set<string>();

    missions.forEach((mission) => {
      const key = dateKey(mission.completed_at || mission.created_at);
      if (key) activeDays.add(key);
    });
    flashcardHistory.forEach((answer) => {
      const key = dateKey(answer.answered_at);
      if (key) activeDays.add(key);
    });
    quizHistory.forEach((answer) => {
      const key = dateKey(answer.answered_at);
      if (key) activeDays.add(key);
    });

    return {
      completed: completed.length,
      refused: refused.length,
      failed: failed.length,
      completionRate: decided ? Math.round((completed.length / decided) * 100) : 0,
      topCategory,
      streakDays: calculateStreak(activeDays),
    };
  }, [flashcardHistory, missions, quizHistory]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleFactAction = async (fact: any, eventType: keyof typeof FACT_ACTION_LABEL) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || factActionLoading) return;

    setFactActionLoading(`${eventType}:${fact.fact_key}`);
    try {
      const { error } = await supabase.from("user_profile_events").insert({
        user_id: user.id,
        event_type: eventType,
        source: "profile",
        source_table: "user_profile_facts",
        source_id: fact.id,
        payload: {
          fact_key: fact.fact_key,
          previous_fact_type: fact.fact_type,
          category: fact.category,
          action_label: FACT_ACTION_LABEL[eventType],
        },
        metadata: {
          schema_version: 1,
          correction_mode: "event_only",
        },
      });

      if (error) throw error;
      console.log("[PROFILE] Evento de fato registrado.", {
        userId: user.id,
        eventType,
        factKey: fact.fact_key,
      });
      await load();
    } catch (error) {
      console.error("[PROFILE] Erro ao registrar evento de fato:", error);
    } finally {
      setFactActionLoading(null);
    }
  };

  const sendScientistMessage = async () => {
    const message = scientistInput.trim();
    if (!message || scientistLoading) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const nextMessages = [...scientistMessages, { role: "user" as const, content: message }];
    setScientistMessages(nextMessages);
    setScientistInput("");
    setScientistLoading(true);

    try {
      const { data, error } = await invokeFunction("profile-scientist-chat", {
        body: { userId: user.id, message },
      });
      if (error) throw error;

      const protocols = Array.isArray(data?.protocols)
        ? `\n\nProtocolos sugeridos:\n${data.protocols
            .map((protocol: any) => `- ${protocol.title}: ${(protocol.steps || []).join(" ")}`)
            .join("\n")}`
        : "";

      setScientistMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: `${data?.answer || "Não consegui responder agora."}${protocols}`,
        },
      ]);
    } catch (error: any) {
      console.error("[PROFILE] Erro no cientista:", error);
      const detail = error?.context?.status === 429
        ? "Limite de perguntas atingido nesta hora."
        : error instanceof Error
          ? error.message
          : String(error);
      setScientistMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: `${buildLocalScientistAnswer(message)}\n\nDetalhe técnico: ${detail}`,
        },
      ]);
    } finally {
      setScientistLoading(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#4CAF50" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarText}>🌱</Text>
      </View>

      <Text style={styles.userName}>
        {profileData?.nome || profileData?.name || "Protetor do Habitat"}
      </Text>
      <Text style={styles.userXp}>
        Nível {levelInfo.level} · {levelInfo.milestone}
      </Text>
      <Text style={styles.userProgress}>
        {xp || 0} XP · {Math.round(levelInfo.progress * 100)}% até o próximo marco
      </Text>

      <View style={styles.tabs}>
        {[
          ["stats", "Estatísticas"],
          ["achievements", "Conquistas"],
          ["history", "Histórico"],
          ["facts", "Fatos"],
          ["scientist", "Cientista"],
        ].map(([id, label]) => (
          <TouchableOpacity
            key={id}
            style={[styles.tabButton, activeTab === id && styles.tabButtonActive]}
            onPress={() => setActiveTab(id as ProfileTab)}
          >
            <Text style={[styles.tabText, activeTab === id && styles.tabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "stats" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Progresso auditável</Text>
          <View style={styles.statsGrid}>
            <StatCard label="XP semana" value={String(xpPeriods.week)} />
            <StatCard label="XP mês" value={String(xpPeriods.month)} />
            <StatCard label="Missões concluídas" value={String(derivedStats.completed)} />
            <StatCard label="Missões recusadas" value={String(derivedStats.refused)} />
            <StatCard label="Não consegui" value={String(derivedStats.failed)} />
            <StatCard label="Taxa de conclusão" value={`${derivedStats.completionRate}%`} />
            <StatCard label="Categoria foco" value={categoryLabel(derivedStats.topCategory)} />
            <StatCard label="Sequência" value={`${derivedStats.streakDays} dia(s)`} />
          </View>

          <Text style={styles.sectionSubtitle}>Impacto estimado</Text>
          <ImpactBlock title="Semana" totals={impactPeriods.week} />
          <ImpactBlock title="Mês" totals={impactPeriods.month} />
          <ImpactBlock title="Total" totals={impactPeriods.total} />
          <Text style={styles.formulaText}>
            Impacto estimado por modelos versionados em `impact_ledger`; use como intervalo aproximado, não medição exata.
          </Text>
        </View>
      )}

      {activeTab === "achievements" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Conquistas reais</Text>
          {achievementRows.map((achievement) => (
            <Achievement
              key={achievement.key}
              title={achievement.title}
              unlocked={achievement.unlocked}
              description={achievement.description}
              xp={achievement.unlocked ? achievement.grantedXp : achievement.xpReward}
              unlockedAt={achievement.unlockedAt}
            />
          ))}
          {achievementRows.length === 0 ? (
            <Text style={styles.emptyText}>As conquistas ainda não foram carregadas.</Text>
          ) : null}
        </View>
      )}

      {activeTab === "history" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Histórico recente</Text>
          {[...missions.slice(0, 16).map((mission) => ({
            key: `mission-${mission.id}`,
            title: mission.title,
            meta: `Missão • ${mission.status} • ${mission.category || "geral"} • ${formatDate(mission.completed_at || mission.created_at)}`,
          })),
          ...xpRows.slice(0, 12).map((row) => ({
            key: `xp-${row.id}`,
            title: `${row.xp_delta > 0 ? "+" : ""}${row.xp_delta} XP`,
            meta: `${row.source_type} • ${row.reason || "ledger"} • ${formatDate(row.created_at)}`,
          })),
          ...flashcardHistory.slice(0, 8).map((answer) => ({
            key: `flashcard-${answer.id}`,
            title: answer.flashcards?.question || "Flashcard respondido",
            meta: `Aventura • ${answer.answer === true ? "sim" : answer.answer === false ? "não" : "pulado"} • ${formatDate(answer.answered_at)}`,
          })),
          ...quizHistory.slice(0, 8).map((answer) => ({
            key: `quiz-${answer.id}`,
            title: answer.quiz_questions?.question || "Quiz respondido",
            meta: `Quiz • ${answer.correct ? "acerto" : "revisar"} • ${formatDate(answer.answered_at)}`,
          }))].map((item) => (
            <View key={item.key} style={styles.historyItem}>
              <Text style={styles.historyTitle}>{item.title}</Text>
              <Text style={styles.historyMeta}>{item.meta}</Text>
            </View>
          ))}
        </View>
      )}

      {activeTab === "facts" && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, styles.sectionHeaderRowTitle]}>
              Fatos aprendidos
            </Text>
            <TouchableOpacity
              style={styles.infoButton}
              onPress={() => setFactHelpVisible((visible) => !visible)}
            >
              <Text style={styles.infoButtonText}>i</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.formulaText}>
            Estes são aprendizados que o app usa para personalizar missões. Você pode corrigir qualquer item que não represente sua realidade.
          </Text>
          {factHelpVisible ? (
            <View style={styles.helpBox}>
              <Text style={styles.helpTitle}>Como revisar um fato</Text>
              <Text style={styles.helpText}>{FACT_ACTION_HELP.FACT_HIDDEN}</Text>
              <Text style={styles.helpText}>{FACT_ACTION_HELP.FACT_TYPE_REPORTED}</Text>
              <Text style={styles.helpText}>{FACT_ACTION_HELP.FACT_INTERPRETATION_REPORTED}</Text>
            </View>
          ) : null}
          {visibleFacts.map((fact) => (
            <View key={fact.fact_key} style={styles.factCard}>
              <View style={styles.factChipRow}>
                <View style={styles.factChip}>
                  <Text style={styles.factChipText}>{factTypeLabel(fact.fact_type)}</Text>
                </View>
                <View style={styles.factChip}>
                  <Text style={styles.factChipText}>{categoryLabel(fact.category)}</Text>
                </View>
                <Text style={styles.factConfidence}>{factConfidenceLabel(fact.confidence)}</Text>
              </View>
              <Text style={styles.factTitle}>{factSentence(fact)}</Text>
              <Text style={styles.factMeta}>
                Aprendido por: {factSourceLabel(fact.derived_by)} • Baseado em {fact.evidence_count || 1} sinal(is) • Atualizado em {formatDate(fact.last_seen_at)}
              </Text>
              <View style={styles.factActions}>
                {(["FACT_HIDDEN", "FACT_TYPE_REPORTED", "FACT_INTERPRETATION_REPORTED"] as const).map((eventType) => (
                  <TouchableOpacity
                    key={`${fact.fact_key}-${eventType}`}
                    style={styles.factButton}
                    onPress={() => handleFactAction(fact, eventType)}
                    disabled={Boolean(factActionLoading)}
                  >
                    <Text style={styles.factButtonText}>{FACT_ACTION_LABEL[eventType]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
          {visibleFacts.length === 0 ? (
            <Text style={styles.emptyText}>Ainda não há fatos ativos para exibir.</Text>
          ) : null}
        </View>
      )}

      {activeTab === "scientist" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Agente Cientista</Text>
          <Text style={styles.scientistIntro}>
            O Cientista lê apenas resumos e fatos permitidos. Ele não altera seu perfil diretamente.
          </Text>
          <View style={styles.chatBox}>
            {scientistMessages.length === 0 ? (
              <Text style={styles.emptyText}>
                Exemplo: Como posso reduzir desperdício de água com pouco tempo?
              </Text>
            ) : (
              scientistMessages.map((message, index) => (
                <View
                  key={`${message.role}-${index}`}
                  style={[
                    styles.messageBubble,
                    message.role === "user" ? styles.userBubble : styles.assistantBubble,
                  ]}
                >
                  <Text style={styles.messageText}>{message.content}</Text>
                </View>
              ))
            )}
          </View>
          <TextInput
            value={scientistInput}
            onChangeText={setScientistInput}
            placeholder="Converse com o cientista..."
            placeholderTextColor="#9E9E9E"
            style={styles.input}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, scientistLoading && styles.sendButtonDisabled]}
            onPress={sendScientistMessage}
            disabled={scientistLoading}
          >
            <Text style={styles.sendText}>
              {scientistLoading ? "Analisando..." : "Enviar"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ImpactBlock({ title, totals }: { title: string; totals: ImpactTotals }) {
  return (
    <View style={styles.impactBlock}>
      <Text style={styles.impactTitle}>{title}</Text>
      <View style={styles.impactGrid}>
        {IMPACT_METRICS.map((metric) => (
          <View key={metric.key} style={styles.impactMetricCard}>
            <View style={[styles.impactAccent, { backgroundColor: metric.color }]} />
            <Text style={styles.impactMetricLabel}>{metric.label}</Text>
            <Text style={styles.impactMetricValue}>
              {totals[metric.key]} <Text style={styles.impactMetricUnit}>{metric.unit}</Text>
            </Text>
            <Text style={styles.impactMetricHint}>estimado</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Achievement({
  title,
  description,
  unlocked,
  xp,
  unlockedAt,
}: {
  title: string;
  description: string;
  unlocked: boolean;
  xp: number;
  unlockedAt: string | null;
}) {
  const dateText = unlockedAt ? ` • ${formatDate(unlockedAt)}` : "";

  return (
    <View style={[styles.achievement, unlocked && styles.achievementUnlocked]}>
      <Text style={styles.achievementTitle}>{title}</Text>
      <Text style={styles.achievementDescription}>{description}</Text>
      <Text style={styles.achievementStatus}>
        {unlocked ? "Desbloqueada" : "A caminho"} • +{xp} XP{dateText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F8" },
  content: { alignItems: "center", paddingTop: 80, paddingHorizontal: 20, paddingBottom: 40 },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },
  avatarText: { fontSize: 50 },
  userName: { fontSize: 22, fontWeight: "bold", marginTop: 15, color: "#263238" },
  userXp: { fontSize: 14, color: "#2E7D32", fontWeight: "bold", marginTop: 4 },
  userProgress: { color: "#607D8B", marginTop: 3, fontWeight: "600" },
  tabs: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 24,
  },
  tabButton: {
    flexGrow: 1,
    backgroundColor: "#FFF",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: "center",
  },
  tabButtonActive: { backgroundColor: "#2E7D32" },
  tabText: { color: "#607D8B", fontWeight: "700", fontSize: 12 },
  tabTextActive: { color: "#FFF" },
  section: {
    width: "100%",
    marginTop: 30,
    backgroundColor: "#FFF",
    borderRadius: 15,
    padding: 20,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#1B5E20", marginBottom: 15 },
  sectionHeaderRowTitle: { marginBottom: 0 },
  infoButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },
  infoButtonText: { color: "#1B5E20", fontWeight: "bold", fontSize: 14 },
  sectionSubtitle: { color: "#1B5E20", fontWeight: "bold", marginTop: 18, marginBottom: 8 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { width: "47%", backgroundColor: "#F1F8E9", borderRadius: 12, padding: 14 },
  statValue: { fontSize: 20, fontWeight: "bold", color: "#1B5E20" },
  statLabel: { color: "#607D8B", marginTop: 4, fontWeight: "600", fontSize: 12 },
  formulaText: { color: "#78909C", marginTop: 8, marginBottom: 8, fontSize: 12, lineHeight: 18 },
  impactBlock: { borderTopWidth: 1, borderTopColor: "#ECEFF1", paddingTop: 9, marginTop: 9 },
  impactTitle: { color: "#263238", fontWeight: "bold", marginBottom: 10 },
  impactGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  impactMetricCard: {
    width: "47%",
    backgroundColor: "#FAFAFA",
    borderWidth: 1,
    borderColor: "#ECEFF1",
    borderRadius: 12,
    padding: 12,
    minHeight: 96,
    overflow: "hidden",
  },
  impactAccent: {
    width: 28,
    height: 4,
    borderRadius: 999,
    marginBottom: 9,
  },
  impactMetricLabel: { color: "#455A64", fontWeight: "800", fontSize: 12 },
  impactMetricValue: { color: "#263238", fontWeight: "bold", fontSize: 19, marginTop: 5 },
  impactMetricUnit: { color: "#607D8B", fontSize: 12, fontWeight: "700" },
  impactMetricHint: { color: "#90A4AE", fontSize: 11, marginTop: 3, fontWeight: "600" },
  achievement: {
    borderWidth: 1,
    borderColor: "#ECEFF1",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  achievementUnlocked: { borderColor: "#A5D6A7", backgroundColor: "#F1F8E9" },
  achievementTitle: { fontWeight: "bold", color: "#263238", fontSize: 15 },
  achievementDescription: { color: "#607D8B", marginTop: 4 },
  achievementStatus: { color: "#2E7D32", marginTop: 8, fontWeight: "bold" },
  historyItem: { borderBottomWidth: 1, borderBottomColor: "#ECEFF1", paddingVertical: 10 },
  historyTitle: { color: "#263238", fontWeight: "700" },
  historyMeta: { color: "#78909C", marginTop: 3, fontSize: 12 },
  factCard: {
    borderWidth: 1,
    borderColor: "#ECEFF1",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  helpBox: {
    backgroundColor: "#F1F8E9",
    borderWidth: 1,
    borderColor: "#C8E6C9",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  helpTitle: { color: "#1B5E20", fontWeight: "bold", marginBottom: 6 },
  helpText: { color: "#455A64", fontSize: 12, lineHeight: 18, marginTop: 4 },
  factChipRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  factChip: {
    backgroundColor: "#E8F5E9",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  factChipText: { color: "#1B5E20", fontSize: 11, fontWeight: "800" },
  factConfidence: { color: "#607D8B", fontSize: 11, fontWeight: "700" },
  factTitle: { color: "#263238", fontWeight: "bold", marginTop: 10, lineHeight: 20 },
  factMeta: { color: "#607D8B", marginTop: 6, lineHeight: 18, fontSize: 12 },
  factActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  factButton: { backgroundColor: "#ECEFF1", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  factButtonText: { color: "#455A64", fontWeight: "700", fontSize: 11 },
  emptyText: { color: "#78909C", lineHeight: 20 },
  scientistIntro: { color: "#607D8B", lineHeight: 20, marginBottom: 12 },
  chatBox: { backgroundColor: "#F5F5F5", borderRadius: 14, padding: 12, minHeight: 110, marginBottom: 12 },
  messageBubble: { padding: 10, borderRadius: 12, marginBottom: 8 },
  userBubble: { backgroundColor: "#E3F2FD", alignSelf: "flex-end" },
  assistantBubble: { backgroundColor: "#E8F5E9", alignSelf: "flex-start" },
  messageText: { color: "#263238", lineHeight: 20 },
  input: {
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    padding: 12,
    minHeight: 70,
    textAlignVertical: "top",
    color: "#263238",
  },
  sendButton: {
    backgroundColor: "#2E7D32",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 10,
  },
  sendButtonDisabled: { backgroundColor: "#A5D6A7" },
  sendText: { color: "#FFF", fontWeight: "bold" },
});
