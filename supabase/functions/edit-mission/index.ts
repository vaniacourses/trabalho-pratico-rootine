import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, missionId, userInput } = await req.json();

    if (!userId || !missionId || !userInput) {
      throw new Error("Parâmetros 'userId', 'missionId' e 'userInput' são obrigatórios.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    console.log(`[EDIT] Iniciando edição da missão ${missionId} pelo usuário ${userId}`);

    // 1. Fetch Target Mission
    const { data: mission, error: missionErr } = await supabaseAdmin
      .from("user_missions")
      .select("*")
      .eq("id", missionId)
      .eq("user_id", userId)
      .single();

    if (missionErr || !mission) throw new Error(`Missão não encontrada: ${missionErr?.message}`);

    // 2. Fetch User Profile
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("learned_preferences, socioeconomic_context")
      .eq("id", userId)
      .single();

    if (profileErr) throw new Error("Perfil não encontrado.");

    const currentPrefs = profile.learned_preferences || { interests: [], hard_blocks: [], evolution_tags: [], deficits: [] };

    // 3. System Prompt for Llama 3.1 8B
    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) throw new Error("GROQ_API_KEY não configurada.");

    const systemPrompt = `You are an AI assistant helping a user refine an assigned sustainability mission. 
The user is providing feedback because the mission doesn't fit their routine, constraints, or preferences.

CURRENT MISSION:
Title: ${mission.title}
Description: ${mission.description}
AI Justification for this mission: ${JSON.stringify(mission.ai_justification)}

USER FEEDBACK:
"${userInput}"

USER PROFILE CONTEXT:
Socioeconomic Context: ${JSON.stringify(profile.socioeconomic_context)}
Learned Preferences: ${JSON.stringify(currentPrefs)}

YOUR TASK:
1. Generate a NEW, refined mission that directly addresses the user's feedback.
2. The new mission must maintain the original theme/category but be adapted to the user's constraints.
3. Identify if the user's feedback reveals a new 'hard_block' (constraint) or 'deficit' that should be saved to their profile so we don't make the same mistake again.

LANGUAGE REQUIREMENT:
The fields 'title', 'description', and 'ai_justification.reason' MUST be written in PORTUGUESE (Brazil).

EXPECTED JSON RESPONSE FORMAT:
{
  "title": "Novo Título da Missão",
  "description": "Nova descrição acionável e clara...",
  "ai_justification": {
    "reason": "O usuário mencionou que não tem tempo de manhã, então adaptei a missão para o período noturno."
  },
  "preference_updates": {
    "new_hard_blocks": ["no time in the morning"],
    "new_deficits": []
  }
}

STRICTLY return a valid JSON in the format above.`;

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

    console.log(`[EDIT] Missão editada com sucesso. Novo título: ${aiParsed.title}`);

    // 4. Update the Mission
    const updatedJustification = {
      category: mission.ai_justification?.category || "general",
      reason: aiParsed.ai_justification?.reason || "Editada a pedido do usuário.",
    };

    const { error: updateErr } = await supabaseAdmin
      .from("user_missions")
      .update({
        title: aiParsed.title,
        description: aiParsed.description,
        ai_justification: updatedJustification,
        feedback_notes: userInput // Store the feedback
      })
      .eq("id", missionId);

    if (updateErr) throw new Error(`Erro ao atualizar missão: ${updateErr.message}`);

    // 5. Update User Profile if there are new preferences
    const newHardBlocks = aiParsed.preference_updates?.new_hard_blocks || [];
    const newDeficits = aiParsed.preference_updates?.new_deficits || [];

    if (newHardBlocks.length > 0 || newDeficits.length > 0) {
      const updatedPrefs = { ...currentPrefs };
      
      if (newHardBlocks.length > 0) {
        updatedPrefs.hard_blocks = [...new Set([...(updatedPrefs.hard_blocks || []), ...newHardBlocks])];
      }
      if (newDeficits.length > 0) {
        updatedPrefs.deficits = [...new Set([...(updatedPrefs.deficits || []), ...newDeficits])];
      }

      await supabaseAdmin
        .from("profiles")
        .update({ learned_preferences: updatedPrefs })
        .eq("id", userId);
        
      console.log(`[EDIT] Perfil atualizado com novos hard_blocks/deficits aprendidos do feedback.`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "mission_edited" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("[EDIT CRITICAL ERROR]:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
