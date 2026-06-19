import { supabase } from "@/lib/supabase"; // Certifique-se de ter o client configurado
import { invokeFunction } from "@/lib/rootineApi";
import { create } from "zustand";

type ImpactTotals = {
  co2_kg: number;
  water_l: number;
  waste_g: number;
  energy_kwh: number;
};

type ProgressEvent = {
  source: "mission_completed";
  missionId: string;
  missionXp: number;
  achievementXp: number;
  totalXp: number;
  achievementCount: number;
  pending: boolean;
  createdAt: string;
};

// Tipagens baseadas no nosso esquema do Supabase
interface Mission {
  id: string;
  status: "active" | "completed" | "refused" | "failed";
  title: string;
  description: string;
  expires_at: string;
  completed_at?: string | null;
  mission_type?: "daily" | "specialized";
  category?: string | null;
  personalization_reason?: string | null;
  xp_reward?: number | null;
  pattern_key?: string | null;
  action_fingerprint?: string | null;
  generation_request_id?: string | null;
  ai_justification: {
    category: string;
    reason: string;
  };
}

interface EcoState {
  xp: number;
  impactTotals: ImpactTotals;
  impactPeriods: {
    week: ImpactTotals;
    month: ImpactTotals;
    total: ImpactTotals;
  };
  missions: Mission[];
  loading: boolean;
  lastError: string | null;
  lastNotice: string | null;
  lastProgressEvent: ProgressEvent | null;
  pendingGenerationRequestIds: Partial<Record<"daily" | "specialized", string>>;

  // Ações
  fetchProfile: (userId: string) => Promise<void>;
  fetchPendingMissions: (userId: string, missionType?: "daily" | "specialized") => Promise<void>;
  generateMissions: (userId: string, missionType?: "daily" | "specialized") => Promise<void>;
  completeMission: (missionId: string) => Promise<void>;
  refuseMission: (missionId: string) => Promise<void>;
  failMission: (missionId: string) => Promise<void>;
  sendFeedback: (userId: string, missionId: string, feedbackText: string) => Promise<void>;
  editMission: (userId: string, missionId: string, userInput: string) => Promise<boolean>;
  clearProgressEvent: () => void;
  clearLastError: () => void;
  clearLastNotice: () => void;
}

function isMissionExpired(mission: Pick<Mission, "expires_at">) {
  return Boolean(mission.expires_at && new Date(mission.expires_at).getTime() <= Date.now());
}

function buildFeedbackNotes(text: string, source: "user_feedback" | "mission_edit" = "user_feedback") {
  return {
    text,
    source,
    created_at: new Date().toISOString(),
  };
}

function emptyImpactTotals(): ImpactTotals {
  return { co2_kg: 0, water_l: 0, waste_g: 0, energy_kwh: 0 };
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

function addImpact(target: ImpactTotals, impact: any) {
  target.co2_kg += Number(impact?.co2_kg?.mid ?? 0) || 0;
  target.water_l += Number(impact?.water_l?.mid ?? 0) || 0;
  target.waste_g += Number(impact?.waste_g?.mid ?? 0) || 0;
  target.energy_kwh += Number(impact?.energy_kwh?.mid ?? 0) || 0;
}

function roundImpactTotals(totals: ImpactTotals): ImpactTotals {
  return {
    co2_kg: Number(totals.co2_kg.toFixed(3)),
    water_l: Number(totals.water_l.toFixed(1)),
    waste_g: Number(totals.waste_g.toFixed(1)),
    energy_kwh: Number(totals.energy_kwh.toFixed(3)),
  };
}

function aggregateImpactLedger(rows: Array<{ impact: any; logged_at: string | null }>) {
  const week = emptyImpactTotals();
  const month = emptyImpactTotals();
  const total = emptyImpactTotals();
  const weekStart = startOfWeekMs();
  const monthStart = startOfMonthMs();

  rows.forEach((row) => {
    const loggedAt = row.logged_at ? new Date(row.logged_at).getTime() : NaN;
    addImpact(total, row.impact);
    if (Number.isFinite(loggedAt) && loggedAt >= monthStart) addImpact(month, row.impact);
    if (Number.isFinite(loggedAt) && loggedAt >= weekStart) addImpact(week, row.impact);
  });

  return {
    week: roundImpactTotals(week),
    month: roundImpactTotals(month),
    total: roundImpactTotals(total),
  };
}

async function getFunctionErrorMessage(err: unknown) {
  const context = (err as any)?.context;
  if (context?.clone) {
    try {
      const payload = await context.clone().json();
      if (payload?.message) return String(payload.message);
      if (payload?.error) return String(payload.error);
    } catch {
      try {
        const text = await context.clone().text();
        if (text) return text;
      } catch {
        // Mantem a mensagem original abaixo.
      }
    }
  }

  return err instanceof Error ? err.message : String(err);
}

async function markExpiredMissionsAsFailed(userId: string) {
  const now = new Date().toISOString();
  const { data: expiredMissions, error: selectError } = await supabase
    .from("user_missions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .lt("expires_at", now);

  if (selectError) {
    console.error("[TRILHA] Erro ao buscar missões vencidas:", selectError.message);
    return;
  }

  if (expiredMissions?.length) {
    const failedMissionIds: string[] = [];

    for (const mission of expiredMissions) {
      const { error } = await supabase
        .from("user_missions")
        .update({ status: "failed" })
        .eq("id", mission.id)
        .eq("user_id", userId)
        .eq("status", "active");

      if (error) {
        console.error("[TRILHA] Erro ao marcar missão vencida como failed:", {
          missionId: mission.id,
          message: error.message,
        });
      } else {
        failedMissionIds.push(mission.id);
      }
    }

    if (!failedMissionIds.length) return;

    console.log("[TRILHA] Missões vencidas marcadas como failed:", failedMissionIds.length);
    failedMissionIds.forEach((missionId) => {
      supabase.functions
        .invoke("sync-user-brain", {
          body: {
            userId,
            event_type: "MISSION_ACTION",
            missionId,
            missionAction: "FAILED",
          },
        })
        .catch((err) => console.error("[BRAIN] Sync failed mission error:", err));
    });
  }
}

function isTransientFunctionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /network|fetch|failed to send|err_network_changed|timeout|temporar/i.test(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createGenerationRequestId(missionType: "daily" | "specialized") {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${missionType}:${Date.now()}:${random}`;
}

async function invokeFunctionWithRetry(
  functionName: string,
  body: Record<string, unknown>,
  delays = [350, 900, 1600],
) {
  let lastResult: Awaited<ReturnType<typeof invokeFunction>> | null = null;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const result = await invokeFunction(functionName, { body });
    lastResult = result;

    if (!result.error || !isTransientFunctionError(result.error)) {
      return result;
    }

    const delay = delays[attempt];
    if (delay) await sleep(delay);
  }

  return lastResult ?? { data: null, error: new Error(`Falha ao chamar ${functionName}.`) };
}

async function invokeEditMissionWithRetry(
  userId: string,
  missionId: string,
  userInput: string,
) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { data, error } = await invokeFunction("edit-mission", {
        body: { userId, missionId, userInput },
      });

      if (error) throw error;
      return data;
    } catch (error) {
      lastError = error;
      if (!isTransientFunctionError(error) || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 350 : 900));
    }
  }

  throw lastError;
}

// app/store/useEcoStore.ts
export const useEcoStore = create<EcoState>((set, get) => ({
  xp: 0,
  impactTotals: emptyImpactTotals(),
  impactPeriods: {
    week: emptyImpactTotals(),
    month: emptyImpactTotals(),
    total: emptyImpactTotals(),
  },
  missions: [],
  loading: false,
  lastError: null,
  lastNotice: null,
  lastProgressEvent: null,
  pendingGenerationRequestIds: {},

  fetchProfile: async (userId) => {
    const [{ data, error }, { data: impactRows, error: impactError }] = await Promise.all([
      supabase
        .from("profiles")
        .select("xp")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("impact_ledger")
        .select("impact, logged_at")
        .eq("user_id", userId),
    ]);

    if (impactError) {
      console.error("[IMPACT] Erro ao buscar impacto:", impactError.message);
    }

    if (!error && data) {
      const impactPeriods = aggregateImpactLedger((impactRows ?? []) as any[]);
      set({
        xp: data.xp || 0,
        impactTotals: impactPeriods.total,
        impactPeriods,
      });
    }
  },

  fetchPendingMissions: async (userId: string, missionType?: "daily" | "specialized") => {
    set({ loading: true });
    await markExpiredMissionsAsFailed(userId);
    console.log("[TRILHA] Buscando missões ativas:", { userId, missionType });
    const { data, error } = await supabase
      .from("user_missions")
      .select(`
        id, 
        status, 
        title,
        description,
        ai_justification, 
        mission_type,
        category,
        personalization_reason,
        xp_reward,
        pattern_key,
        action_fingerprint,
        generation_request_id,
        expires_at,
        completed_at
      `)
      .eq("user_id", userId)
      .eq("status", "active");

    if (error) {
      console.error("[TRILHA] Erro ao buscar missões:", error.message);
      set({ lastError: error.message, loading: false });
      return;
    }

    if (data) {
      const activeMissions = (data as Mission[])
        .map((mission: any) => ({
          ...mission,
          mission_type: mission.mission_type || mission.ai_justification?.mission_type || "daily",
          category: mission.category || mission.ai_justification?.category || "consumption",
          personalization_reason:
            mission.personalization_reason || mission.ai_justification?.reason || "",
          xp_reward: mission.xp_reward ?? (mission.mission_type === "specialized" ? 25 : 10),
        }))
        .filter((mission) => !isMissionExpired(mission));
      if (activeMissions.length !== data.length) {
        console.log("[TRILHA] Missões vencidas removidas da lista ativa:", data.length - activeMissions.length);
      }
      set({ missions: activeMissions, lastError: null });
    }
    set({ loading: false });
  },

  generateMissions: async (userId, missionType = "daily") => {
    if (get().loading) return;
    const requestId =
      get().pendingGenerationRequestIds[missionType] ?? createGenerationRequestId(missionType);

    set((state) => ({
      loading: true,
      lastError: null,
      pendingGenerationRequestIds: {
        ...state.pendingGenerationRequestIds,
        [missionType]: requestId,
      },
    }));

    try {
      const { data, error } = await invokeFunctionWithRetry(
        "generate-missions",
        {
          userId,
          missionType,
          clientRequestId: requestId,
        },
        [500, 1200, 2500],
      );

      if (error) throw error;

      console.log("[MISSION_GEN] Resposta da função:", {
        missionType,
        success: data?.success,
        message: data?.message,
        idempotent: data?.idempotent,
        clientRequestId: data?.client_request_id,
      });

      if (data?.message === "max_missions_reached") {
        await get().fetchPendingMissions(userId);
        set((state) => ({
          lastError: null,
          lastNotice: "Você já atingiu o limite de missões ativas. Conclua, recuse ou marque uma missão como não concluída antes de gerar outra.",
          pendingGenerationRequestIds: {
            ...state.pendingGenerationRequestIds,
            [missionType]: undefined,
          },
        }));
        return;
      }

      await get().fetchPendingMissions(userId);
      set((state) => ({
        lastError: null,
        lastNotice: null,
        pendingGenerationRequestIds: {
          ...state.pendingGenerationRequestIds,
          [missionType]: undefined,
        },
      }));
    } catch (err) {
      console.error("[MISSION_GEN] Erro ao gerar missão:", err);
      const transient = isTransientFunctionError(err);

      if (transient) {
        await get().fetchPendingMissions(userId);
        const createdDespiteNetworkError = get().missions.some(
          (mission) => mission.generation_request_id === requestId,
        );

        if (createdDespiteNetworkError) {
          set((state) => ({
            lastError: null,
            pendingGenerationRequestIds: {
              ...state.pendingGenerationRequestIds,
              [missionType]: undefined,
            },
          }));
          return;
        }
      }

      const message = await getFunctionErrorMessage(err);
      set((state) => ({
        lastError: transient
          ? `Conexão oscilou durante a geração. Mantive esta tentativa em aberto; toque novamente para confirmar sem duplicar missão. Detalhe: ${message}`
          : `Não consegui gerar uma missão válida agora. Tente novamente em instantes. Detalhe: ${message}`,
        lastNotice: null,
        pendingGenerationRequestIds: transient
          ? state.pendingGenerationRequestIds
          : {
              ...state.pendingGenerationRequestIds,
              [missionType]: undefined,
            },
      }));
    } finally {
      set({ loading: false });
    }
  },

  refuseMission: async (missionId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ lastError: "Usuário não autenticado." });
      return;
    }

    const { error } = await supabase
      .from("user_missions")
      .update({ status: "refused" })
      .eq("id", missionId)
      .eq("user_id", user.id);

    if (!error) {
      set((state) => ({
        missions: state.missions.filter((m) => m.id !== missionId),
      }));

      // Dispara sync-user-brain (não-bloqueante)
      if (user) {
        supabase.functions
          .invoke("sync-user-brain", {
            body: { userId: user.id, event_type: "MISSION_ACTION", missionId, missionAction: "REFUSED" },
          })
          .catch((err) => console.error("[BRAIN] Sync recusa de missão error:", err));
      }
    } else {
      console.error("[TRILHA] Erro ao recusar missão:", error.message);
      set({ lastError: error.message });
    }
  },

  failMission: async (missionId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ lastError: "Usuário não autenticado." });
      return;
    }

    const { error } = await supabase
      .from("user_missions")
      .update({ status: "failed" })
      .eq("id", missionId)
      .eq("user_id", user.id)
      .eq("status", "active");

    if (!error) {
      set((state) => ({
        missions: state.missions.filter((mission) => mission.id !== missionId),
      }));

      supabase.functions
        .invoke("sync-user-brain", {
          body: { userId: user.id, event_type: "MISSION_ACTION", missionId, missionAction: "FAILED" },
        })
        .catch((err) => console.error("[BRAIN] Sync falha de missão error:", err));
    } else {
      console.error("[TRILHA] Erro ao marcar missão como failed:", error.message);
      set({ lastError: error.message });
    }
  },

  completeMission: async (missionId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      set({ lastError: "Usuário não autenticado." });
      return;
    }

    const mission = get().missions.find((item) => item.id === missionId);
    const optimisticMissionXp = Number(mission?.xp_reward ?? 0) || 0;
    set((state) => ({
      missions: state.missions.filter((item) => item.id !== missionId),
      lastError: null,
      lastProgressEvent: {
        source: "mission_completed",
        missionId,
        missionXp: optimisticMissionXp,
        achievementXp: 0,
        totalXp: optimisticMissionXp,
        achievementCount: 0,
        pending: true,
        createdAt: new Date().toISOString(),
      },
    }));

    const completedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("user_missions")
      .update({ status: "completed", completed_at: completedAt })
      .eq("id", missionId)
      .eq("user_id", user.id)
      .eq("status", "active");

    if (updateError) {
      console.error("[TRILHA] Erro ao concluir missão:", updateError.message);
      if (mission) {
        set((state) => ({
          missions: [mission, ...state.missions.filter((item) => item.id !== missionId)],
        }));
      }
      set({ lastError: updateError.message });
      get().clearProgressEvent();
      await get().fetchPendingMissions(user.id);
      return;
    }

    void (async () => {
      const { data: syncData, error: syncError } = await invokeFunctionWithRetry(
        "sync-user-brain",
        {
          userId: user.id,
          event_type: "MISSION_ACTION",
          missionId,
          missionAction: "COMPLETED",
        },
      );

      if (syncError) throw syncError;

      const missionXp = Number(syncData?.xp?.xpGranted ?? mission?.xp_reward ?? 0) || 0;
      const achievementXp = Number(syncData?.achievements?.unlocked_xp ?? 0) || 0;
      const achievementCount = Number(syncData?.achievements?.unlocked?.length ?? 0) || 0;

      console.log("[XP] Missão concluída processada:", {
        missionId,
        missionXp,
        achievementXp,
        totalXp: missionXp + achievementXp,
        impact: syncData?.impact ? "registered" : "none",
        achievements: achievementCount,
      });

      set({
        lastProgressEvent: {
          source: "mission_completed",
          missionId,
          missionXp,
          achievementXp,
          totalXp: missionXp + achievementXp,
          achievementCount,
          pending: false,
          createdAt: new Date().toISOString(),
        },
      });

      await Promise.all([
        get().fetchProfile(user.id),
        get().fetchPendingMissions(user.id),
      ]);
    })().catch(async (error) => {
      console.error("[TRILHA] Erro ao sincronizar conclusão de missão:", error);
      const message = await getFunctionErrorMessage(error);
      set({
        lastError: `A missão foi concluída, mas o XP ainda não sincronizou. Tente recarregar em instantes. Detalhe: ${message}`,
      });
    });
  },

  sendFeedback: async (userId, missionId, feedbackText) => {
    const feedbackNotes = buildFeedbackNotes(feedbackText);
    const { error } = await supabase
      .from("user_missions")
      .update({ feedback_notes: feedbackNotes })
      .eq("id", missionId)
      .eq("user_id", userId);

    if (error) {
      console.error("[TRILHA] Erro ao salvar feedback da missão:", error.message);
      set({ lastError: error.message });
      return;
    }

    // Dispara sync-user-brain (não-bloqueante)
    supabase.functions
      .invoke("sync-user-brain", {
        body: { userId, event_type: "FEEDBACK_SENT", missionId, feedbackText },
      })
      .catch((err) => console.error("[BRAIN] Sync feedback de missão error:", err));
  },

  editMission: async (userId, missionId, userInput) => {
    set({ loading: true });
    try {
      const data = await invokeEditMissionWithRetry(userId, missionId, userInput);
      
      console.log("[MISSION_EDIT] Missão editada com sucesso:", {
        missionId,
        success: data?.success,
        issueType: data?.issue_type,
        fallbackReason: data?.fallback_reason,
      });
      await get().fetchPendingMissions(userId);
      set({ lastError: null });
      return true;
    } catch (err) {
      console.error("[MISSION_EDIT] Erro ao editar missão:", err);
      const message = await getFunctionErrorMessage(err);
      set({
        lastError: `Não consegui salvar a edição agora. A missão original foi mantida. Tente novamente. Detalhe: ${message}`,
      });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  clearProgressEvent: () => set({ lastProgressEvent: null }),
  clearLastError: () => set({ lastError: null }),
  clearLastNotice: () => set({ lastNotice: null }),
}));
