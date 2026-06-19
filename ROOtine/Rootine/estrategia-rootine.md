# Estratégia de implementação do Rootine

Este documento é a fonte de verdade para implementar os próximos prompts no atual

## Resultado final esperado

Ao final dos prompts, o Rootine deve estar neste estado:

- Missões são personalizadas por fatos reais do usuário, respeitando limitações de tempo, dinheiro, acesso, saúde, segurança, preferências e experiência.
- Usuários conseguem editar missões sem receber de volta missões genéricas, literais demais, contraditórias ou sem relação ambiental.
- Missões concluídas melhoram efetivamente a sustentabilidade e a relação ambiental do usuário.
- O impacto do usuário é medido, auditável e visível no Perfil.
- A árvore do Habitat cresce progressivamente com XP, sem saturar cedo nem demorar demais.
- O fluxo principal funciona sem IA paga: IA melhora texto, conversa e variações, mas não é fonte de verdade do perfil nem requisito para gerar missão válida.
- O app continua viável gratuitamente em Supabase para poucos usuários.

## Regras fixas

- Implementar sempre dentro de `Rootine/`.
- Começar cada prompt lendo os arquivos reais que serão alterados. Não assumir que este documento descreve cada linha atual.
- Preservar mudanças locais não relacionadas.
- A print do banco/Supabase real é a fonte de verdade quando `ddl.sql` divergir.
- Os status reais de missão são `active`, `completed`, `refused` e `failed`.
- Não criar migração nova para `pending` ou `expired`. Se missão vencer, ela deve virar `failed`.
- O `ddl.sql` atual ainda lista `pending` e `expired`, mas isso deve ser tratado como desatualização local.
- Qualquer criação ou alteração de tabela/campo deve ser adicionada ao final de `ddl.sql`.
- Scripts que precisam ser executados no Supabase, como RLS, policies, funções SQL, triggers, seeds e backfills, devem ser adicionados ao final de `add.sql`. Se `Rootine/add.sql` não existir, criar no primeiro prompt que precisar de SQL executável.
- Usar migrations existentes em `supabase/migrations/` como contexto, mas registrar novas mudanças também em `ddl.sql` e `add.sql`.
- Cada prompt deve implementar logs úteis para as funcionalidades tocadas.
- Prefixos de logs: `[AUTH]`, `[NAV]`, `[ONBOARDING]`, `[AVENTURA]`, `[TRILHA]`, `[BRAIN]`, `[MISSION_GEN]`, `[MISSION_EDIT]`, `[XP]`, `[IMPACT]`, `[HABITAT]`, `[PROFILE]`, `[SCIENTIST]`, `[BIOSPHERE]`, `[RLS]`.
- Logs não podem expor tokens, e-mails, JWT, service role key, prompts completos, dados médicos detalhados ou qualquer texto sensível. Preferir IDs, contagens, categorias, fact keys e motivos resumidos.
- Logs de fluxos com IA devem declarar explicitamente `ai_used: true|false`, `ai_stage`, `ai_provider`, `ai_model`, `fallback_reason`, `validation_status` e contagens de candidatos, sem registrar prompt completo nem texto sensível.
- Quando a IA estiver indisponível, bloqueada por validação ou desligada, logs devem declarar `ai_used: false` e o fallback determinístico/contextual usado.
- Ao final de cada prompt, rodar validação possível, no mínimo `npm run lint`. Se também rodar `npx tsc --noEmit`, lembrar que `tsconfig.json` já exclui `supabase/functions`.

## Estado atual da codebase `Rootine/`

Arquivos centrais:

- `app/(tabs)/_layout.tsx`: tabs reais atuais. Hoje mostra `flashcards` como "Trilha", `adventure` como "Aventura", `index` como "Habita", `profile` como "Perfil" e `biosphere` como "Biosfera". `admin`, `explore` e `missions` estão ocultas com `href: null`.
- `app/(tabs)/index.tsx`: tela da árvore, ainda com nome "Habita", preview manual de estados e vitalidade calculada por fórmula simplificada.
- `app/(tabs)/flashcards.tsx`: fluxo de flashcards + quiz. Esta tela deve ser a experiência final da **Aventura**.
- `app/(tabs)/adventure.tsx`: lista e gera missões diárias/especializadas. Esta tela deve ser a experiência final da **Trilha**.
- `app/(tabs)/profile.tsx`: já tem abas de Estatísticas, Conquistas, Histórico e Cientista, mas estatísticas/impacto/conquistas são derivadas localmente e não auditáveis.
- `app/(tabs)/biosphere.tsx`: já tem Fórum estático, RSS de notícias/eventos e chamada `biosphere-feed`. Ainda não há comunidade real com RLS.
- `app/(tabs)/explore.tsx`: tela exemplo do Expo, oculta. Deve permanecer inacessível ou ser removida/redirecionada.
- `app/(tabs)/missions.tsx`: tela antiga de missões, oculta. Deve permanecer inacessível ou ser removida/redirecionada.
- `app/flashcards/index.tsx`: rota duplicada/legada de flashcards. Deve ser redirecionada ou removida depois que a aba Aventura estiver consolidada.
- `store/useEcoStore.ts`: controla perfil, missões, conclusão, recusa, falha manual, feedback e edição. O fallback local genérico foi removido; falhas/recusas alimentam `sync-user-brain`.
- `store/useFlashcardStore.ts`: controla lotes de flashcards. Seleção depende de `generate-batch`; respostas alimentam fatos/eventos determinísticos, sem IA para interpretar perfil.
- `hooks/useMissions.ts` e `hooks/useProfile.ts`: estão vazios. Podem ser preenchidos quando fizer sentido ou removidos se forem ruído.
- `supabase/functions/_shared/agents.ts`: já existe camada compartilhada de agentes, categorias e logs de interação.
- `supabase/functions/_shared/supabase-admin.ts`: cria client service role, mas ainda não valida JWT/userId.
- `supabase/functions/generate-missions/index.ts`: usa `mission_patterns` e ranking determinístico; IA é opcional e só reescreve texto final validado.
- `supabase/functions/edit-mission/index.ts`: ainda usa IA para refinar texto da missão. Já valida JWT e não escreve `learned_preferences`, mas ainda precisa da edição segura do Prompt 8.
- `supabase/functions/sync-user-brain/index.ts`: agregador determinístico; não usa IA para atualizar `learned_preferences` ou `affinities`.
- `supabase/functions/generate-batch/index.ts`: seleciona flashcards balanceados por metadados/histórico e evita batch ativo sem pendentes.
- `supabase/functions/generate-quiz/index.ts`: seleciona quizzes determinísticos do catálogo.
- `supabase/functions/habitat-leaves/index.ts`: gera mensagens da árvore por IA/cache.
- `supabase/functions/profile-scientist-chat/index.ts`: Cientista com IA e fallback.
- `supabase/functions/biosphere-feed/index.ts`: busca RSS externo de notícias/eventos. Não contém dados pessoais.
- `supabase/config.toml`: todas as functions estão com `verify_jwt = false` hoje.
- `ddl.sql`: tem schema parcial/desatualizado em alguns trechos, mas já registra tabelas de eventos/fatos, ledgers, patterns, logs, conquistas e quiz catalog quando adicionadas pelos prompts.
- `supabase/migrations/20260525200000_seed_flashcards.sql`: seed legado; os metadados/catálogos atuais devem ser mantidos via `add.sql`.

## Achados pós-checkpoints até Prompt 7

Os testes reais com `breno2@gmail.com` revelaram ajustes que devem ser incorporados ao restante do roadmap:

- O cérebro determinístico funciona e regrava caches versionados sem IA, mas precisa de validação de schema para impedir drift de valores estruturados, como `déficit` vs `deficit`.
- Recusa e falha funcionam como sinais proporcionais:
  - `refused` vira `preference`, `priority_delta = -0.1`, `hard_block = false`;
  - `failed` vira `constraint`, `priority_delta = -0.06`, recomendação de reduzir dificuldade/esforço, `hard_block = false`.
- O gerador de missões precisa usar esses sinais para reduzir repetição de categoria/pattern depois de recusas/falhas recentes.
- O app web pode sofrer `ERR_NETWORK_CHANGED`; ações críticas devem ter retry curto, estado visual recuperável e erro claro.
- `fact_type`, categorias, status, action types e impact metric keys precisam ser normalizados por validadores compartilhados antes de gravar.
- O impacto ainda é estimado por heurística simples; Prompt 9 deve versionar modelos de impacto por categoria/pattern, mesmo que os números continuem aproximados.
- Mudanças em perfil/fatos devem sempre ser eventos novos ou flags de correção/ocultação; não editar histórico bruto silenciosamente.

## Decisões de produto para esta versão

- UI final:
  - `index` -> **Habitat**.
  - `adventure` -> **Trilha**: missões diárias e especializadas.
  - `flashcards` -> **Aventura**: flashcards e quizzes.
  - `profile` -> **Perfil**.
  - `biosphere` -> **Biosfera**.
- Evitar renomear rotas se isso criar churn. Pode manter nomes de arquivo atuais e corrigir labels/textos/fluxos.
- `mission_type` pode continuar existindo com `daily` e `specialized`.
- Os agentes internos podem continuar com nomes atuais, mas texto visível ao usuário deve refletir a UI final: Trilha para missões, Aventura para flashcards/quizzes.
- `biosphere-feed` pode continuar público se não ler dados pessoais. Functions que recebem `userId` devem validar JWT.
- Não salvar missão genérica no client quando a function falhar. O fallback deve vir de pattern validado/contextual ou mostrar erro de retry.

## Configuração e papel da IA

O fluxo principal deve funcionar sem IA. Para ativar IA nas Edge Functions remotas, configurar secrets no Supabase, não apenas `.env` local:

```bash
npx supabase secrets set GROQ_API_KEY=...
npx supabase secrets set GROQ_MODEL=llama-3.3-70b-versatile
```

Alternativa OpenAI:

```bash
npx supabase secrets set OPEN_AI_KEY=...
npx supabase secrets set OPENAI_MODEL=...
```

`OPENAI_API_KEY` também é aceito pela camada compartilhada, mas o projeto usa historicamente `OPEN_AI_KEY`. Não colocar chaves em variáveis `EXPO_PUBLIC_*`.

Depois de configurar secrets, redeployar as functions que usam IA quando houver alteração de código:

- `generate-missions`;
- `edit-mission`;
- `habitat-leaves`;
- `profile-scientist-chat`.

Com IA ativa:

- `generate-missions` pode usar o AI Mission Composer validado.
- `edit-mission` pode classificar/refinar feedback, desde que validado.
- `habitat-leaves` pode gerar mensagens narrativas.
- `profile-scientist-chat` pode responder como Cientista.

Com IA inativa, indisponível ou reprovada pelo validador:

- geração de missão usa fallback contextual de pattern;
- edição usa fallback conservador;
- habitat/cientista usam respostas fallback;
- logs devem registrar `ai_used: false` e `fallback_reason`.

## Personalização sem genericidade

O Rootine deve usar `mission_patterns`, não templates finais.

Um pattern é um mecanismo ambiental validado com slots, filtros e impacto estimado. A missão final só pode ser salva quando for adaptada a fatos reais do usuário.

Patterns são blueprints, não o limite criativo do sistema. A arquitetura-alvo da Trilha deve ser:

1. O sistema monta `MissionGenerationContextV1` com fatos, restrições, histórico, recusas, falhas, impacto e diversidade.
2. O ranking determinístico escolhe um conjunto pequeno de patterns seguros, não uma missão final fixa.
3. Quando IA estiver ativa, o **AI Mission Composer** recebe esses blueprints + contexto resumido e propõe `2` a `3` candidatas de missão realmente adaptadas ao usuário.
4. O sistema valida cada candidata com `validateMissionCandidate`, fingerprints de ação e regras anti-repetição antes de salvar.
5. Se IA estiver ausente, falhar ou retornar candidata inválida, o sistema usa fallback determinístico contextual do pattern.

A IA pode explorar forma, momento, objeto e abordagem da missão. A IA não pode ser fonte de verdade para fatos do usuário, hard blocks, categoria canônica, impacto, XP, custo, dificuldade ou histórico. Esses campos vêm do banco, dos patterns e dos validadores.

Para evitar missões diferentes no texto, mas iguais na prática, cada missão deve ter ou derivar:

- `pattern_key`;
- `action_fingerprint` ou equivalente, por exemplo `waste.clean_recyclables`, `energy.turn_off_idle_lights`;
- similaridade semântica contra missões recentes;
- overlap de `used_fact_keys`;
- cooldown por pattern, fingerprint e categoria após `refused`/`failed`.

Exemplo de pattern:

```json
{
  "key": "water.pause_running_shower_when_safe",
  "category": "water",
  "environmental_goal": "reduce_water_use",
  "difficulty_min": 1,
  "difficulty_max": 2,
  "cost_level": "free",
  "effort_minutes_min": 1,
  "effort_minutes_max": 5,
  "required_or_helpful_fact_types": ["constraint", "deficit", "capability"],
  "disqualifying_fact_keys": ["water.no_control_over_shower"],
  "personalization_slots": ["routine_moment", "safe_pause", "time_limit", "reason"],
  "impact_model_key": "water_l_saved_low_confidence"
}
```

Exemplo de missão final válida:

```json
{
  "title": "Pausa segura no banho",
  "description": "Hoje, durante a parte do banho em que você não precisa de água corrente para aplicar o medicamento, desligue o chuveiro por até 1 minuto. Não altere a etapa médica.",
  "category": "water",
  "environmental_goal": "reduce_water_use",
  "difficulty": 1,
  "effort_minutes": 2,
  "cost_level": "free",
  "used_fact_keys": [
    "constraint.time.low",
    "water.needs_longer_shower_for_medication"
  ],
  "personalization_reason": "Respeita a necessidade médica e reduz desperdício apenas onde é seguro.",
  "expected_impact": {
    "water_l": { "low": 3, "mid": 6, "high": 10, "confidence": 0.45 }
  }
}
```

Critérios obrigatórios para qualquer missão salva:

- `category` em `water`, `energy`, `waste`, `transport`, `food`, `consumption`.
- `environmental_goal` positivo e explícito.
- `used_fact_keys` com pelo menos 1 fato real do usuário. Para cold start, usar fato do onboarding ou fato `cold_start.*` explicitamente criado.
- `personalization_reason` em português.
- Tempo, custo e dificuldade compatíveis com o perfil.
- Não violar hard blocks.
- Não mandar aumentar consumo, descarte, compra, emissão ou uso de recursos sem justificativa ambiental direta.
- Não repetir pattern ou missão semanticamente parecida nos últimos 14 dias, salvo missão recorrente marcada como tal.
- Passar por validador antes de salvar, mesmo quando a IA retorna JSON aparentemente correto.

## Curva de XP escolhida

A curva abaixo dá feedback rápido no começo e desacelera depois. Ela considera um usuário comum fazendo 1 missão simples por dia e algumas interações de Aventura por semana.

| Nível | XP mínimo | Marco visual |
| --- | ---: | --- |
| 0 | 0 | Semente |
| 1 | 10 | Broto |
| 2 | 45 | Folhas novas |
| 3 | 100 | Muda firme |
| 4 | 180 | Primeiros galhos |
| 5 | 300 | Árvore jovem |
| 6 | 470 | Copa aberta |
| 7 | 700 | Habitat vivo |
| 8 | 1000 | Florescimento |
| 9 | 1400 | Frutos |
| 10 | 1900 | Ecossistema maduro |
| 11 | 2500 | Bosque |
| 12 | 3200 | Referência sustentável |

Após o nível 12:

```text
xp_next(level) = xp_current(level) + round(700 + (level - 12) * 180)
```

Recompensas:

- Missão dificuldade 1: `10 XP`.
- Missão dificuldade 2: `16 XP`.
- Missão dificuldade 3: `25 XP`.
- Missão dificuldade 4: `40 XP`.
- Missão dificuldade 5: `60 XP`.
- Lote de Aventura concluído com pelo menos 70% respondido: `4 XP`.
- Quiz correto: `2 XP`, com teto diário de `8 XP` vindo de quizzes.
- Conquistas: `15` a `80 XP`, sempre idempotentes.
- Missão `refused`, `failed` ou editada: `0 XP`, mas gera aprendizado.

Regras:

- XP deve ser lançado em `xp_ledger`, nunca somado diretamente de forma solta.
- `profiles.xp` pode existir como cache, mas deve ser derivável do ledger.
- Habitat calcula nível e progresso por faixa: `(xp - xp_min_level) / (xp_next_level - xp_min_level)`.
- `TreeDisplay` não deve usar `xp / 120` como crescimento final.

## Impacto ambiental

Impacto deve ser estimado com honestidade, não como precisão falsa.

Cada pattern deve ter `impact_model_key` e cada missão gerada deve salvar `expected_impact` com intervalo:

```json
{
  "water_l": { "low": 3, "mid": 6, "high": 10, "confidence": 0.45 },
  "co2_kg": { "low": 0, "mid": 0, "high": 0, "confidence": 0.2 },
  "waste_g": { "low": 0, "mid": 0, "high": 0, "confidence": 0.2 },
  "energy_kwh": { "low": 0, "mid": 0, "high": 0, "confidence": 0.2 }
}
```

Ao concluir missão:

- Inserir linha idempotente em `impact_ledger`.
- Marcar se o valor é estimado ou informado pelo usuário.
- Agregar no Perfil por semana, mês e total.
- Mostrar "estimado" quando for cálculo padrão.

## Roadmap de implementação

Há exatamente 10 prompts. Eles devem ser executados em ordem.

### Prompt 1: auditoria da versão Rootine, navegação e segurança base

Objetivo: estabilizar a versão correta antes de mexer no motor.

Escopo obrigatório:

- Confirmar que o trabalho está sendo feito em `Rootine/`.
- Conferir `app/(tabs)/_layout.tsx` antes de alterar.
- Corrigir textos e labels para o produto final:
  - `index` e textos internos de `app/(tabs)/index.tsx`: `Habita` -> `Habitat`.
  - `adventure` deve aparecer como **Trilha** e conter missões.
  - `flashcards` deve aparecer como **Aventura** e conter flashcards/quizzes.
  - `profile` deve continuar **Perfil**.
  - `biosphere` deve continuar **Biosfera**.
- Manter `explore` e `missions` inacessíveis ou redirecionar para as rotas novas. Nenhuma tela exemplo do Expo deve aparecer ao usuário.
- Tratar `app/flashcards/index.tsx` como rota legada: redirecionar para a aba Aventura ou remover sem quebrar o fluxo de auth.
- Ocultar `admin` para produção; se for útil, expor apenas em `__DEV__`.
- Em `useEcoStore`, alinhar ciclo básico:
  - missão vencida vira `failed`;
  - conclusão grava `status = completed` e `completed_at`;
  - recusa grava `status = refused`;
  - updates de missão sempre filtram `id` e `user_id`;
  - `feedback_notes` sempre JSON com `text`, `source` e `created_at`;
  - não inserir fallback local genérico quando `generate-missions` falhar.
- Configurar `verify_jwt = true` em functions que recebem `userId`: `generate-missions`, `generate-batch`, `sync-user-brain`, `edit-mission`, `generate-quiz`, `habitat-leaves`, `profile-scientist-chat`.
- `biosphere-feed` pode permanecer sem JWT apenas se continuar sem dados pessoais.
- Criar helper compartilhado em `supabase/functions/_shared/supabase-admin.ts` para validar Authorization/JWT e comparar `requestedUserId` com o usuário autenticado.
- Usar esse helper antes de qualquer service role em functions com `userId`.
- Padronizar logs de segurança com `[RLS]`, sem logar JWT.

Critérios de aceite:

- Tabs finais aparecem com nomes corretos e sem rotas duplicadas visíveis.
- Nenhuma function com `userId` aceita ID de outro usuário autenticado.
- Status e datas de missão ficam consistentes.
- `npm run lint` passa ou pendências são justificadas.

Prompt para executar:

```text
Trabalhe dentro de Rootine/. Audite a versão atual antes de alterar. Estabilize navegação e segurança: corrija labels para Habitat, Trilha (missões), Aventura (flashcards/quizzes), Perfil e Biosfera; mantenha explore/missions/flashcards legacy inacessíveis ou redirecionados; oculte Admin para produção; alinhe status active/completed/refused/failed; trate vencimento como failed; grave completed_at; padronize feedback_notes JSON; remova fallback local genérico de missão; configure verify_jwt e valide userId por JWT nas Edge Functions com helper compartilhado. Não confie no enum antigo pending/expired do ddl.sql.
```

### Prompt 2: banco estruturado, RLS e compatibilidade com schema atual

Objetivo: criar a base auditável sem quebrar as tabelas já existentes.

Tabelas novas mínimas:

- `user_profile_events`: eventos imutáveis de onboarding, Aventura, Trilha, feedback, XP e correções do Perfil.
- `user_profile_facts`: fatos derivados, com `fact_key`, `fact_type`, `category`, `value`, `confidence`, `source_event_ids`, `active`.
- `xp_ledger`: lançamentos idempotentes de XP.
- `impact_ledger`: impacto por missão concluída.
- `achievement_definitions`: catálogo de conquistas.
- `user_achievements`: conquistas desbloqueadas por usuário.
- `mission_patterns`: padrões de missão.
- `mission_generation_logs`: auditoria de geração/ranking/validação.
- `quiz_questions`: catálogo de quizzes reutilizáveis.

Alterações em tabelas atuais:

- `flashcards`: adicionar `category`, `signal_key`, `signal_type`, `true_effect`, `false_effect`, `skip_effect`, `weight`, `difficulty`, `active`.
- `user_missions`: adicionar `category`, `environmental_goal`, `difficulty`, `effort_minutes`, `cost_level`, `xp_reward`, `used_fact_keys`, `personalization_reason`, `generation_snapshot`, `expected_impact`, `impact_logged_at`, `pattern_key`.
- `user_quiz_answers`: adicionar campo para referenciar `quiz_questions` sem quebrar o FK legado para `quizzes`; por exemplo `quiz_question_id uuid null`.
- Manter `quizzes` como tabela legada/gerada até o Prompt 5 migrar o fluxo.
- `profiles`: manter `nome` enquanto o app usar `nome`; se adicionar `name`, criar compatibilidade explícita. Não quebrar cadastro existente.

RLS:

- Usuário só lê/escreve seus próprios eventos, fatos, missões, XP, impacto, conquistas, folhas de Habitat e respostas.
- Catálogos (`mission_patterns`, `flashcards`, `quiz_questions`, `achievement_definitions`) podem ser lidos por usuários autenticados quando `active = true`.
- Escrita em tabelas sensíveis deve ocorrer via Edge Function/service role ou RPC segura.
- `agent_interactions` deve ser legível apenas pelo próprio usuário ou apenas service role, conforme risco escolhido.

Seeds/backfills obrigatórios:

- Criar `add.sql` se ainda não existir.
- Criar pelo menos `6` categorias padrão como constantes/seed quando aplicável.
- Criar pelo menos `8` `achievement_definitions`.
- Backfill seguro para `user_missions.mission_type = daily` quando nulo.
- Backfill de `feedback_notes` antigo `{ text }` para incluir `source` e `created_at` quando possível.

Critérios de aceite:

- SQL novo está no final de `ddl.sql`.
- RLS, policies, seeds e backfills estão no final de `add.sql`.
- Tabelas existentes continuam funcionando durante a transição.

Prompt para executar:

```text
Dentro de Rootine/, implemente a fundação de banco compatível com o schema atual: user_profile_events, user_profile_facts, xp_ledger, impact_ledger, achievement_definitions, user_achievements, mission_patterns, mission_generation_logs e quiz_questions. Expanda flashcards, user_missions e user_quiz_answers sem quebrar tabelas legadas. Adicione RLS completa, seeds mínimos e backfills. DDL no final de ddl.sql; RLS/policies/seeds/backfills no final de add.sql, criando add.sql se não existir.
```

### Prompt 3: domínio compartilhado, validadores e fixtures

Objetivo: impedir que IA, fallback ou lógica ruim salvem dados inválidos.

Criar módulos puros em `lib/domain/`, por exemplo:

- `categories.ts`
- `xp.ts`
- `missions.ts`
- `profile.ts`
- `impact.ts`
- `validation.ts`
- `facts.ts`

Validadores obrigatórios:

- `validateMissionCandidate`
- `validateMissionPersonalization`
- `validateEnvironmentalGoal`
- `validateFeedbackClassification`
- `validateImpactEstimate`
- `validateProfileFact`
- `getLevelFromXp`
- `getMissionXpReward`

Fixtures mínimos:

- `20` fixtures de missão candidata.
- `10` fixtures de resposta ruim da IA.
- `8` fixtures de feedback.
- Casos obrigatórios:
  - banho com medicamento;
  - pouco dinheiro;
  - pouco tempo;
  - usuário experiente recebendo missão trivial;
  - missão que aumenta consumo;
  - IA omitindo `used_fact_keys`;
  - IA inventando categoria;
  - IA misturando idioma nos campos estruturados;
  - fallback genérico de missão;
  - missão sem `environmental_goal`.

Critérios de aceite:

- Nenhuma missão passa sem objetivo ambiental positivo.
- Nenhuma missão passa sem personalização suficiente.
- Nível por XP usa a tabela deste documento.
- Validadores são usados por código real nos prompts seguintes, não ficam apenas como utilitários mortos.

Prompt para executar:

```text
Crie a camada de domínio compartilhada em lib/domain com categorias, XP, missão, perfil, impacto, fatos e validação. Implemente validadores obrigatórios e fixtures cobrindo os casos críticos de estrategia-rootine.md. Garanta que fallback/IA não consigam salvar missão sem objetivo ambiental, used_fact_keys e personalização suficiente.
```

### Prompt 4: onboarding rico e fatos iniciais

Objetivo: sair do onboarding atual de 5 perguntas para uma base real de personalização.

Onboarding mínimo:

- Ter entre `12` e `14` perguntas.
- Usar opções fechadas sempre que possível.
- Cobrir:
  - moradia;
  - controle sobre água/luz;
  - acesso a cozinha;
  - espaço para armazenar/reutilizar;
  - mobilidade principal;
  - rotina de trabalho/estudo;
  - tempo livre;
  - fricção financeira;
  - restrições alimentares;
  - limitações de saúde/segurança;
  - disposição para mudanças pequenas/médias/grandes;
  - experiência prévia com sustentabilidade;
  - objetivo pessoal dentro do app.

Fatos iniciais:

- Gravar cada resposta em `user_profile_events`.
- Derivar `user_profile_facts` sem IA.
- Manter `profiles.socioeconomic_context` como snapshot compatível.
- Gerar `learned_preferences` e `affinities` como caches determinísticos versionados.
- Não perguntar detalhes médicos sensíveis; permitir resposta ampla de limitação/segurança.

Critérios de aceite:

- Usuário recém-onboarded tem pelo menos `8` facts úteis.
- Nenhum fato crítico vem de IA.
- Onboarding não sugere julgamento moral nem pergunta invasiva demais.
- Fluxo de auth e redirect em `app/_layout.tsx` continua funcionando.

Prompt para executar:

```text
Refatore o onboarding atual de Rootine/app/diagnostic/index.tsx para 12 a 14 perguntas estruturadas. Grave respostas como eventos, derive fatos iniciais sem IA, mantenha socioeconomic_context compatível e gere learned_preferences/affinities como caches determinísticos versionados. O usuário deve terminar com pelo menos 8 facts úteis e o redirect pós-onboarding deve continuar funcionando.
```

### Prompt 5: Aventura com flashcards e quizzes determinísticos

Objetivo: coletar sinais e ensinar sem depender de IA para interpretar texto livre.

Quantidade obrigatória de conteúdo:

- Migrar os 80 flashcards existentes para metadados ou substituir por seed melhor documentado.
- Ter no mínimo `96` flashcards ativos:
  - `16` por categoria (`water`, `energy`, `waste`, `transport`, `food`, `consumption`);
  - por categoria: `8` sobre hábitos, `4` sobre restrições/capacidades, `4` sobre preferências/interesses.
- Criar no mínimo `60` `quiz_questions` ativos:
  - `10` por categoria;
  - cada quiz com `4` alternativas, `1` correta, explicação curta e dificuldade `1` a `5`.

Fluxo:

- A aba/tela `app/(tabs)/flashcards.tsx` deve se chamar **Aventura**.
- Flashcards devem gerar batches balanceados:
  - `10` cards por lote;
  - máximo `3` da mesma categoria por lote;
  - evitar repetir card respondido nos últimos `7` dias.
- `generate-batch` deve usar metadados e histórico, não `sort(() => Math.random() - 0.5)` puro.
- Quizzes devem vir de `quiz_questions` por seleção/ranking determinístico. IA pode ser removida de `generate-quiz` ou usada apenas como variação opcional que nunca é fonte de verdade.
- Respostas de flashcards e quizzes atualizam `user_profile_events` e fatos por regras determinísticas.
- `skip` não cria déficit nem hard block.
- Aventura concede XP com teto diário por `xp_ledger`.

Critérios de aceite:

- Não há batch com os primeiros 10 cards fixos nem seleção puramente aleatória sem balanceamento.
- Cada resposta pode ser explicada por metadados.
- Aventura alimenta perfil sem chamar IA.
- UI deixa de mostrar "Flashcards" como nome principal.

Prompt para executar:

```text
Transforme app/(tabs)/flashcards.tsx na Aventura. Migre/crie seeds para 96 flashcards com metadados e 60 quiz_questions distribuídos por categoria. Refatore generate-batch para lote balanceado de 10 cards com não repetição por 7 dias. Refatore generate-quiz para usar quiz_questions determinísticos. Respostas devem gerar eventos/fatos determinísticos e XP diário limitado por xp_ledger.
```

### Prompt 6: cérebro determinístico e caches legados

Objetivo: remover IA da escrita direta do perfil.

Regras:

- `sync-user-brain` deve processar eventos e metadados.
- `BATCH_COMPLETED`: usar respostas + metadados dos flashcards.
- `QUIZ_COMPLETED`: usar acerto/erro + categoria/dificuldade do quiz.
- `MISSION_ACTION`: usar `completed`, `refused`, `failed`, categoria, dificuldade, pattern e facts usados.
- `FEEDBACK_SENT`: registrar evento bruto; classificação estruturada acontece na edição segura.
- Recusa reduz prioridade do pattern, mas não cria hard block automaticamente.
- Falha sugere diminuir dificuldade/tempo antes de bloquear categoria.
- Caches `learned_preferences`, `affinities` e `socioeconomic_context` devem ser derivados/versionados.
- IA não pode criar campos novos no perfil.
- Não logar `eventContext` completo se ele contiver texto livre sensível.

Critérios de aceite:

- `sync-user-brain` não chama `runJsonAgent` para atualizar `learned_preferences` ou `affinities`.
- Toda atualização de perfil é rastreável até `user_profile_events`.
- `MISSION_ACTION` aceita e trata `FAILED`.
- `agent_interactions` pode continuar registrando chats/agentes, mas perfil canônico vem de eventos/fatos.

Prompt para executar:

```text
Reescreva sync-user-brain como agregador determinístico. Processe batch, quiz, missão completed/refused/failed e feedback bruto usando metadados e eventos. Atualize user_profile_facts, learned_preferences e affinities como caches versionados sem IA. Remova logs de contexto sensível e garanta rastreabilidade até user_profile_events.
```

### Prompt 7: Trilha com mission_patterns hiperpersonalizados

Objetivo: gerar missões adaptadas, sustentáveis e não genéricas.

Quantidade obrigatória de patterns:

- Criar no mínimo `84` `mission_patterns` ativos:
  - `14` por categoria;
  - por categoria:
    - `4` patterns de dificuldade 1;
    - `4` patterns de dificuldade 2;
    - `3` patterns de dificuldade 3;
    - `2` patterns de dificuldade 4;
    - `1` pattern de dificuldade 5.

Cada pattern deve ter:

- `key`;
- `category`;
- `environmental_goal`;
- `difficulty_min` e `difficulty_max`;
- `cost_level`;
- `effort_minutes_min/max`;
- `required_or_helpful_fact_types`;
- `disqualifying_fact_keys`;
- pelo menos `4` `personalization_slots`;
- `action_fingerprint` ou dados suficientes para derivá-lo;
- `impact_model_key`;
- texto base em português para fallback contextual.

Geração:

- A tela `app/(tabs)/adventure.tsx` deve se chamar **Trilha**.
- Manter suporte a `mission_type = daily | specialized`, mas calcular dificuldade/XP por perfil.
- Refatorar `generate-missions` para montar `MissionGenerationContextV1`.
- Filtrar por hard blocks, custo, tempo, dificuldade e histórico.
- Rankear por:
  - ajuste ao perfil;
  - déficit ou oportunidade ambiental;
  - experiência/XP;
  - diversidade de categoria;
  - não repetição;
  - impacto estimado.
- Usar IA como **AI Mission Composer** quando disponível:
  - receber patterns candidatos como blueprints seguros;
  - receber contexto resumido do perfil, fatos, restrições, histórico e sinais recentes;
  - propor `2` a `3` candidatas realmente adaptadas;
  - nunca inventar fatos, hard blocks, custo, XP, categoria canônica, impacto ou dificuldade fora dos limites.
- Validar cada candidata da IA com `validateMissionCandidate`, fingerprints e anti-repetição semântica.
- Se IA falhar, usar fallback contextual do pattern.
- Salvar `pattern_key`, `action_fingerprint`, `used_fact_keys`, `personalization_reason`, `expected_impact`, `xp_reward`, `generation_snapshot` e `mission_generation_logs`.
- Logs `[MISSION_GEN]` e `mission_generation_logs` devem registrar `ai_used`, `ai_stage`, `ai_provider`, `ai_model`, `fallback_reason`, `candidate_count`, `selected_pattern_key`, `selected_action_fingerprint`, validações rejeitadas e motivo resumido.
- Remover fallback genérico do client em `useEcoStore`; se function falhar, mostrar erro/retry sem salvar missão fake.

Critérios de aceite:

- Nenhuma missão salva sem `used_fact_keys`.
- Usuário iniciante com pouco dinheiro recebe missão gratuita e curta.
- Usuário experiente não recebe apenas missão trivial.
- Geração funciona sem chave de IA.
- Com chave de IA, a missão pode ser criativa e não literal ao pattern, mas preserva objetivo ambiental, fatos usados, limites e impacto positivo.
- Missões com textos diferentes mas mesma ação prática são bloqueadas/penalizadas por `action_fingerprint` e similaridade semântica.
- Missões são sustentáveis mesmo quando editadas depois.

Prompt para executar:

```text
Implemente a Trilha hiperpersonalizada em app/(tabs)/adventure.tsx e generate-missions. Crie seeds de 84 mission_patterns conforme estrategia-rootine.md. Gere MissionGenerationContextV1, filtre/rankeie patterns, use IA como AI Mission Composer validado para propor 2-3 candidatas a partir dos blueprints, mantenha fallback contextual sem IA, bloqueie repetição por pattern/action_fingerprint/similaridade e salve pattern_key, action_fingerprint, used_fact_keys, personalization_reason, expected_impact, xp_reward, generation_snapshot e mission_generation_logs com ai_used/fallback_reason claros. Remova fallback genérico do client.
```

### Prompt 8: edição segura de missões

Objetivo: editar missões sem gerar respostas genéricas, literais ou ambientalmente erradas.

Classificação de feedback:

```json
{
  "issue_type": "time | cost | access | health | safety | preference | already_doing | too_easy | too_hard | unclear",
  "constraint_strength": "hard | soft | temporary",
  "blocked_actions": [],
  "allowed_adjustments": [],
  "new_fact_candidates": []
}
```

Regras:

- Feedback é restrição, não objetivo literal.
- IA pode ajudar a classificar, mas validador decide.
- Se classificação falhar, usar fallback conservador.
- Normalizar `issue_type`, `constraint_strength`, categorias, status e fact types usando constantes compartilhadas; nunca salvar variações acentuadas ou livres como `déficit`.
- Editar deve preservar objetivo ambiental ou trocar de pattern/categoria com justificativa.
- A missão editada deve passar pelo mesmo validador anti-genérico.
- A missão editada deve recalcular/validar `expected_impact`, `effort_minutes`, `cost_level`, `difficulty`, `used_fact_keys`, `pattern_key` e `generation_snapshot` ou `edit_snapshot`.
- Caso banho/remédio deve gerar alternativa sustentável segura, nunca "tome banho longo".
- `edit-mission` não deve escrever `learned_preferences` diretamente por IA.
- Feedback útil vira `user_profile_event` e depois fato via agregador determinístico.
- `feedback_notes` deve registrar classificação, texto original resumido e timestamps sem expor dados sensíveis em logs.
- UI deve ter retry/estado recuperável para salvar edição. Se a rede falhar, não deve parecer que a missão foi editada.

Testes/fixtures mínimos:

- `15` fixtures de edição.
- Obrigatórios:
  - banho com remédio;
  - sem dinheiro;
  - sem tempo;
  - não tenho acesso;
  - já faço isso;
  - muito fácil;
  - muito difícil;
  - feedback ambíguo;
  - IA retorna missão genérica;
  - IA retorna missão sem sustentabilidade.

Critérios de aceite:

- Missão editada nunca perde `used_fact_keys`.
- Feedback útil vira fato ou ajuste de prioridade.
- Edição funciona sem IA com fallback.
- Missão editada continua com impacto ambiental positivo.
- Edição não cria schema drift em facts, categorias, status ou action types.
- Edição com falha de rede mantém a missão anterior e mostra retry.

Prompt para executar:

```text
Refatore edit-mission e MissionEditModal para edição segura. Classifique feedback em schema validado e normalizado, trate feedback como restrição, registre evento/fatos quando apropriado, gere alternativa sustentável preservando objetivo ou trocando pattern com justificativa. Não permita IA escrever learned_preferences diretamente. Recalcule/valide impacto, tempo, custo, dificuldade, used_fact_keys, pattern_key e snapshot da edição. Adicione retry/estado recuperável na UI e crie pelo menos 15 fixtures/testes cobrindo os casos obrigatórios e schema drift.
```

### Prompt 9: XP, impacto, conquistas e Habitat

Objetivo: tornar progresso e impacto reais.

Implementar:

- `xp_ledger` idempotente em todos os ganhos.
- Recompensas de XP conforme este documento.
- Cálculo de nível por thresholds.
- `profiles.xp` como cache derivado do ledger.
- `impact_ledger` ao concluir missão.
- `impact_model_key` deve ser resolvido por um modelo versionado por pattern/categoria, com `model_version`, limites `low/mid/high`, unidade e confiança.
- Agregações de impacto por semana, mês e total.
- Pelo menos `12` conquistas ativas:
  - primeira missão;
  - 5 missões;
  - 20 missões;
  - primeira Aventura;
  - 7 dias com interação;
  - 4 categorias diferentes;
  - primeira edição bem-sucedida;
  - missão dificuldade 3;
  - missão dificuldade 4;
  - impacto de água;
  - impacto de resíduos;
  - impacto de CO2/energia.
- `TreeDisplay` por nível + progresso dentro do nível.
- Pelo menos `13` estados/marcos visuais do Habitat, um por nível 0 a 12.
- Remover ou esconder controles de preview da árvore em produção.
- `habitat-leaves` pode continuar gerando mensagens, mas não decide XP/nível.
- Reprocessamento idempotente: se `sync-user-brain`, conclusão de missão ou batch rodar de novo, XP, impacto e conquistas não duplicam.
- Logs `[XP]`, `[IMPACT]` e `[HABITAT]` devem registrar IDs, source_type/source_id, idempotency_key, deltas e totais, sem texto sensível.

Critérios de aceite:

- XP não duplica se a mesma missão/batch/quiz for processado duas vezes.
- Impacto não duplica se a mesma missão for processada duas vezes.
- Árvore não satura em 120 XP.
- Perfil consegue ler totais reais de impacto.
- Conquistas são idempotentes.
- Concluir missão atualiza status, XP, impacto e Habitat de forma consistente.
- `impact_ledger` sempre referencia `mission_id`, `pattern_key`, `impact_model_key` e `model_version`.

Prompt para executar:

```text
Implemente XP, impacto, conquistas e Habitat reais. Use xp_ledger idempotente, recompensas e thresholds definidos em estrategia-rootine.md, profiles.xp como cache derivado, impact_ledger idempotente com modelo de impacto versionado por pattern/categoria e agregações semana/mês/total, pelo menos 12 conquistas idempotentes e 13 marcos visuais de árvore. Refatore TreeDisplay/Habitat para nível + progresso dentro do nível, remova preview em produção e adicione logs [XP]/[IMPACT]/[HABITAT].
```

### Prompt 10: Perfil, Cientista, Biosfera e validação final

Objetivo: completar a experiência final do app.

Perfil deve mostrar:

- XP, nível e progresso.
- Impacto estimado semanal, mensal e total.
- Estatísticas:
  - missões concluídas;
  - missões recusadas;
  - missões failed;
  - taxa de conclusão;
  - categoria mais trabalhada;
  - sequência de dias;
  - XP por período.
- Conquistas reais de `user_achievements`.
- Histórico de missões, Aventura e XP.
- Fatos aprendidos com opção de ocultar/remover/corrigir. Correção deve gerar evento, não editar histórico bruto.
- Validação visual de facts: mostrar origem, confiança, última evidência e permitir reportar/corrigir fact_type incorreto ou interpretação incorreta por evento de correção.
- Cientista.

Cientista:

- Pode responder dúvidas sobre sustentabilidade e progresso do usuário.
- Pode ler fatos/resumos, mas não altera perfil diretamente.
- Deve ter rate limit simples por usuário.
- Deve ter fallback quando IA indisponível.
- Deve deixar claro quando resposta é educativa e não instrução médica/legal/financeira.
- Deve validar JWT/userId.
- Deve usar apenas contexto resumido e fatos/caches permitidos; não deve enviar histórico bruto sensível para IA.
- Deve registrar logs com tamanho da mensagem e IDs/fact keys resumidos, não o texto completo.

Biosfera:

- Manter RSS de notícias/eventos como seção de território, se útil.
- Implementar versão inicial de comunidade com feed simples ou desafios comunitários.
- Criar tabelas necessárias com RLS.
- Usuário pode compartilhar conquista ou marco de impacto.
- Sem ranking competitivo agressivo no MVP.
- Fórum estático atual deve virar dados reais ou ser explicitamente placeholder escondido/dev.

Validação final:

- Rodar lint e validações/testes criados.
- Criar checklist manual com estes cenários:
  - usuário iniciante, pouco tempo, pouco dinheiro;
  - usuário experiente;
  - edição banho/remédio;
  - geração sem IA;
  - conclusão de missão e impacto no Perfil;
  - árvore subindo de nível;
  - tentativa de acessar dados de outro usuário;
  - Aventura gerando facts sem IA;
  - recusa e falha de missão sem hard block;
  - schema drift bloqueado (`deficit`, categorias, status e action types normalizados);
  - retry/erro recuperável em geração, edição e ações de missão;
  - Biosfera respeitando RLS.

Critérios de aceite:

- O estado final listado no início do documento está atendido.
- App funciona sem IA para fluxo principal.
- IA melhora texto/ajuda, mas não é fonte de verdade do perfil.
- Validadores impedem schema drift em campos estruturados.
- Recusas/falhas recentes reduzem prioridade de pattern/categoria sem bloquear tudo.

Prompt para executar:

```text
Finalize Perfil, Cientista e Biosfera. Perfil deve ler ledgers/fatos reais para XP, impacto, estatísticas, conquistas, histórico e correção/ocultação de fatos por evento. Cientista deve ser read-only, com JWT, rate limit, fallback, aviso educativo e contexto resumido sem texto sensível bruto. Biosfera deve ter feed/desafios comunitários com RLS, mantendo RSS como seção opcional. Rode validações e crie checklist manual final cobrindo os cenários de estrategia-rootine.md, incluindo recusa/falha sem hard block, schema drift bloqueado e retry/erro recuperável.
```

### Prompt 11: hardening, observabilidade e qualidade das missões

Objetivo: tornar o sistema robusto para evoluir personalização e impacto sem regressões.

Implementar:

- Testes/fixtures automatizados para:
  - `validateMissionCandidate`;
  - classificação/validação de edição;
  - normalização de facts (`deficit`, categorias, status, action types);
  - `sync-user-brain` para flashcard, quiz, missão completed/refused/failed e feedback;
  - XP/impact/conquistas idempotentes;
  - RLS de tabelas de usuário.
- Métricas/logs de qualidade:
  - taxa de missão concluída, recusada e failed por pattern/categoria;
  - taxa por `action_fingerprint`;
  - repetição semântica;
  - uso de fallback vs IA;
  - taxa de candidatas rejeitadas da IA e motivos;
  - erros de validação;
  - tempo médio de geração;
  - impacto estimado por categoria.
- Ajuste do ranking de `generate-missions`:
  - reduzir prioridade de patterns recusados/falhados recentemente;
  - reduzir prioridade de `action_fingerprint` recusado/falhado recentemente;
  - aplicar cooldown leve por categoria quando houver sequência de recusas/falhas;
  - preservar diversidade sem ignorar fatos importantes;
  - diferenciar `refused` de `failed`.
- Evolução do AI Mission Composer:
  - logs sempre distinguem IA usada de fallback sem IA;
  - prompts usam contexto resumido, sem dados sensíveis brutos;
  - toda candidata IA passa por validação/fingerprint;
  - comparar qualidade entre IA e fallback por conclusão/recusa/falha/impacto.
- Resiliência de rede no app:
  - retry curto e idempotente para gerar, editar, concluir, recusar e falhar missão;
  - estado visual recuperável;
  - evitar remover card/missão antes de confirmação remota quando a ação não for idempotente.
- Observabilidade operacional:
  - dashboard/queries SQL de auditoria para schema drift, logs de geração, patterns repetidos, hard blocks e falhas de RLS;
  - checklist de smoke test pós-deploy.

Critérios de aceite:

- Nenhum campo estruturado aceita valor fora do vocabulário permitido.
- Missões pós-recusa/falha não repetem imediatamente o mesmo pattern nem insistem em uma categoria sem cooldown.
- Missões não repetem imediatamente o mesmo `action_fingerprint`, mesmo com texto diferente.
- Logs e tabelas deixam claro quando IA foi usada e quando fallback sem IA foi usado.
- O app sobrevive a `ERR_NETWORK_CHANGED` sem perder estado visual.
- Métricas permitem saber quais patterns geram impacto, conclusão, recusa e falha.
- Fluxo principal continua funcionando sem IA.

Prompt para executar:

```text
Implemente hardening e observabilidade do Rootine. Crie testes/fixtures para validadores, brain sync, edição, XP/impact/conquistas e RLS. Adicione normalização obrigatória para fields estruturados, métricas/logs de qualidade de missão, action_fingerprint, cooldown por pattern/fingerprint/categoria após refused/failed, comparação IA vs fallback e retry idempotente nas ações críticas do app. Crie queries/checklist de auditoria pós-deploy.
```

## Checklist final do projeto

Antes de considerar o roadmap concluído, verificar:

- Implementação ocorreu em `Rootine/`, não na cópia externa.
- Tabs finais são Habitat, Trilha, Aventura, Perfil e Biosfera.
- Missões são personalizadas por fatos reais e não só por categoria.
- Missões respeitam limitações financeiras, tempo, saúde, segurança e acesso.
- Edição nunca retorna missão genérica ou ambientalmente negativa.
- Missão concluída grava XP e impacto uma única vez.
- Perfil mostra impacto real/estimado com transparência.
- Habitat cresce com curva progressiva.
- Aventura gera aprendizado determinístico.
- IA não escreve perfil canônico.
- Sistema funciona sem IA.
- Campos estruturados não têm schema drift (`deficit`, categorias, status, actions, impact metric keys).
- Recusas/falhas recentes alteram prioridade de patterns sem criar hard block automático.
- Missões têm `action_fingerprint` ou equivalente para evitar duplicatas práticas.
- Logs deixam explícito quando IA foi usada e quando fallback sem IA foi usado.
- App tem retry/estado recuperável para ações críticas em caso de `ERR_NETWORK_CHANGED`.
- Há testes/fixtures para validadores, brain sync, edição, XP, impacto, conquistas e RLS.
- Há queries/logs de auditoria para qualidade das missões e impacto por pattern/categoria.
- Supabase tem RLS nas tabelas de usuário.
- Edge Functions com `userId` validam JWT.
- `ddl.sql` e `add.sql` registram todas as mudanças necessárias.
