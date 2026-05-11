import { supabase } from "@/lib/supabase"; // Certifique-se de ter o client configurado
import { create } from "zustand";

// Tipagens baseadas no nosso esquema do Supabase
interface Mission {
  id: string;
  status: "pending" | "completed" | "refused" | "failed";
  ai_justification: string;
  template: {
    title: string;
    description: string;
    category: string;
    base_xp: number;
  };
}

interface EcoState {
  xp: number;
  impactTotals: {
    co2_kg: number;
    water_l: number;
    waste_g: number;
  };
  missions: Mission[];
  loading: boolean;

  // Ações
  fetchProfile: (userId: string) => Promise<void>;
  fetchPendingMissions: (userId: string) => Promise<void>;
  generateMissions: (userId: string) => Promise<void>;
  completeMission: (missionId: string) => Promise<void>;
  refuseMission: (missionId: string) => Promise<void>;
  sendFeedback: (userId: string, missionId: string, feedbackText: string) => Promise<void>;
}

// app/store/useEcoStore.ts
export const useEcoStore = create<EcoState>((set, get) => ({
  xp: 1,
  impactTotals: { co2_kg: 0, water_l: 0, waste_g: 0 },
  missions: [],
  loading: false,

  fetchProfile: async (userId) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("xp, impact_totals")
      .eq("id", userId)
      .maybeSingle(); // maybeSingle evita erro 406 se o perfil demorar a propagar

    if (!error && data) {
      set({
        xp: data.xp || 1,
        impactTotals: data.impact_totals || {
          co2_kg: 0,
          water_l: 0,
          waste_g: 0,
        },
      });
    }
  },

  fetchPendingMissions: async (userId: string) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from("user_missions")
      .select(
        `
      id, 
      status, 
      ai_justification, 
      expires_at,
      template:mission_templates (
        title, 
        description, 
        category, 
        base_xp
      )
    `,
      )
      .eq("user_id", userId)
      .eq("status", "pending");

    if (!error && data) {
      set({ missions: data as any });
    }
    set({ loading: false });
  },

  generateMissions: async (userId) => {
    if (get().loading) return;
    set({ loading: true });

    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-missions",
        {
          body: { userId },
        },
      );

      if (error) throw error;

      // Após gerar, recarrega as missões para a trilha atualizar
      await get().fetchPendingMissions(userId);
    } catch (err) {
      console.error("Erro no Guardião:", err);
    } finally {
      set({ loading: false });
    }
  },

  refuseMission: async (missionId) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("user_missions")
      .update({ status: "refused" })
      .eq("id", missionId);

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
          .catch((err) => console.error("[ECO] Brain sync (refuse) error:", err));
      }
    }
  },

  completeMission: async (missionId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("user_missions")
      .update({ status: "completed" })
      .eq("id", missionId);

    if (!error) {
      // Dispara sync-user-brain (não-bloqueante)
      supabase.functions
        .invoke("sync-user-brain", {
          body: { userId: user.id, event_type: "MISSION_ACTION", missionId, missionAction: "COMPLETED" },
        })
        .catch((err) => console.error("[ECO] Brain sync (complete) error:", err));

      // Atualiza tudo em paralelo para dar sensação de velocidade
      await Promise.all([
        get().fetchProfile(user.id),
        get().fetchPendingMissions(user.id),
      ]);
    }
  },

  sendFeedback: async (userId, missionId, feedbackText) => {
    // Salva o feedback no banco (opcional: campo feedback_notes em user_missions)
    await supabase
      .from("user_missions")
      .update({ feedback_notes: feedbackText })
      .eq("id", missionId);

    // Dispara sync-user-brain (não-bloqueante)
    supabase.functions
      .invoke("sync-user-brain", {
        body: { userId, event_type: "FEEDBACK_SENT", missionId, feedbackText },
      })
      .catch((err) => console.error("[ECO] Brain sync (feedback) error:", err));
  },
}));
