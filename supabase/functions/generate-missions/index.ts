import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId } = await req.json();
    if (!userId) {
      throw new Error("O parâmetro 'userId' é obrigatório no corpo da requisição.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    console.log(`[MOTOR] Iniciando geração de missões para userId: ${userId}`);

    // ── 1. Validar e Buscar Perfil (O Snapshot do Usuário) ───────────
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("socioeconomic_context, xp, learned_preferences, affinities, onboarding_completed, daily_flashcards_completed")
      .eq("id", userId)
      .single();

    if (profileErr) throw new Error(`Erro ao buscar perfil: ${profileErr.message}`);

    if (!profile.onboarding_completed) {
      console.log(`[MOTOR] Abortando: Usuário ${userId} não completou o onboarding.`);
      return new Response(JSON.stringify({ error: "onboarding_pending" }), { headers: corsHeaders, status: 400 });
    }

    if (!profile.daily_flashcards_completed) {
      console.log(`[MOTOR] Abortando: Usuário ${userId} não completou os flashcards diários.`);
      return new Response(JSON.stringify({ error: "daily_flashcards_pending" }), { headers: corsHeaders, status: 400 });
    }

    // ── 2. Contar Missões Ativas ─────────────────────────────────────
    const { data: activeMissions, error: countErr } = await supabaseAdmin
      .from("user_missions")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active");

    if (countErr) throw new Error(`Erro ao contar missões: ${JSON.stringify(countErr)}`);

    const count = activeMissions?.length || 0;

    if (count >= 4) {
      console.log(`[MOTOR] Abortando: Usuário ${userId} já possui ${count} missões ativas (Limite >= 4).`);
      return new Response(JSON.stringify({ success: true, message: "max_missions_reached" }), { headers: corsHeaders, status: 200 });
    }

    console.log(`[MOTOR] Validações passadas (Missões atuais: ${count}). Coletando contexto...`);

    // ── 3. Histórico Recente (Flashcards e Missões) ──────────────────
    const { data: recentAnswers } = await supabaseAdmin
      .from("user_flashcards_answers")
      .select("answer, flashcards(question)")
      .eq("user_id", userId)
      .order("id", { ascending: false })
      .limit(10);

    const mappedAnswers = (recentAnswers || []).map((a: any) => ({
      question: a.flashcards?.question ?? "?",
      answer: a.answer,
    }));

    const { data: recentMissions } = await supabaseAdmin
      .from("user_missions")
      .select("title, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    // ── 4. Construir o Contexto (Prompt) ─────────────────────────────
    const snapshot = {
      user_level: profile.xp,
      user_constraints: profile.socioeconomic_context || {},
      user_profile: {
        learned_preferences: profile.learned_preferences || {},
        affinities: profile.affinities || {},
      },
      recent_diagnostics: mappedAnswers,
      mission_history: recentMissions || [],
    };

    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) throw new Error("GROQ_API_KEY não configurada.");

    const systemPrompt = `You are Rootine's 'Mission Engine', a creative AI responsible for generating highly personalized urban sustainability missions and behavioral micro-interventions.

USER SNAPSHOT:
${JSON.stringify(snapshot, null, 2)}

RESTRICTIONS (STRICT DEVELOPER RULES):
1. NEVER generate generic or cliché missions. The mission must be a logical next step based on the user's history.
2. Focus on simple and accessible tasks, especially if 'user_level' (XP) is low. Do not suggest financial investments unless the profile expressly allows it.
3. Do not suggest impossible missions given the 'user_constraints' (Socioeconomic Context).
4. Use 'learned_preferences' (interests, hard_blocks, deficits) and 'affinities' to create something tailored. If the user has a 'deficit', create a mission to address it. If they have a 'hard_block', stay away from that topic.
5. Be practical. The mission must have a short title and a clear, actionable description.

YOUR TASK:
Generate EXACTLY ONE (1) new mission that fits perfectly into this user's current life stage.
Categorize the mission into one of the following allowed categories: "waste", "energy", "water", "transport", "food", "consumption".
Provide a detailed justification, pointing out exactly which point in the 'Snapshot' influenced your decision.

LANGUAGE REQUIREMENT:
The fields 'title', 'description', and 'ai_justification.reason' MUST be written in PORTUGUESE (Brazil). The rest of the JSON structure and categories remain in English as defined.

EXPECTED RESPONSE EXAMPLE:
{
  "title": "Desafio do Banho Rápido",
  "description": "Reduza seu banho em 2 minutos hoje. Use uma música de 5 minutos como cronômetro.",
  "category": "water",
  "ai_justification": {
    "reason": "O usuário respondeu FALSE para economia de água nos flashcards recentes (deficit). Como o XP é baixo, um pequeno ajuste de 2 minutos é um passo inicial prático e sem custo."
  }
}

STRICTLY return a valid JSON in the format above.`;

    console.log("[MOTOR] Chamando Groq para gerar missão...");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "system", content: systemPrompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erro na API Groq: ${response.status} - ${errText}`);
    }

    const aiData = await response.json();
    const aiParsed = JSON.parse(aiData.choices[0].message.content);

    console.log(`[MOTOR] Missão gerada: ${aiParsed.title}`);

    // ── 5. Inserir no Banco de Dados ─────────────────────────────────
    const newMissionId = crypto.randomUUID();

    const { error: insertErr } = await supabaseAdmin
      .from("user_missions")
      .insert({
        id: newMissionId,
        user_id: userId,
        title: aiParsed.title,
        description: aiParsed.description,
        ai_justification: { category: aiParsed.category, reason: aiParsed.ai_justification?.reason || "" },
        status: "active",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h a partir de agora
      });

    if (insertErr) throw new Error(`Erro ao salvar missão: ${insertErr.message}`);

    return new Response(
      JSON.stringify({ success: true, mission_id: newMissionId, message: "mission_created" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: any) {
    console.error("[CRITICAL ERROR]:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
