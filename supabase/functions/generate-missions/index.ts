import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Pegando o userId e validando
    const { userId } = await req.json();
    if (!userId) {
      throw new Error(
        "O parâmetro 'userId' é obrigatório no corpo da requisição.",
      );
    }

    // 2. Criando o cliente do Supabase
    // Isso usa a Chave Mestra (Default Secret) injetada automaticamente pela nuvem do Supabase
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    console.log(`[INIT] Iniciando Guardião para userId: ${userId}`);

    // 3. Busca de Dados (Usando o Admin)
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("socioeconomic_context, current_habits")
      .eq("id", userId)
      .single();

    if (profileErr)
      throw new Error(`Erro ao buscar perfil: ${profileErr.message}`);

    const { data: templates, error: templatesErr } = await supabaseAdmin
      .from("mission_templates")
      .select("*");

    if (templatesErr)
      throw new Error(`Erro ao buscar templates: ${templatesErr.message}`);

    console.log("[GROQ] Preparando chamada para a IA");

    // 4. Chamada da Groq (Modelo rápido: 8b)
    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey)
      throw new Error(
        "A variável GROQ_API_KEY não está configurada nas Secrets.",
      );

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant", // Trocamos para o 8b (mais rápido e resiliente)
          messages: [
            {
              role: "system",
              content: `Você é o 'Guardião do Ecossistema', um motor de lógica comportamental especializado em sustentabilidade urbana e micro-intervenções.
    
    SUA MISSÃO:
    Sugerir 3 missões baseadas na lista fornecida que tenham o maior potencial de mitigar impactos negativos identificados nos hábitos atuais do usuário. Utilize as missões dadas como inspiração mas crie suas próprias missões a partir de uma delas, refinando de acordo com as restrições e hábitos do usuário.
    
    INPUT DATA:
    1. Perfil Socioeconômico (Restrições): ${JSON.stringify(profile.socioeconomic_context)}
    2. Hábitos Atuais (Gaps): ${JSON.stringify(profile.current_habits)}
    
    ALGORITMO DE SELEÇÃO:
    - FASE 1 (Identificação de Gaps): Analise onde o usuário respondeu 'não', 'nunca' ou valores de alto impacto (ex: 'carro', 'muita carne'). Estes são os alvos primários.
    - FASE 2 (Filtro de Restrições): Para cada alvo, verifique as restrições. Se o usuário não tem infraestrutura de bairro para reciclagem, NÃO sugira reciclagem. Se ele indicou restrição financeira, sugira missões de CUSTO ZERO.
    - FASE 3 (Nudge Comportamental): Priorize missões que sejam um 'próximo passo lógico' e não uma mudança radical impossível.
    
    REGRAS DE OURO:
    - Se a restrição for 'falta de tempo', escolha missões rápidas (< 5 min).
    - Se a restrição for 'moro em república/aluguel', não sugira mudanças estruturais (ex: painel solar).
    - Mantenha a diversidade: 1 missão fácil, 1 média e 1 que desafie um hábito 'ruim' específico.
    
    SAÍDA:
    Retorne estritamente um JSON:
    {
      "selected_templates": ["UUID"],
      "justifications": ["Por que esta missão é viável considerando a restrição X e como ela ataca o hábito Y"]
    }`,
            },
            {
              role: "user",
              content: `Templates Disponíveis: ${JSON.stringify(templates)}`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erro na API Groq: ${response.status} - ${errText}`);
    }

    const aiData = await response.json();
    const content = aiData.choices[0].message.content;
    const aiParsed = JSON.parse(content);

    console.log("[INSERT] Missões escolhidas, salvando...");

    // 5. Inserção no banco
    const inserts = aiParsed.selected_templates.map(
      (templateId: string, index: number) => ({
        user_id: userId,
        template_id: templateId,
        status: "pending",
        ai_justification: aiParsed.justifications[index],
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h a partir de agora
      }),
    );

    const { error: insertErr } = await supabaseAdmin
      .from("user_missions")
      .insert(inserts);
    if (insertErr)
      throw new Error(`Erro ao salvar missões: ${insertErr.message}`);

    return new Response(
      JSON.stringify({ success: true, count: inserts.length }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error("[CRITICAL ERROR]:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
