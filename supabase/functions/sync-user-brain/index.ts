import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Tipos de evento suportados
type EventType = "BATCH_COMPLETED" | "MISSION_ACTION" | "FEEDBACK_SENT";
type MissionAction = "COMPLETED" | "REFUSED";

interface BrainSyncPayload {
  userId: string;
  event_type: EventType;
  // Para BATCH_COMPLETED: preenchido com o batchId
  batchId?: string;
  // Para MISSION_ACTION: preenchido com missionId e a ação
  missionId?: string;
  missionAction?: MissionAction;
  // Para FEEDBACK_SENT: texto livre do usuário
  feedbackText?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: BrainSyncPayload = await req.json();
    const { userId, event_type } = body;

    if (!userId || !event_type) {
      throw new Error("Parâmetros obrigatórios: userId, event_type");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) throw new Error("GROQ_API_KEY não configurada.");

    console.log(`[BRAIN] Event received: ${event_type} for userId: ${userId}`);

    // ── 1. Get current profile state ─────────────────────────────
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("learned_preferences, affinities, socioeconomic_context, xp")
      .eq("id", userId)
      .single();

    if (profileErr) throw new Error(`Error fetching profile: ${profileErr.message}`);

    // ── 2. Build event-specific context ─────────────────────
    let eventContext = "";

    if (event_type === "BATCH_COMPLETED" && body.batchId) {
      // Busca as respostas do lote para destilar em preferências
      const { data: answers } = await supabaseAdmin
        .from("user_flashcards_answers")
        .select("answer, flashcard_id")
        .eq("daily_batch", body.batchId);

      const flashcardIds = (answers || []).map((a: any) => a.flashcard_id);

      const { data: flashcards } = await supabaseAdmin
        .from("flashcards")
        .select("id, question, category")
        .in("id", flashcardIds);

      const questionsMap = Object.fromEntries(
        (flashcards || []).map((f: any) => [f.id, { question: f.question, category: f.category }]),
      );

      const enriched = (answers || []).map((a: any) => ({
        question: questionsMap[a.flashcard_id]?.question ?? "?",
        category: questionsMap[a.flashcard_id]?.category ?? "general",
        answer: a.answer, // true=yes, false=no, null=skipped
      }));

      eventContext = `The user just answered a batch of daily flashcards. Here are the responses:
${JSON.stringify(enriched, null, 2)}
Analyze these answers to infer preferences, blocks, and deficits.`;

    } else if (event_type === "MISSION_ACTION" && body.missionId) {
      // Busca a missão para contexto
      const { data: mission } = await supabaseAdmin
        .from("user_missions")
        .select("ai_justification, template:mission_templates(title, description, category)")
        .eq("id", body.missionId)
        .single();

      eventContext = `The user ${body.missionAction === "COMPLETED" ? "COMPLETED" : "REFUSED"} the following mission:
${JSON.stringify(mission, null, 2)}
${body.missionAction === "COMPLETED"
  ? "Reinforce affinity and interest in this category."
  : "Reduce affinity and register as a potential temporary hard block or lack of interest."}`;

    } else if (event_type === "FEEDBACK_SENT" && body.feedbackText) {
      eventContext = `The user sent the following free-text feedback about their missions:
"${body.feedbackText}"
Extract constraints, preferences, or implicit sentiments to update the profile.`;
    } else {
      throw new Error(`Invalid event or incomplete payload for event_type: ${event_type}`);
    }

    // ── 3. Call Groq to distill learning ───────────────────────────
    console.log(`[BRAIN] Calling Groq for ${event_type}. Context sent to AI:\n${eventContext}`);

    const currentPrefs = profile.learned_preferences || { interests: [], hard_blocks: [], evolution_tags: [], deficits: [] };
    const currentAffinities = profile.affinities || {};

    const systemPrompt = `You are Rootine's behavioral analyst. Your role is to synthesize events into a psychological profile.

CURRENT PROFILE STATE:
- Preferences (learned_preferences): ${JSON.stringify(currentPrefs)}
- Socioeconomic Context: ${JSON.stringify(profile.socioeconomic_context || {})}

SYNTHESIS GUIDELINES:
1. interests: Habits the user ALREADY practices (TRUE responses).
2. hard_blocks: Absolute constraints. DO NOT repeat socioeconomic context.
3. deficits: Habits the user DOES NOT practice yet (FALSE responses).
4. ai_justification: MANDATORY INTEGRITY CHECK. You must start this field by listing each question provided in the context and its corresponding answer. Then, provide a lengthy argumentative text explaining your reasoning based on the QUESTION TEXT and its answer.

CORE LOGIC RULES:
- Integrity First: If you do not list the questions and answers in ai_justification, the analysis is invalid.
- Meaning over Booleans: Base your synthesis on the QUESTION CONTENT. A TRUE response to "Do you use a car?" means a different interest than a TRUE response to "Do you use a bike?".
- Response Meanings: TRUE=Active habit, FALSE=Missing habit (Deficit), NULL=Irrelevant/Uninterested.
- Avoid Redundancy: Do not add tags that are already in the Socioeconomic Context.

EXPECTED RESPONSE EXAMPLE:
{
  "learned_preferences": {
    "interests": ["cycling"],
    "hard_blocks": [],
    "deficits": ["water conservation"],
    "evolution_tags": [...],
    "ai_justification": "INTEGRITY CHECK: 'Do you bike?' -> TRUE, 'Do you save water?' -> FALSE. REASONING: The user confirmed they bike, so I added 'cycling' to interests. They do not save water yet, so that is a deficit..."
  }
}

FINAL INSTRUCTION:
STRICTLY return a valid JSON. Merge deductions with the 'CURRENT PROFILE STATE'.`;

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: eventContext },
          ],
          response_format: { type: "json_object" },
        }),
      },
    );

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      throw new Error(`Erro Groq: ${groqResponse.status} - ${errText}`);
    }

    const groqData = await groqResponse.json();
    const aiResult = JSON.parse(groqData.choices[0].message.content);

    console.log(`[BRAIN] AI Justification: ${aiResult.learned_preferences?.ai_justification}`);

    // ── 4. Validation and Structuring (Safe Post-Processing) ─────────
    const aiLp = aiResult.learned_preferences || {};
    
    // Ensure string arrays
    const extractStringArray = (arr: any) => Array.isArray(arr) ? arr.filter(i => typeof i === 'string') : [];
    
    const interests = extractStringArray(aiLp.interests);
    const hardBlocks = extractStringArray(aiLp.hard_blocks);
    const deficits = extractStringArray(aiLp.deficits);
    
    // Rigid Rule (Hardcoded): evolution_tags only change if the event is NOT a flashcard
    let evolutionTags = extractStringArray(aiLp.evolution_tags);
    if (event_type === "BATCH_COMPLETED") {
        evolutionTags = currentPrefs.evolution_tags || [];
        console.log(`[BRAIN] BATCH_COMPLETED event: evolution_tags from AI ignored, keeping current state.`);
    }

    const mergedPreferences = {
      interests: interests.length > 0 ? interests : (currentPrefs.interests || []),
      hard_blocks: hardBlocks.length > 0 ? hardBlocks : (currentPrefs.hard_blocks || []),
      deficits: deficits.length > 0 ? deficits : (currentPrefs.deficits || []),
      evolution_tags: evolutionTags,
      ai_justification: aiLp.ai_justification || "No justification provided by AI.",
    };

    // ── 5. Save to database ───────────────────────────────────────────
    const { error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({
        learned_preferences: mergedPreferences,
        // Keep current affinities as AI no longer manages them
        affinities: currentAffinities,
      })
      .eq("id", userId);

    if (updateErr) throw new Error(`Error updating profile: ${updateErr.message}`);

    console.log(`[BRAIN] Profile successfully updated for userId: ${userId}`);

    return new Response(
      JSON.stringify({
        success: true,
        event_type,
        ai_justification: mergedPreferences.ai_justification,
        updated_preferences: mergedPreferences,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: any) {
    console.error("[BRAIN ERROR]:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
