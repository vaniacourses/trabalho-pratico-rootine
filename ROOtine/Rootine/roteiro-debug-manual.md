# Roteiro de debug manual do Rootine

Este documento indica quando testar manualmente cada funcionalidade durante a implementação dos 11 prompts de `estrategia-rootine.md`. A ideia é validar blocos de produto assim que ficam minimamente utilizáveis, sem esperar o roadmap inteiro acabar.

## Como usar

- Execute os testes na ordem deste documento.
- Antes de testar, confirme que todos os prompts indicados no checkpoint foram concluídos.
- Use pelo menos dois usuários de teste quando houver RLS, segurança ou personalização:
  - `user_a`: usuário iniciante, pouco tempo, pouco dinheiro.
  - `user_b`: usuário mais experiente, mais tempo ou hábitos sustentáveis prévios.
- Sempre observe três camadas:
  - App/Expo: terminal do `npm start` ou console do ambiente em uso.
  - Supabase Edge Functions: logs das funções chamadas.
  - Banco: tabelas e linhas geradas.
- Se um teste falhar, pare e corrija antes de avançar para o próximo checkpoint. Falhas em perfil, XP, RLS ou geração de missão se acumulam e ficam mais difíceis de depurar depois.

## Padrão de logs esperado

Cada prompt de implementação deve criar logs curtos, úteis e sem dados sensíveis. Os logs devem ter prefixos estáveis para facilitar busca:

- `[AUTH]`: autenticação, sessão e redirecionamento.
- `[NAV]`: tabs, rotas ocultas, redirects e telas protegidas.
- `[RLS]`: testes ou erros de permissão.
- `[ONBOARDING]`: respostas, eventos e fatos iniciais.
- `[ADVENTURE]`: batches, flashcards, quizzes e XP diário.
- `[BRAIN]`: agregação determinística de eventos.
- `[MISSION_GEN]`: geração, ranking, validação, IA e fallback.
- `[MISSION_EDIT]`: classificação de feedback e missão editada.
- `[XP]`: lançamentos no ledger e cache de XP.
- `[IMPACT]`: impacto esperado e impacto lançado.
- `[HABITAT]`: nível, progresso e marco visual.
- `[PROFILE]`: carregamento de estatísticas, histórico, conquistas e fatos.
- `[SCIENTIST]`: chamadas do Cientista, rate limit e fallback.
- `[BIOSPHERE]`: feed, compartilhamento e RLS.

Logs não devem imprimir e-mail, tokens, service role key, JWT, conteúdo completo de prompts ou dados sensíveis de saúde. Quando precisar depurar, usar IDs, contagens, chaves de fato e motivos resumidos.

Do Checkpoint 6 em diante, fluxos com IA ou fallback devem registrar explicitamente `ai_used`, `ai_stage`, `ai_provider`, `ai_model`, `fallback_reason` e `validation_status` quando aplicável. Em geração de missão, também observar `candidate_count`, `selected_pattern_key` e `selected_action_fingerprint`.

## Checkpoint 1: após Prompt 1

Funcionalidade testada: navegação final, autenticação, status de missão e segurança básica das Edge Functions.

Logs para verificar:

- App/Expo: `[AUTH]`, `[NAV]`, `[ECO]` ou equivalente nas telas de Habitat/Trilha/Aventura/Perfil.
- Edge Functions: logs de `generate-batch`, `generate-missions`, `edit-mission`, `sync-user-brain`, especialmente validação de `userId`.
- Banco: `user_missions.status`, `completed_at`, `feedback_notes`.

Passo a passo:

1. Inicie o app.
2. Faça login com `user_a`.
3. Verifique se as tabs visíveis são as finais: Habitat, Trilha, Aventura, Biosfera e Perfil.
4. Confirme que telas exemplo do Expo e placeholder duplicado não aparecem para usuário comum.
5. Confirme que Admin não aparece para usuário comum.
6. Crie ou use uma missão ativa de teste no banco para `user_a`.
7. Abra Trilha e conclua a missão.
8. Verifique no banco se a missão mudou para `completed` e se `completed_at` foi preenchido.
9. Crie ou use outra missão ativa e recuse.
10. Verifique no banco se a missão mudou para `refused`.
11. Envie um feedback simples pela edição ou campo equivalente.
12. Verifique se `feedback_notes` foi salvo como JSON, não string solta.
13. Chame uma Edge Function com `userId` de outro usuário autenticado, se houver forma local de fazer isso com curl/Postman/Supabase console.
14. Confirme que a função bloqueia a chamada e registra log de validação, sem executar a ação.

Resultado esperado:

- Navegação final está coerente.
- Missões mudam para `completed` ou `refused` corretamente.
- `completed_at` e `feedback_notes` estão consistentes.
- Edge Functions não aceitam `userId` de outro usuário.

## Checkpoint 2: após Prompt 2

Funcionalidade testada: estrutura de banco, RLS, seeds mínimos e compatibilidade com o fluxo antigo.

Logs para verificar:

- Supabase SQL editor ou migration output: criação de tabelas e policies sem erro.
- Banco: tabelas novas e policies ativas.
- App/Expo: erros de permissão ou queries quebradas.
- Edge Functions: erros de schema ausente.

Passo a passo:

1. Rode os SQLs adicionados ao final de `ddl.sql` e `add.sql` no ambiente Supabase alvo.
2. Abra o Table Editor e confirme a existência de:
   - `user_profile_events`;
   - `user_profile_facts`;
   - `xp_ledger`;
   - `impact_ledger`;
   - `user_achievements`;
   - `mission_patterns`;
   - `mission_generation_logs`;
   - `quiz_questions`.
3. Confirme que `flashcards` tem metadados novos.
4. Confirme que `user_missions` tem campos novos de categoria, objetivo ambiental, dificuldade, custo, tempo, XP, fatos usados, snapshot e impacto.
5. Como `user_a`, tente ler seus próprios registros em tabelas de usuário.
6. Como `user_a`, tente ler registros de `user_b`.
7. Confirme que a leitura de outro usuário é negada ou retorna vazio.
8. Confirme que catálogos ativos, como `mission_patterns`, `flashcards` e `quiz_questions`, são legíveis.
9. Abra o app e confirme que login, Habitat, Trilha, Aventura e Perfil ainda carregam sem erro fatal.

Resultado esperado:

- Tabelas e campos existem.
- RLS protege dados entre usuários.
- Catálogos públicos autenticados são legíveis.
- O app não quebrou por causa da migração.

## Checkpoint 3: após Prompt 4

Funcionalidade testada: onboarding rico, eventos e fatos iniciais.

Logs para verificar:

- App/Expo: `[ONBOARDING]`.
- Banco: `profiles.socioeconomic_context`, `user_profile_events`, `user_profile_facts`, `profiles.learned_preferences`, `profiles.affinities`.
- Edge Functions: não deve haver chamada de IA para derivar fatos iniciais.

Passo a passo:

1. Crie um usuário novo `user_a`.
2. Responda o onboarding como iniciante:
   - pouco tempo;
   - dinheiro apertado;
   - limitações de acesso ou controle doméstico;
   - pouca experiência sustentável.
3. Termine o onboarding.
4. Verifique nos logs `[ONBOARDING]` que as respostas foram processadas.
5. No banco, abra `user_profile_events` e filtre por `user_a`.
6. Confirme que cada resposta gerou evento.
7. Abra `user_profile_facts` e confirme pelo menos `8` facts úteis.
8. Abra `profiles.socioeconomic_context` e confirme que o snapshot foi atualizado.
9. Abra `profiles.learned_preferences` e `profiles.affinities`.
10. Confirme que os caches têm schema estável e não contêm campos inventados.
11. Repita com `user_b`, respondendo como usuário mais experiente.
12. Compare fatos de `user_a` e `user_b`; eles devem ser claramente diferentes.

Resultado esperado:

- Onboarding gera fatos estruturados sem IA.
- Usuários diferentes geram perfis diferentes.
- O perfil inicial já permite personalização real.

## Checkpoint 4: após Prompt 5

Funcionalidade testada: Aventura com flashcards, quizzes, batch balanceado e aprendizado determinístico.

Logs para verificar:

- App/Expo: `[ADVENTURE]`.
- Edge Functions: `generate-batch`.
- Banco: `flashcards`, `quiz_questions`, `user_daily_flashcards`, `user_flashcards_answers`, `user_profile_events`, `user_profile_facts`, `xp_ledger`.

Passo a passo:

1. Verifique no banco se existem pelo menos `96` flashcards ativos.
2. Confirme que há `16` flashcards por categoria.
3. Verifique se existem pelo menos `60` quizzes ativos.
4. Confirme que há `10` quizzes por categoria.
5. Entre no app como `user_a`.
6. Abra Aventura.
7. Solicite um lote de flashcards.
8. Verifique nos logs `[ADVENTURE]` ou `generate-batch` quais cards foram selecionados.
9. Confirme que o lote tem `10` cards.
10. Confirme no banco que nenhuma categoria aparece mais de `3` vezes no lote.
11. Responda alguns cards com `sim`, alguns com `não` e pelo menos um com `skip`.
12. Complete o lote com pelo menos 70% respondido.
13. Verifique `user_profile_events` para eventos das respostas.
14. Verifique `user_profile_facts` para fatos derivados.
15. Confirme que `skip` não gerou déficit nem hard block.
16. Faça um quiz.
17. Confirme que acerto/erro gera evento e, se aplicável, XP com teto diário.
18. Solicite outro lote no mesmo usuário depois de reset/novo dia de teste.
19. Confirme que cards recentes não repetem se a regra de 7 dias se aplica ao cenário.

Resultado esperado:

- Aventura funciona sem IA.
- Batches são balanceados.
- Respostas atualizam perfil de modo explicável.
- XP diário de Aventura é limitado.

## Checkpoint 5: após Prompt 6

Funcionalidade testada: cérebro determinístico e caches legados.

Logs para verificar:

- Edge Functions: `[BRAIN]`.
- Banco: `user_profile_events`, `user_profile_facts`, `profiles.learned_preferences`, `profiles.affinities`.
- Logs externos: não deve haver chamada para Groq/OpenAI durante atualização de perfil.

Passo a passo:

1. Como `user_a`, complete um lote da Aventura.
2. Aguarde ou dispare o processamento de `sync-user-brain`.
3. Abra logs da função e busque `[BRAIN]`.
4. Confirme que o log mostra eventos processados, contagens e facts atualizados.
5. Confirme que não há log de chamada para Groq/OpenAI nesse fluxo.
6. No banco, verifique `user_profile_facts`.
7. Confirme que os fatos novos têm origem rastreável em eventos.
8. Verifique `profiles.learned_preferences`.
9. Confirme que o cache foi regravado em schema versionado.
10. Verifique `profiles.affinities`.
11. Confirme que as categorias mudaram de forma coerente com respostas e missões.
12. Recuse uma missão ativa.
13. Confirme que a recusa não criou hard block automaticamente.
14. Marque uma missão como `failed`.
15. Confirme que a falha gera ajuste de dificuldade/tempo ou prioridade, não bloqueio total de categoria.

Resultado esperado:

- Perfil é atualizado sem IA.
- Caches são derivados, não inventados.
- Recusa e falha geram sinais proporcionais.

## Checkpoint 6: após Prompt 7

Funcionalidade testada: Trilha com `mission_patterns` hiperpersonalizados, AI Mission Composer validado e fallback determinístico.

Logs para verificar:

- Edge Functions: `[MISSION_GEN]`.
- Banco: `mission_patterns`, `mission_generation_logs`, `user_missions`, `user_profile_facts`.
- App/Expo: logs da Trilha ao gerar, recusar e solicitar nova missão.

Passo a passo:

1. Verifique no banco se existem pelo menos `84` `mission_patterns` ativos.
2. Confirme que há `14` patterns por categoria.
3. Confirme a distribuição por categoria:
   - `4` dificuldade 1;
   - `4` dificuldade 2;
   - `3` dificuldade 3;
   - `2` dificuldade 4;
   - `1` dificuldade 5.
4. Confirme também que cada pattern ativo possui `action_fingerprint`, `impact_model_key` e pelo menos `4` `personalization_slots`.
5. Entre como `user_a`, iniciante, pouco tempo e pouco dinheiro.
6. Gere missão na Trilha.
7. Verifique logs `[MISSION_GEN]`.
8. Confirme que aparecem `candidate_count`, filtros aplicados, ranking, `selected_pattern_key`, `selected_action_fingerprint`, `ai_used` e `fallback_reason` quando aplicável.
9. Abra `user_missions`.
10. Confirme que a missão gerada tem:
   - `category`;
   - `environmental_goal`;
   - `difficulty`;
   - `effort_minutes`;
   - `cost_level`;
   - `xp_reward`;
   - `pattern_key`;
   - `action_fingerprint`;
   - `used_fact_keys`;
   - `personalization_reason`;
   - `generation_snapshot`;
   - `expected_impact`.
11. Confirme que a missão de `user_a` é curta, gratuita e compatível com os facts.
12. Entre como `user_b`, mais experiente.
13. Gere missão.
14. Confirme que a missão não é apenas trivial e usa facts de `user_b`.
15. Se a IA estiver ativa, confirme que o texto final pode variar em relação ao fallback base, mas preserva `category`, `environmental_goal`, facts usados, limites de custo/tempo e impacto positivo.
16. Desative temporariamente a chave de IA no ambiente de teste ou force fallback por flag/configuração, se implementado.
17. Gere missão novamente.
18. Confirme que a geração funciona sem IA, ainda salva `used_fact_keys` e registra `ai_used = false`.
19. Verifique `mission_generation_logs`.
20. Confirme que o log registra candidatas rejeitadas, validações rejeitadas e motivo resumido.
21. Recuse ou marque como `failed` uma missão recém-gerada e solicite outra.
22. Confirme que a nova missão não repete imediatamente o mesmo `pattern_key` nem o mesmo `action_fingerprint`, mesmo se o texto for diferente.

Resultado esperado:

- Missões são personalizadas por fatos reais.
- Missões têm objetivo ambiental, impacto esperado e rastreabilidade até pattern e facts.
- Usuários diferentes recebem missões realmente diferentes.
- Geração sem IA continua válida e contextual.
- Repetição prática da mesma missão é bloqueada ou penalizada.

## Checkpoint 7: após Prompt 8

Funcionalidade testada: edição segura de missões com classificação validada, normalização de schema e retry recuperável.

Logs para verificar:

- Edge Functions: `[MISSION_EDIT]`.
- Banco: `user_missions`, `user_profile_events`, `user_profile_facts`, `mission_generation_logs` ou `edit_snapshot`, se existir.
- App/Expo: logs da modal de edição e do retry.

Passo a passo:

1. Entre como `user_a`.
2. Gere ou escolha uma missão de água relacionada a banho.
3. Edite com o feedback: `Não consigo tomar banhos rápidos porque preciso passar um remédio durante o banho`.
4. Verifique logs `[MISSION_EDIT]`.
5. Confirme que o feedback foi classificado como `health`, com `constraint_strength` compatível, e não como objetivo literal.
6. Confirme no log que aparecem `ai_used`, `validation_status` e `fallback_reason` quando aplicável.
7. Abra a missão editada no app.
8. Confirme que ela não diz para tomar banho longo.
9. Confirme que ela preserva sustentabilidade, por exemplo reduz água corrente onde for seguro.
10. No banco, verifique a missão editada.
11. Confirme que foram preservados ou recalculados corretamente:
   - `used_fact_keys`;
   - `pattern_key`;
   - `expected_impact`;
   - `effort_minutes`;
   - `cost_level`;
   - `difficulty`;
   - `generation_snapshot` ou `edit_snapshot`.
12. Verifique `user_profile_events`.
13. Confirme que o feedback útil gerou evento rastreável.
14. Verifique `user_profile_facts`.
15. Confirme que um novo fato/restrição foi criado ou reforçado.
16. Teste feedback `Não tenho dinheiro para isso`.
17. Confirme que a missão editada vira gratuita ou muda de pattern.
18. Teste feedback `Já faço isso`.
19. Confirme que a missão muda para algo mais avançado ou registra capacidade.
20. Teste feedback ambíguo, como `não dá`.
21. Confirme que o fallback faz adaptação conservadora e não inventa hard block permanente.
22. Inspecione os campos estruturados gravados em fatos, eventos e missão.
23. Confirme que não houve schema drift, como `déficit`, categorias livres, status fora do vocabulário ou action types livres.
24. Simule falha de rede ao salvar a edição, se possível.
25. Confirme que a missão anterior permanece visível, o app mostra retry e não aparenta sucesso falso.
26. Rode os fixtures ou testes criados no Prompt 8, se já existirem, cobrindo pelo menos:
   - banho com remédio;
   - sem dinheiro;
   - sem tempo;
   - sem acesso;
   - já faço isso;
   - muito fácil;
   - muito difícil;
   - feedback ambíguo;
   - IA genérica;
   - IA sem sustentabilidade.

Resultado esperado:

- Feedback vira restrição, preferência ou capacidade quando apropriado.
- Missão editada continua ambientalmente positiva.
- Validação bloqueia saídas genéricas, absurdas ou fora do schema.
- Falha de rede não cria edição fantasma.

## Checkpoint 8: após Prompt 9

Funcionalidade testada: XP, impacto, conquistas e crescimento da árvore com ledgers idempotentes e modelo de impacto versionado.

Logs para verificar:

- App/Expo: `[XP]`, `[IMPACT]`, `[HABITAT]`.
- Banco: `xp_ledger`, `impact_ledger`, `user_achievements`, `achievement_definitions`, `profiles.xp`, `user_missions`.
- Edge Functions: logs da conclusão de missão, processamento de impacto e atualização do Habitat.

Passo a passo:

1. Entre como `user_a`.
2. Anote XP atual, nível atual e progresso atual no Habitat.
3. Conclua uma missão dificuldade 1.
4. Verifique `xp_ledger`.
5. Confirme que há um lançamento de `10 XP` com `source_type`, `source_id` e `idempotency_key`.
6. Tente processar ou concluir a mesma missão novamente, se possível.
7. Confirme que XP não duplicou.
8. Verifique `impact_ledger`.
9. Confirme que há linha de impacto associada à missão com `mission_id`, `pattern_key`, `impact_model_key` e `model_version`.
10. Verifique se `profiles.xp` foi atualizado como cache derivado.
11. Abra Habitat.
12. Confirme que nível e progresso dentro do nível batem com a tabela de XP.
13. Faça lançamentos de teste ou conclua ações suficientes para cruzar pelo menos um nível.
14. Confirme que a árvore muda para o marco visual seguinte.
15. Confirme que existem `13` estados ou marcos visuais possíveis do Habitat, do nível 0 ao 12, e que controles de preview não aparecem em produção.
16. Faça um quiz correto.
17. Confirme que ele rende `2 XP` e respeita o teto diário de `8 XP` vindo de quizzes.
18. Complete um lote de Aventura com pelo menos 70% respondido.
19. Confirme que ele rende `4 XP` uma única vez.
20. Verifique `user_achievements`.
21. Confirme que a conquista de primeira missão foi desbloqueada uma única vez.
22. Confirme também que outras conquistas elegíveis, como primeira Aventura ou impacto em água/resíduos, aparecem sem duplicação.
23. Reprocesse `sync-user-brain`, conclusão de missão ou outro fluxo idempotente, se possível.
24. Confirme que XP, impacto e conquistas não duplicam.
25. Abra Perfil.
26. Confirme que os totais semanal, mensal e total de impacto estão disponíveis para consumo da UI.

Resultado esperado:

- XP é idempotente.
- Impacto é registrado com modelo versionado.
- Conquistas não duplicam.
- Árvore cresce por faixa de nível, não por `xp / 50`.

## Checkpoint 9: após Prompt 10

Funcionalidade testada: Perfil completo, Cientista, Biosfera e validação final end-to-end.

Logs para verificar:

- App/Expo: `[PROFILE]`, `[SCIENTIST]`, `[BIOSPHERE]`, `[RLS]`.
- Edge Functions: logs do Cientista, rate limit e fallback.
- Banco: `impact_ledger`, `xp_ledger`, `user_achievements`, `user_profile_facts`, `user_profile_events` e tabelas reais da Biosfera criadas no Prompt 10.
- RLS: tentativas negadas de acesso entre usuários.

Passo a passo:

1. Entre como `user_a`.
2. Abra Perfil.
3. Confirme que aparecem:
   - XP;
   - nível;
   - progresso;
   - impacto semanal;
   - impacto mensal;
   - impacto total;
   - estatísticas de missão;
   - conquistas;
   - histórico;
   - fatos aprendidos com origem, confiança e última evidência.
4. Oculte, corrija ou reporte um fato aprendido.
5. Confirme no banco que a mudança afeta apenas `user_a`.
6. Confirme que a correção gerou evento novo em `user_profile_events`, sem editar silenciosamente o histórico bruto.
7. Abra Cientista.
8. Pergunte: `Como posso reduzir desperdício de água com pouco tempo?`
9. Verifique se a resposta usa contexto resumido do usuário sem alterar perfil diretamente.
10. Confirme que a resposta mostra aviso educativo quando necessário e não assume papel médico, legal ou financeiro.
11. Faça chamadas repetidas até atingir o limite configurado.
12. Confirme que o rate limit funciona e gera log `[SCIENTIST]`.
13. Simule IA indisponível, se houver flag ou configuração.
14. Confirme que o fallback responde de forma simples, útil e sem quebrar a tela.
15. Verifique os logs do Cientista.
16. Confirme que não há envio de histórico bruto sensível ou prompt completo para os logs.
17. Abra Biosfera.
18. Publique ou compartilhe uma conquista ou marco de impacto.
19. Entre como `user_b`.
20. Confirme que `user_b` vê apenas o que deveria ser público ou comunitário.
21. Tente acessar ou editar dados privados de `user_a`.
22. Confirme que RLS bloqueia.
23. Faça o fluxo completo com `user_a`:
   - Aventura;
   - geração de missão;
   - edição segura;
   - recusa ou falha sem hard block;
   - nova geração;
   - conclusão;
   - XP;
   - impacto no Perfil;
   - árvore evoluindo.
24. Repita geração ou edição de missão com IA desativada.
25. Confirme que o fluxo principal ainda funciona.
26. Verifique visualmente e no banco que schema drift continua bloqueado em `fact_type`, categorias, status e action types.
27. Verifique também que os estados de retry e erro recuperável de gerar, editar, concluir, recusar e falhar missão continuam íntegros no app.

Resultado esperado:

- Perfil mostra impacto, progresso e fatos de forma compreensível e auditável.
- Cientista ajuda sem modificar perfil diretamente.
- Biosfera tem RLS.
- Fluxo principal funciona com e sem IA.

Checklist manual final do Prompt 10:

- `user_a` iniciante, pouco tempo e pouco dinheiro: completar onboarding, Aventura, gerar missão sem IA e confirmar missão compatível com tempo/custo/acesso.
- `user_b` experiente: repetir fluxo e comparar fatos, dificuldade e categoria com `user_a`.
- Edição banho/remédio: pedir adaptação e confirmar que a missão respeita cuidado de saúde sem sugerir alterar medicamento.
- Geração sem IA: remover/desativar segredo de IA em ambiente de teste ou observar fallback; confirmar `ai_used=false` nos logs e missão válida por pattern.
- Conclusão de missão: confirmar `xp_ledger`, `impact_ledger`, conquistas idempotentes, Perfil atualizado e Habitat subindo pela curva de XP.
- Aventura sem IA: responder flashcards/quizzes e confirmar eventos/fatos determinísticos.
- Recusa/falha: recusar e marcar `Não consegui`, gerar nova missão e confirmar que não há hard block total.
- Schema drift: tentar inserir/observar valores fora do vocabulário (`déficit`, categoria inválida, action/status inválido) e confirmar bloqueio/normalização.
- Retry recuperável: simular `ERR_NETWORK_CHANGED` em geração, edição, conclusão, recusa e falha; confirmar estado visual recuperável e ausência de duplicatas.
- RLS: como `user_b`, tentar ler/alterar fatos, ledgers, missões e posts privados/own-only de `user_a`; confirmar bloqueio ou vazio.
- Biosfera: `user_a` publica post/marco público; `user_b` lê o post público, mas não consegue editar/deletar o que não é dele.

## Checkpoint 10: após Prompt 11

Funcionalidade testada: hardening, observabilidade e qualidade das missões.

Logs para verificar:

- App/Expo: logs de retry e estado recuperável em geração, edição, conclusão, recusa e falha de missão.
- Edge Functions: `[MISSION_GEN]`, `[MISSION_EDIT]`, `[BRAIN]`, `[XP]`, `[IMPACT]`, `[RLS]` e logs de auditoria adicionados no Prompt 11.
- Banco: `mission_generation_logs`, `user_profile_facts`, `xp_ledger`, `impact_ledger` e queries ou views de auditoria criadas para pós-deploy.
- Automação: `npm run lint`, `npx tsc --noEmit` e testes ou fixtures adicionados no Prompt 11.

Passo a passo:

1. Rode `npm run lint`.
2. Rode `npx tsc --noEmit`.
3. Rode os testes ou fixtures adicionados no Prompt 11 para:
   - `validateMissionCandidate`;
   - classificação e validação de edição;
   - normalização de facts, categorias, status e action types;
   - `sync-user-brain`;
   - XP, impacto e conquistas idempotentes;
   - RLS.
4. Inspecione amostras recentes de dados no banco.
5. Confirme que nenhum campo estruturado foi salvo fora do vocabulário permitido.
6. Gere uma missão, recuse e gere outra.
7. Confirme que o mesmo `pattern_key` e o mesmo `action_fingerprint` não se repetem imediatamente.
8. Gere outra missão, marque como `failed` e gere novamente.
9. Confirme que há cooldown ou redução de prioridade proporcionais, sem bloquear toda a categoria de forma brusca.
10. Com IA ativa, verifique logs `[MISSION_GEN]`.
11. Confirme que aparecem `ai_used = true`, candidatas rejeitadas e motivos de rejeição ou fallback.
12. Com IA desativada, gere missão novamente.
13. Confirme que aparece `ai_used = false` e `fallback_reason` claro.
14. Consulte as queries, views ou relatórios criados no Prompt 11.
15. Confirme que é possível enxergar:
   - taxa de missão concluída por `pattern_key`;
   - taxa de missão recusada e `failed` por categoria;
   - repetição por `action_fingerprint`;
   - uso de fallback vs IA;
   - erros de validação;
   - tempo médio de geração.
16. Simule falha transitória de rede, como `ERR_NETWORK_CHANGED`, durante:
   - gerar missão;
   - editar missão;
   - concluir missão;
   - recusar missão;
   - marcar como `failed`.
17. Confirme que o app oferece retry curto, preserva estado visual e não cria escrita duplicada nem remoção fantasma.
18. Rode o smoke test pós-deploy completo:
   - login;
   - Aventura;
   - geração de missão;
   - edição;
   - conclusão;
   - impacto no Perfil;
   - compartilhamento na Biosfera.

Resultado esperado:

- Validadores bloqueiam schema drift.
- Missões pós-recusa ou pós-falha não insistem na mesma ação prática.
- Logs distinguem com clareza IA e fallback.
- O app sobrevive a falhas transitórias sem perder consistência visual ou duplicar efeitos.
- Métricas permitem auditar qualidade, repetição e impacto das missões.

## Sinais de alerta

Se algum item abaixo acontecer, não avance para o próximo checkpoint:

- Missão salva sem `used_fact_keys`.
- Missão salva sem `environmental_goal`.
- Missão salva sem `pattern_key` ou sem `action_fingerprint`.
- Edição transforma limitação em objetivo literal.
- Edição ou geração falha na rede e o app aparenta sucesso mesmo sem confirmação remota.
- IA altera `learned_preferences` ou `affinities` diretamente.
- Log de geração ou edição com IA não informa `ai_used` ou `fallback_reason`.
- Campo estruturado aparece com variação livre, como `déficit`, categoria inválida, status inválido ou action type inventado.
- Mesmo `action_fingerprint` reaparece logo após `refused` ou `failed`.
- XP duplica ao reprocessar uma ação.
- Impacto aparece no Perfil sem linha correspondente em `impact_ledger` ou sem `impact_model_key` e `model_version`.
- Usuário consegue ler ou alterar dados privados de outro usuário.
- Correção de fato altera histórico bruto sem criar evento de correção.
- Fallback sem IA gera missão genérica.
- Uma única recusa ou falha cria hard block total de categoria.
- Árvore muda rápido demais ou não muda ao cruzar threshold.
