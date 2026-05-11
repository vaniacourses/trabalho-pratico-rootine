import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10;

serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Validação do userId
    const { userId } = await req.json();
    if (!userId) {
      throw new Error(
        "O parâmetro 'userId' é obrigatório no corpo da requisição.",
      );
    }

    // 2. Cliente Admin (usa Service Role Key para bypass de RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    console.log(`[BATCH] Gerando lote para userId: ${userId}`);

    // 3. Verifica se já existe um batch ativo (idempotente)
    const { data: existingBatch, error: checkErr } = await supabaseAdmin
      .from("user_daily_flashcards")
      .select("*")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();

    if (checkErr) throw new Error(`Erro ao checar batch: ${checkErr.message}`);

    if (existingBatch) {
      // Já existe um batch ativo — retorna ele com os flashcards associados
      const { data: existingAnswers } = await supabaseAdmin
        .from("user_flashcards_answers")
        .select("id, flashcard_id, answer, flashcards(question)")
        .eq("daily_batch", existingBatch.id);

      console.log("[BATCH] Batch ativo encontrado, retornando existente");
      return new Response(
        JSON.stringify({
          success: true,
          batch: existingBatch,
          flashcards: existingAnswers || [],
          reused: true,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // 4. Selecionar flashcards aleatórios
    const { data: flashcards, error: flashErr } = await supabaseAdmin
      .from("flashcards")
      .select("id, question")
      .limit(BATCH_SIZE);

    if (flashErr)
      throw new Error(`Erro ao buscar flashcards: ${flashErr.message}`);

    if (!flashcards || flashcards.length === 0) {
      throw new Error(
        "Nenhum flashcard disponível no banco. Insira perguntas na tabela 'flashcards'.",
      );
    }

    console.log(`[BATCH] ${flashcards.length} flashcards selecionados`);

    // 5. Criar o batch
    const batchId = crypto.randomUUID();
    const { data: newBatch, error: batchErr } = await supabaseAdmin
      .from("user_daily_flashcards")
      .insert({
        id: batchId,
        user_id: userId,
        active: true,
        amount: flashcards.length,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (batchErr)
      throw new Error(`Erro ao criar batch: ${batchErr.message}`);

    // 6. Criar as linhas de resposta (answer = NULL = pendente)
    const answerRows = flashcards.map((fc: any) => ({
      id: crypto.randomUUID(),
      user_id: userId,
      flashcard_id: fc.id,
      daily_batch: batchId,
      answer: null,
    }));

    const { error: insertErr } = await supabaseAdmin
      .from("user_flashcards_answers")
      .insert(answerRows);

    if (insertErr)
      throw new Error(`Erro ao criar respostas: ${insertErr.message}`);

    console.log(`[BATCH] Batch ${batchId} criado com ${answerRows.length} cards`);

    // 7. Retorna o batch completo
    const responseFlashcards = flashcards.map((fc: any, i: number) => ({
      id: answerRows[i].id,
      flashcard_id: fc.id,
      answer: null,
      flashcards: { question: fc.question },
    }));

    return new Response(
      JSON.stringify({
        success: true,
        batch: newBatch,
        flashcards: responseFlashcards,
        reused: false,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error("[BATCH CRITICAL ERROR]:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
