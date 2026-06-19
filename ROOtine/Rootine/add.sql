-- ============================================================================
-- PROMPT 2 - RLS, POLICIES, SEEDS E BACKFILLS PARA EXECUTAR NO SUPABASE
-- Data: 2026-06-07
--
-- Execute este arquivo depois do bloco "PROMPT 2 - SCRIPT INCREMENTAL" que está
-- no final de ddl.sql.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Compatibilidade de cadastro: funciona com profiles.name (print real) e com
-- profiles.nome (legado local).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  display_name text;
BEGIN
  display_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'Guardião'
  );

  INSERT INTO public.profiles (
    id,
    name,
    nome,
    xp,
    onboarding_completed,
    daily_flashcards_completed,
    created_at
  )
  VALUES (
    NEW.id,
    display_name,
    display_name,
    1,
    false,
    false,
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Backfills obrigatórios e de compatibilidade.
-- ---------------------------------------------------------------------------
UPDATE public.profiles
SET
  name = COALESCE(name, nome, 'Guardião'),
  nome = COALESCE(nome, name, 'Guardião'),
  xp = COALESCE(xp, 1),
  onboarding_completed = COALESCE(onboarding_completed, false),
  daily_flashcards_completed = COALESCE(daily_flashcards_completed, false),
  impact_totals = COALESCE(impact_totals, '{"co2_kg":0,"water_l":0,"waste_g":0}'::jsonb);

UPDATE public.user_missions
SET mission_type = COALESCE(mission_type, 'daily'::public.mission_type_enum);

UPDATE public.user_missions
SET
  used_fact_keys = COALESCE(used_fact_keys, '{}'::text[]),
  generation_snapshot = COALESCE(generation_snapshot, '{}'::jsonb),
  expected_impact = COALESCE(expected_impact, '{}'::jsonb);

ALTER TABLE public.user_missions
  ALTER COLUMN mission_type SET DEFAULT 'daily'::public.mission_type_enum,
  ALTER COLUMN mission_type SET NOT NULL,
  ALTER COLUMN used_fact_keys SET DEFAULT '{}'::text[],
  ALTER COLUMN used_fact_keys SET NOT NULL,
  ALTER COLUMN generation_snapshot SET DEFAULT '{}'::jsonb,
  ALTER COLUMN generation_snapshot SET NOT NULL,
  ALTER COLUMN expected_impact SET DEFAULT '{}'::jsonb,
  ALTER COLUMN expected_impact SET NOT NULL;

UPDATE public.user_missions
SET category = ai_justification->>'category'
WHERE category IS NULL
  AND ai_justification IS NOT NULL
  AND ai_justification ? 'category'
  AND ai_justification->>'category' IN ('water','energy','waste','transport','food','consumption');

UPDATE public.user_missions
SET feedback_notes =
  feedback_notes ||
  jsonb_build_object(
    'source', COALESCE(feedback_notes->>'source', 'legacy'),
    'created_at', COALESCE(feedback_notes->'created_at', to_jsonb(COALESCE(created_at, now())))
  )
WHERE feedback_notes IS NOT NULL
  AND jsonb_typeof(feedback_notes) = 'object'
  AND feedback_notes ? 'text'
  AND (NOT feedback_notes ? 'source' OR NOT feedback_notes ? 'created_at');

UPDATE public.flashcards
SET
  active = COALESCE(active, true),
  difficulty = COALESCE(difficulty, 1),
  weight = COALESCE(weight, 1),
  true_effect = COALESCE(true_effect, '{}'::jsonb),
  false_effect = COALESCE(false_effect, '{}'::jsonb),
  skip_effect = COALESCE(skip_effect, '{}'::jsonb);

ALTER TABLE public.flashcards
  ALTER COLUMN active SET DEFAULT true,
  ALTER COLUMN active SET NOT NULL,
  ALTER COLUMN difficulty SET DEFAULT 1,
  ALTER COLUMN difficulty SET NOT NULL,
  ALTER COLUMN weight SET DEFAULT 1,
  ALTER COLUMN weight SET NOT NULL,
  ALTER COLUMN true_effect SET DEFAULT '{}'::jsonb,
  ALTER COLUMN true_effect SET NOT NULL,
  ALTER COLUMN false_effect SET DEFAULT '{}'::jsonb,
  ALTER COLUMN false_effect SET NOT NULL,
  ALTER COLUMN skip_effect SET DEFAULT '{}'::jsonb,
  ALTER COLUMN skip_effect SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Seeds minimos obrigatorios.
-- ---------------------------------------------------------------------------
INSERT INTO public.sustainability_categories (key, label_pt, description, sort_order)
VALUES
  ('water', 'Água', 'Uso responsável de água, desperdício e reutilização segura.', 10),
  ('energy', 'Energia', 'Eletricidade, eficiência, aparelhos e conforto térmico.', 20),
  ('waste', 'Resíduos', 'Separação, descarte correto, compostagem e redução de lixo.', 30),
  ('transport', 'Transporte', 'Mobilidade, deslocamentos e emissões evitáveis.', 40),
  ('food', 'Alimentação', 'Compra, preparo, desperdício e escolhas alimentares.', 50),
  ('consumption', 'Consumo', 'Compras, reutilização, reparo e vida útil de objetos.', 60)
ON CONFLICT (key) DO UPDATE SET
  label_pt = EXCLUDED.label_pt,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = true;

INSERT INTO public.achievement_definitions
  (key, title, description, xp_reward, category, criteria, sort_order)
VALUES
  (
    'onboarding_complete',
    'Primeira raiz',
    'Completou o diagnóstico inicial.',
    15,
    'consumption',
    '{"event_type":"ONBOARDING_COMPLETED"}'::jsonb,
    10
  ),
  (
    'first_adventure_batch',
    'Semente de aventura',
    'Concluiu o primeiro lote da Aventura com respostas suficientes.',
    15,
    'consumption',
    '{"event_type":"BATCH_COMPLETED","min_answer_ratio":0.7}'::jsonb,
    20
  ),
  (
    'first_mission_completed',
    'Primeira missão viva',
    'Concluiu a primeira missão da Trilha.',
    20,
    'consumption',
    '{"event_type":"MISSION_ACTION","mission_action":"COMPLETED","count":1}'::jsonb,
    30
  ),
  (
    'three_missions_completed',
    'Trilha consistente',
    'Concluiu três missões e começou a formar constância.',
    35,
    'consumption',
    '{"event_type":"MISSION_ACTION","mission_action":"COMPLETED","count":3}'::jsonb,
    40
  ),
  (
    'first_feedback',
    'Voz do território',
    'Enviou feedback para melhorar a adaptação das missões.',
    15,
    'consumption',
    '{"event_type":"FEEDBACK_SENT","count":1}'::jsonb,
    50
  ),
  (
    'quiz_streak_3',
    'Guardião curioso',
    'Acertou três quizzes da Aventura.',
    20,
    'consumption',
    '{"event_type":"QUIZ_COMPLETED","correct_count":3}'::jsonb,
    60
  ),
  (
    'water_saver_seed',
    'Cuidado com a água',
    'Concluiu uma missão ou atividade ligada à economia de água.',
    20,
    'water',
    '{"category":"water","completed_count":1}'::jsonb,
    70
  ),
  (
    'habitat_level_3',
    'Muda firme',
    'Alcançou o nível 3 do Habitat pela curva de XP.',
    30,
    'consumption',
    '{"min_level":3}'::jsonb,
    80
  )
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  xp_reward = EXCLUDED.xp_reward,
  category = EXCLUDED.category,
  criteria = EXCLUDED.criteria,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- updated_at helper.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rootine_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profile_facts_touch_updated_at ON public.user_profile_facts;
CREATE TRIGGER user_profile_facts_touch_updated_at
  BEFORE UPDATE ON public.user_profile_facts
  FOR EACH ROW
  EXECUTE FUNCTION public.rootine_touch_updated_at();

DROP TRIGGER IF EXISTS achievement_definitions_touch_updated_at ON public.achievement_definitions;
CREATE TRIGGER achievement_definitions_touch_updated_at
  BEFORE UPDATE ON public.achievement_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.rootine_touch_updated_at();

DROP TRIGGER IF EXISTS mission_patterns_touch_updated_at ON public.mission_patterns;
CREATE TRIGGER mission_patterns_touch_updated_at
  BEFORE UPDATE ON public.mission_patterns
  FOR EACH ROW
  EXECUTE FUNCTION public.rootine_touch_updated_at();

DROP TRIGGER IF EXISTS quiz_questions_touch_updated_at ON public.quiz_questions;
CREATE TRIGGER quiz_questions_touch_updated_at
  BEFORE UPDATE ON public.quiz_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.rootine_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_flashcards_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quiz_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habitat_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profile_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profile_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impact_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_generation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sustainability_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;

-- Perfil.
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Missoes do proprio usuario. Criacao segue por Edge Function/service role.
DROP POLICY IF EXISTS user_missions_select_own ON public.user_missions;
CREATE POLICY user_missions_select_own
  ON public.user_missions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_missions_update_own ON public.user_missions;
CREATE POLICY user_missions_update_own
  ON public.user_missions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Aventura: batches e respostas proprias.
DROP POLICY IF EXISTS user_daily_flashcards_select_own ON public.user_daily_flashcards;
CREATE POLICY user_daily_flashcards_select_own
  ON public.user_daily_flashcards FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_daily_flashcards_insert_own ON public.user_daily_flashcards;
CREATE POLICY user_daily_flashcards_insert_own
  ON public.user_daily_flashcards FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_daily_flashcards_update_own ON public.user_daily_flashcards;
CREATE POLICY user_daily_flashcards_update_own
  ON public.user_daily_flashcards FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_flashcards_answers_select_own ON public.user_flashcards_answers;
CREATE POLICY user_flashcards_answers_select_own
  ON public.user_flashcards_answers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_flashcards_answers_insert_own ON public.user_flashcards_answers;
CREATE POLICY user_flashcards_answers_insert_own
  ON public.user_flashcards_answers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_flashcards_answers_update_own ON public.user_flashcards_answers;
CREATE POLICY user_flashcards_answers_update_own
  ON public.user_flashcards_answers FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Quizzes legados gerados e respostas.
DROP POLICY IF EXISTS quizzes_select_own ON public.quizzes;
CREATE POLICY quizzes_select_own
  ON public.quizzes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_quiz_answers_select_own ON public.user_quiz_answers;
CREATE POLICY user_quiz_answers_select_own
  ON public.user_quiz_answers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_quiz_answers_insert_own ON public.user_quiz_answers;
CREATE POLICY user_quiz_answers_insert_own
  ON public.user_quiz_answers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Eventos: o cliente pode inserir eventos proprios; tabelas sensiveis
-- derivadas ficam read-only para usuario e escrita por Edge/service role.
DROP POLICY IF EXISTS user_profile_events_select_own ON public.user_profile_events;
CREATE POLICY user_profile_events_select_own
  ON public.user_profile_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_profile_events_insert_own ON public.user_profile_events;
CREATE POLICY user_profile_events_insert_own
  ON public.user_profile_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_profile_facts_select_own ON public.user_profile_facts;
CREATE POLICY user_profile_facts_select_own
  ON public.user_profile_facts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS xp_ledger_select_own ON public.xp_ledger;
CREATE POLICY xp_ledger_select_own
  ON public.xp_ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS impact_ledger_select_own ON public.impact_ledger;
CREATE POLICY impact_ledger_select_own
  ON public.impact_ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_achievements_select_own ON public.user_achievements;
CREATE POLICY user_achievements_select_own
  ON public.user_achievements FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS habitat_leaves_select_own ON public.habitat_leaves;
CREATE POLICY habitat_leaves_select_own
  ON public.habitat_leaves FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS agent_interactions_select_own ON public.agent_interactions;
CREATE POLICY agent_interactions_select_own
  ON public.agent_interactions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS mission_generation_logs_select_own ON public.mission_generation_logs;
CREATE POLICY mission_generation_logs_select_own
  ON public.mission_generation_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Catalogos ativos.
DROP POLICY IF EXISTS sustainability_categories_select_active ON public.sustainability_categories;
CREATE POLICY sustainability_categories_select_active
  ON public.sustainability_categories FOR SELECT TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS mission_patterns_select_active ON public.mission_patterns;
CREATE POLICY mission_patterns_select_active
  ON public.mission_patterns FOR SELECT TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS flashcards_select_active ON public.flashcards;
CREATE POLICY flashcards_select_active
  ON public.flashcards FOR SELECT TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS quiz_questions_select_active ON public.quiz_questions;
CREATE POLICY quiz_questions_select_active
  ON public.quiz_questions FOR SELECT TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS achievement_definitions_select_active ON public.achievement_definitions;
CREATE POLICY achievement_definitions_select_active
  ON public.achievement_definitions FOR SELECT TO authenticated
  USING (active = true);

-- Validacao de constraints NOT VALID adicionadas pelo bloco DDL.
ALTER TABLE public.flashcards VALIDATE CONSTRAINT flashcards_category_check;
ALTER TABLE public.flashcards VALIDATE CONSTRAINT flashcards_difficulty_check;
ALTER TABLE public.user_missions VALIDATE CONSTRAINT user_missions_category_check;
ALTER TABLE public.user_missions VALIDATE CONSTRAINT user_missions_difficulty_check;
ALTER TABLE public.user_missions VALIDATE CONSTRAINT user_missions_effort_minutes_check;
ALTER TABLE public.user_missions VALIDATE CONSTRAINT user_missions_cost_level_check;
ALTER TABLE public.user_missions VALIDATE CONSTRAINT user_missions_xp_reward_check;
ALTER TABLE public.user_missions VALIDATE CONSTRAINT user_missions_pattern_key_fk;
ALTER TABLE public.user_quiz_answers VALIDATE CONSTRAINT user_quiz_answers_quiz_question_id_fk;

COMMIT;

-- ============================================================================
-- PROMPT 7 - Trilha hiperpersonalizada: 84 mission_patterns.
-- Execute este bloco no Supabase depois do schema do Prompt 2.
-- ============================================================================
BEGIN;

WITH raw_patterns(category, pattern_key, difficulty, fallback_title_pt, action_pt, impact_model_key, recurrence_allowed) AS (
  VALUES
    ('water', 'water.close_tap_brushing', 1, 'Torneira fechada na escovação', 'ao escovar os dentes hoje, feche a torneira durante a escovação e abra apenas para enxaguar', 'water_tap_low', false),
    ('water', 'water.check_visible_leak', 1, 'Caça-vazamento visível', 'observe por até 3 minutos torneira, descarga ou chuveiro e anote se há gotejamento visível', 'water_leak_observation', false),
    ('water', 'water.dishes_tap_closed', 1, 'Louça com torneira em pausa', 'em uma lavagem de louça, ensaboe com a torneira fechada e enxágue tudo de uma vez', 'water_dishes_low', false),
    ('water', 'water.bucket_quick_cleaning', 1, 'Balde antes da mangueira', 'se precisar limpar uma pequena área, use balde ou pano em vez de água corrente contínua', 'water_bucket_low', false),
    ('water', 'water.shower_pause_safe', 2, 'Pausa segura no banho', 'durante uma etapa segura do banho, pause a água por até 1 minuto sem alterar cuidados de saúde ou segurança', 'water_shower_pause', false),
    ('water', 'water.laundry_full_load', 2, 'Carga adequada de roupas', 'junte roupas compatíveis para evitar ligar a máquina quase vazia', 'water_laundry_load', false),
    ('water', 'water.reuse_clean_water_plants', 2, 'Reutilização segura de água limpa', 'reaproveite água limpa e sem produto perigoso para regar uma planta ou limpar uma área simples', 'water_safe_reuse', false),
    ('water', 'water.shared_home_water_rule', 2, 'Acordo pequeno de água', 'combine uma regra simples de água com alguém da casa, como fechar torneira ao ensaboar', 'water_shared_rule', false),
    ('water', 'water.map_water_waste_points', 3, 'Mapa de desperdício de água', 'liste três momentos da rotina em que a água fica aberta sem necessidade e escolha um para reduzir', 'water_waste_map', false),
    ('water', 'water.rainwater_safe_use_plan', 3, 'Plano seguro de água da chuva', 'identifique uma forma segura e não potável de usar água da chuva quando ela estiver disponível', 'water_rain_plan', false),
    ('water', 'water.bill_observation', 3, 'Observação da conta de água', 'se tiver acesso, observe a conta ou medidor de água e registre um dado simples para acompanhar tendência', 'water_bill_observation', false),
    ('water', 'water.fixture_flow_test', 4, 'Teste de fluxo consciente', 'meça por um minuto o fluxo de uma torneira com recipiente e use esse dado para escolher onde reduzir tempo aberto', 'water_flow_test', false),
    ('water', 'water.household_micro_agreement', 4, 'Microacordo doméstico de água', 'proponha um acordo doméstico de uma semana para reduzir um desperdício de água observável', 'water_household_agreement', false),
    ('water', 'water.weekly_reduction_protocol', 5, 'Protocolo semanal de água', 'monte um plano de sete dias com uma ação pequena por dia para reduzir água sem comprometer higiene ou saúde', 'water_weekly_protocol', false),

    ('energy', 'energy.turn_off_idle_light', 1, 'Luz apagada em cômodo vazio', 'ao sair de um cômodo vazio, apague a luz e mantenha esse hábito durante o dia', 'energy_lights_low', false),
    ('energy', 'energy.unplug_one_standby_device', 1, 'Um aparelho fora do stand-by', 'desligue da tomada um aparelho seguro que ficaria horas sem uso', 'energy_standby_low', false),
    ('energy', 'energy.natural_light_window', 1, 'Luz natural primeiro', 'antes de acender lâmpadas de dia, abra cortina ou janela segura para aproveitar luz natural', 'energy_natural_light', false),
    ('energy', 'energy.charger_outlet_check', 1, 'Carregador sem carga fora da tomada', 'retire carregadores que não estão carregando nada, se a tomada estiver em local seguro', 'energy_charger_low', false),
    ('energy', 'energy.ventilation_before_ac', 2, 'Ventilação antes do ar-condicionado', 'teste ventilação natural ou ventilador antes de ligar ar-condicionado quando o clima permitir', 'energy_ac_avoidance', false),
    ('energy', 'energy.fridge_opening_timer', 2, 'Geladeira aberta por menos tempo', 'antes de abrir a geladeira, decida o que precisa para reduzir o tempo de porta aberta', 'energy_fridge_low', false),
    ('energy', 'energy.full_laundry_energy', 2, 'Lavagem com energia melhor aproveitada', 'evite ligar máquina de lavar com poucas peças e programe uma carga adequada', 'energy_laundry_load', false),
    ('energy', 'energy.peak_hour_shift', 2, 'Consumo fora do pico', 'se for seguro e viável, adie um uso elétrico não urgente para fora do horário de pico', 'energy_peak_shift', false),
    ('energy', 'energy.device_efficiency_routine', 3, 'Rotina eficiente de aparelho', 'escolha um aparelho usado todo dia e aplique uma configuração de economia sem perder funcionalidade', 'energy_device_efficiency', false),
    ('energy', 'energy.shared_light_agreement', 3, 'Combinado de luz compartilhada', 'combine com a casa uma regra visível para apagar luzes de espaços vazios', 'energy_shared_lights', false),
    ('energy', 'energy.screen_brightness_schedule', 3, 'Brilho de tela consciente', 'ajuste o brilho de uma tela para o menor nível confortável em dois períodos do dia', 'energy_screen_brightness', false),
    ('energy', 'energy.appliance_use_audit', 4, 'Auditoria simples de aparelhos', 'liste três aparelhos que ficam ligados e escolha um uso que pode ser reduzido com segurança', 'energy_appliance_audit', false),
    ('energy', 'energy.thermal_comfort_plan', 4, 'Plano de conforto térmico gradual', 'teste uma alternativa de conforto térmico antes de aumentar consumo elétrico', 'energy_thermal_plan', false),
    ('energy', 'energy.weekly_protocol', 5, 'Protocolo semanal de energia', 'monte um plano de sete dias para reduzir stand-by, luzes e uso de aparelhos sem risco elétrico', 'energy_weekly_protocol', false),

    ('waste', 'waste.separate_one_recyclable', 1, 'Um reciclável separado', 'separe uma categoria simples de reciclável limpo do lixo comum quando houver destino possível', 'waste_recycle_low', false),
    ('waste', 'waste.refuse_extra_disposable', 1, 'Descartável extra recusado', 'recuse um item descartável extra que você não precisa, como talher, canudo ou sachê', 'waste_disposable_avoid', false),
    ('waste', 'waste.battery_collection_spot', 1, 'Ponto de pilhas localizado', 'identifique um ponto próximo para descarte de pilhas, baterias ou eletrônicos pequenos', 'waste_battery_route', false),
    ('waste', 'waste.oil_disposal_container', 1, 'Óleo longe da pia', 'se tiver óleo usado, reserve em recipiente fechado para descarte adequado em vez de jogar na pia', 'waste_oil_disposal', false),
    ('waste', 'waste.clean_recyclables_low_water', 2, 'Reciclável limpo sem excesso de água', 'limpe um reciclável apenas o suficiente para não contaminar outros materiais', 'waste_clean_recycle', false),
    ('waste', 'waste.reusable_bag_ready', 2, 'Sacola reutilizável pronta', 'deixe uma sacola reutilizável em local visível para a próxima compra', 'waste_reusable_bag', false),
    ('waste', 'waste.packaging_reuse', 2, 'Embalagem com segunda função', 'reutilize uma embalagem limpa e segura antes de descartá-la', 'waste_packaging_reuse', false),
    ('waste', 'waste.donate_one_item', 2, 'Um item em bom estado circulando', 'separe um item em bom estado para doar, vender ou trocar em vez de descartar', 'waste_donation', false),
    ('waste', 'waste.home_sorting_zone', 3, 'Zona pequena de separação', 'crie um ponto pequeno e organizado para separar resíduos que tenham destino viável', 'waste_sorting_zone', false),
    ('waste', 'waste.local_collection_route', 3, 'Rota de coleta local', 'descubra uma rota ou dia de coleta para recicláveis ou resíduos especiais perto de você', 'waste_collection_route', false),
    ('waste', 'waste.organic_waste_observation', 3, 'Observação de orgânicos', 'observe por um dia quais restos orgânicos aparecem mais e escolha um jeito de reduzir desperdício', 'waste_organic_observation', false),
    ('waste', 'waste.hazardous_waste_plan', 4, 'Plano de resíduo perigoso', 'liste pilhas, eletrônicos, tinta ou remédios vencidos e defina um destino seguro para um deles', 'waste_hazardous_plan', false),
    ('waste', 'waste.shared_recycling_agreement', 4, 'Acordo de reciclagem compartilhada', 'combine com a casa uma regra simples para não misturar orgânico com reciclável limpo', 'waste_shared_agreement', false),
    ('waste', 'waste.weekly_reduction_system', 5, 'Sistema semanal de menos lixo', 'monte um sistema de sete dias para recusar descartáveis, separar recicláveis e reduzir desperdício', 'waste_weekly_system', false),

    ('transport', 'transport.combine_errands', 1, 'Duas tarefas em uma saída', 'combine duas tarefas próximas em uma saída para evitar deslocamento extra', 'transport_trip_combine', false),
    ('transport', 'transport.short_walk_safe', 1, 'Trajeto curto sem motor', 'se for seguro, faça um trajeto curto a pé ou de bicicleta em vez de usar carro ou moto', 'transport_short_active', false),
    ('transport', 'transport.remote_errand_replace', 1, 'Tarefa resolvida sem deslocamento', 'resolva uma tarefa simples online ou por mensagem quando isso substituir uma ida desnecessária', 'transport_remote_errand', false),
    ('transport', 'transport.idling_off_reminder', 1, 'Motor parado desligado', 'evite deixar motor ligado parado enquanto espera, quando estiver sob seu controle e for seguro', 'transport_idling_off', false),
    ('transport', 'transport.public_option_check', 2, 'Opção de transporte público checada', 'verifique uma alternativa de transporte público para um trajeto recorrente', 'transport_public_check', false),
    ('transport', 'transport.route_distance_check', 2, 'Rota mais curta observada', 'compare uma rota recorrente e veja se há caminho mais curto, seguro ou com menos deslocamento', 'transport_route_distance', false),
    ('transport', 'transport.local_service_choice', 2, 'Serviço mais perto primeiro', 'antes de escolher um serviço, veja se existe opção próxima que evite uma viagem maior', 'transport_local_service', false),
    ('transport', 'transport.shared_ride_check', 2, 'Carona sem viagem extra', 'avalie se uma carona segura pode substituir duas viagens separadas sem criar deslocamento novo', 'transport_shared_ride', false),
    ('transport', 'transport.bike_walk_feasibility', 3, 'Viabilidade de caminhada ou bike', 'avalie distância, segurança, clima e energia antes de escolher caminhada ou bicicleta para um trajeto', 'transport_active_feasibility', false),
    ('transport', 'transport.peak_adjustment', 3, 'Horário de deslocamento ajustado', 'se sua rotina permitir, teste sair em horário que reduza congestionamento ou espera', 'transport_peak_adjustment', false),
    ('transport', 'transport.trip_log_reflection', 3, 'Diário de deslocamentos', 'registre seus deslocamentos de um dia e marque um que poderia ser reduzido ou combinado', 'transport_trip_log', false),
    ('transport', 'transport.low_carbon_week_plan', 4, 'Semana com menos carbono no trajeto', 'planeje uma troca de deslocamento de baixo carbono para um dia da semana', 'transport_week_plan', false),
    ('transport', 'transport.mobility_safety_map', 4, 'Mapa de mobilidade segura', 'mapeie um trajeto seguro, curto e viável antes de trocar o modo de transporte', 'transport_safety_map', false),
    ('transport', 'transport.carbon_reduction_protocol', 5, 'Protocolo de deslocamento de baixo carbono', 'monte um plano de sete dias para combinar viagens, evitar motor parado e testar alternativas seguras', 'transport_weekly_protocol', false),

    ('food', 'food.shopping_list', 1, 'Lista contra desperdício', 'antes de comprar comida, faça uma lista curta baseada no que já existe em casa', 'food_shopping_list', false),
    ('food', 'food.use_leftovers', 1, 'Sobra segura reaproveitada', 'use uma sobra segura em uma refeição simples antes de comprar ou pedir mais comida', 'food_leftovers', false),
    ('food', 'food.check_expiry', 1, 'Validade conferida antes do descarte', 'confira validade, cheiro e condição de um alimento antes de descartar ou comprar outro', 'food_expiry_check', false),
    ('food', 'food.seasonal_choice', 1, 'Escolha da época', 'se for comprar alimento fresco, escolha uma opção da época ou local quando couber no orçamento', 'food_seasonal_choice', false),
    ('food', 'food.store_food_better', 2, 'Alimento guardado para durar', 'guarde um alimento de forma mais adequada para reduzir chance de estragar', 'food_storage', false),
    ('food', 'food.delivery_no_extras', 2, 'Delivery sem extras', 'se pedir comida, dispense talheres, sachês ou itens extras que não serão usados', 'food_delivery_extras', false),
    ('food', 'food.simple_low_cost_recipe', 2, 'Receita simples de baixo custo', 'prepare ou planeje uma refeição simples usando algo que você já tem', 'food_simple_recipe', false),
    ('food', 'food.plant_forward_meal', 2, 'Refeição com mais vegetais viáveis', 'inclua mais vegetais em uma refeição quando isso respeitar acesso, cultura, saúde e orçamento', 'food_plant_forward', false),
    ('food', 'food.two_day_meal_plan', 3, 'Plano de comida para dois dias', 'planeje duas refeições para aproveitar ingredientes antes que estraguem', 'food_two_day_plan', false),
    ('food', 'food.fridge_inventory', 3, 'Inventário rápido da geladeira', 'faça um inventário de até cinco itens da geladeira e priorize o que vence primeiro', 'food_fridge_inventory', false),
    ('food', 'food.waste_log', 3, 'Registro de desperdício alimentar', 'registre por um dia o que quase virou descarte e escolha uma prevenção para amanhã', 'food_waste_log', false),
    ('food', 'food.local_food_comparison', 4, 'Comparação de alimento local', 'compare uma opção local ou da época com uma opção comum e escolha a de menor desperdício viável', 'food_local_comparison', false),
    ('food', 'food.shared_meal_planning', 4, 'Planejamento alimentar compartilhado', 'combine com quem mora com você uma forma simples de evitar compra duplicada ou sobra esquecida', 'food_shared_planning', false),
    ('food', 'food.weekly_waste_protocol', 5, 'Protocolo semanal contra desperdício alimentar', 'monte um plano de sete dias para listar, armazenar e aproveitar alimentos com segurança', 'food_weekly_protocol', false),

    ('consumption', 'consumption.pause_before_purchase', 1, 'Pausa antes da compra', 'antes de comprar algo não urgente, espere alguns minutos e pergunte se a necessidade é real', 'consumption_purchase_pause', false),
    ('consumption', 'consumption.repair_check', 1, 'Conserto antes da troca', 'escolha um objeto com problema e veja se existe reparo simples antes de substituir', 'consumption_repair_check', false),
    ('consumption', 'consumption.digital_document', 1, 'Documento digital quando serve', 'evite uma impressão se o documento digital atender à necessidade sem criar barreira', 'consumption_digital_document', false),
    ('consumption', 'consumption.reuse_item', 1, 'Um item reutilizado', 'dê uma segunda função segura a um item que seria descartado', 'consumption_item_reuse', false),
    ('consumption', 'consumption.borrow_instead_buy', 2, 'Emprestado em vez de comprado', 'para um item de uso raro, veja se é possível pegar emprestado ou compartilhar com acordo claro', 'consumption_borrow', false),
    ('consumption', 'consumption.second_hand_search', 2, 'Usado antes do novo', 'antes de comprar um item, pesquise uma opção usada segura e compare se atende à necessidade', 'consumption_second_hand', false),
    ('consumption', 'consumption.no_buy_day_budget', 2, 'Dia sem compra não essencial', 'passe um dia sem compra não essencial e anote qual impulso apareceu', 'consumption_no_buy_day', false),
    ('consumption', 'consumption.donate_unused', 2, 'Objeto parado em circulação', 'separe um objeto parado em bom estado para doação, venda ou troca', 'consumption_donate_unused', false),
    ('consumption', 'consumption.lifecycle_compare', 3, 'Ciclo de vida antes da escolha', 'compare durabilidade, reparo e descarte de um item antes de decidir comprar', 'consumption_lifecycle', false),
    ('consumption', 'consumption.impulse_trigger_log', 3, 'Registro de gatilho de impulso', 'registre um gatilho de compra por impulso e escolha uma resposta de baixo consumo', 'consumption_impulse_log', false),
    ('consumption', 'consumption.maintenance_routine', 3, 'Manutenção para durar mais', 'faça uma manutenção simples em um objeto para prolongar sua vida útil', 'consumption_maintenance', false),
    ('consumption', 'consumption.repair_or_replace_decision', 4, 'Decisão reparo ou troca', 'avalie custo, segurança e vida útil antes de trocar um objeto que ainda pode ser reparado', 'consumption_repair_decision', false),
    ('consumption', 'consumption.shared_item_system', 4, 'Sistema de compartilhamento de item', 'combine o compartilhamento de um item de uso raro para evitar compras duplicadas', 'consumption_shared_system', false),
    ('consumption', 'consumption.monthly_protocol', 5, 'Protocolo mensal de consumo consciente', 'monte um plano de compras essenciais, reparo e reutilização para reduzir consumo automático', 'consumption_monthly_protocol', false)
),
prepared AS (
  SELECT
    pattern_key,
    category,
    CASE category
      WHEN 'water' THEN 'reduzir desperdício de água em rotina doméstica'
      WHEN 'energy' THEN 'economizar energia e reduzir emissões associadas'
      WHEN 'waste' THEN 'separar resíduos, evitar descarte e reduzir lixo'
      WHEN 'transport' THEN 'reduzir emissões de deslocamento'
      WHEN 'food' THEN 'reduzir desperdício de alimentos e água indireta'
      ELSE 'evitar consumo desnecessário e prolongar vida útil'
    END AS environmental_goal,
    difficulty AS difficulty_min,
    difficulty AS difficulty_max,
    CASE WHEN difficulty <= 3 THEN 'free' ELSE 'low' END AS cost_level,
    CASE difficulty WHEN 1 THEN 1 WHEN 2 THEN 5 WHEN 3 THEN 10 WHEN 4 THEN 20 ELSE 30 END AS effort_minutes_min,
    CASE difficulty WHEN 1 THEN 5 WHEN 2 THEN 12 WHEN 3 THEN 25 WHEN 4 THEN 45 ELSE 60 END AS effort_minutes_max,
    CASE
      WHEN difficulty = 1 THEN ARRAY['constraint','capability','deficit','preference']::text[]
      WHEN difficulty = 2 THEN ARRAY['capability','deficit','habit','preference']::text[]
      WHEN difficulty = 3 THEN ARRAY['deficit','habit','preference','goal']::text[]
      WHEN difficulty = 4 THEN ARRAY['capability','habit','goal','context']::text[]
      ELSE ARRAY['habit','goal','interest','capability']::text[]
    END AS required_or_helpful_fact_types,
    ARRAY[]::text[] AS disqualifying_fact_keys,
    CASE category
      WHEN 'water' THEN ARRAY['routine_moment','control_level','safe_pause','time_limit','reason']::text[]
      WHEN 'energy' THEN ARRAY['device_or_room','safety_boundary','comfort_level','time_limit','reason']::text[]
      WHEN 'waste' THEN ARRAY['available_space','collection_access','material_type','time_limit','reason']::text[]
      WHEN 'transport' THEN ARRAY['route_type','safety_condition','mobility_limit','time_window','reason']::text[]
      WHEN 'food' THEN ARRAY['kitchen_access','budget_limit','diet_boundary','storage_context','reason']::text[]
      ELSE ARRAY['purchase_context','budget_limit','reuse_option','delay_window','reason']::text[]
    END AS personalization_slots,
    impact_model_key,
    pattern_key AS action_fingerprint,
    recurrence_allowed,
    fallback_title_pt,
    'Hoje, ' || action_pt || '.' AS fallback_description_pt,
    CASE category
      WHEN 'water' THEN 'Reduz desperdício de água com uma ação observável e ajustável ao controle real do usuário.'
      WHEN 'energy' THEN 'Economiza energia sem exigir compra e respeita segurança elétrica e conforto básico.'
      WHEN 'waste' THEN 'Diminui descarte e melhora separação de resíduos com baixa fricção.'
      WHEN 'transport' THEN 'Reduz emissões de deslocamento sem ignorar segurança, mobilidade e tempo disponível.'
      WHEN 'food' THEN 'Reduz desperdício alimentar sem impor dieta nem gasto incompatível.'
      ELSE 'Evita consumo automático e prolonga vida útil de objetos sem exigir compra nova.'
    END AS fallback_reason_pt,
    jsonb_build_object(
      'seed_version', 'prompt7_patterns_v1',
      'algorithm', 'deterministic_mission_patterns_v1',
      'difficulty_bucket', difficulty
    ) AS metadata
  FROM raw_patterns
)
INSERT INTO public.mission_patterns
  (
    key,
    category,
    environmental_goal,
    difficulty_min,
    difficulty_max,
    cost_level,
    effort_minutes_min,
    effort_minutes_max,
    required_or_helpful_fact_types,
    disqualifying_fact_keys,
    personalization_slots,
    impact_model_key,
    action_fingerprint,
    recurrence_allowed,
    fallback_title_pt,
    fallback_description_pt,
    fallback_reason_pt,
    metadata,
    active
  )
SELECT
  pattern_key,
  category,
  environmental_goal,
  difficulty_min,
  difficulty_max,
  cost_level,
  effort_minutes_min,
  effort_minutes_max,
  required_or_helpful_fact_types,
  disqualifying_fact_keys,
  personalization_slots,
  impact_model_key,
  action_fingerprint,
  recurrence_allowed,
  fallback_title_pt,
  fallback_description_pt,
  fallback_reason_pt,
  metadata,
  true
FROM prepared
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  environmental_goal = EXCLUDED.environmental_goal,
  difficulty_min = EXCLUDED.difficulty_min,
  difficulty_max = EXCLUDED.difficulty_max,
  cost_level = EXCLUDED.cost_level,
  effort_minutes_min = EXCLUDED.effort_minutes_min,
  effort_minutes_max = EXCLUDED.effort_minutes_max,
  required_or_helpful_fact_types = EXCLUDED.required_or_helpful_fact_types,
  disqualifying_fact_keys = EXCLUDED.disqualifying_fact_keys,
  personalization_slots = EXCLUDED.personalization_slots,
  impact_model_key = EXCLUDED.impact_model_key,
  action_fingerprint = EXCLUDED.action_fingerprint,
  recurrence_allowed = EXCLUDED.recurrence_allowed,
  fallback_title_pt = EXCLUDED.fallback_title_pt,
  fallback_description_pt = EXCLUDED.fallback_description_pt,
  fallback_reason_pt = EXCLUDED.fallback_reason_pt,
  metadata = EXCLUDED.metadata,
  active = true,
  updated_at = now();

COMMIT;

-- ============================================================================
-- PROMPT 5 - Aventura determinística: seeds de cartas e quizzes.
-- Execute este bloco depois do bloco incremental do Prompt 5 em ddl.sql.
-- ============================================================================
BEGIN;

UPDATE public.flashcards
SET active = false
WHERE active = true
  AND (category IS NULL OR signal_key IS NULL OR signal_type IS NULL);

WITH raw_seed AS (
  SELECT *
  FROM jsonb_to_recordset($flashcards$
[
  {"c":"water","t":"habit","k":"water.habit.close_tap_brushing","q":"Fecho a torneira enquanto escovo os dentes.","d":1},
  {"c":"water","t":"habit","k":"water.habit.short_showers","q":"Costumo tomar banhos de até dez minutos.","d":1},
  {"c":"water","t":"habit","k":"water.habit.full_laundry_load","q":"Junto roupas para usar a máquina com carga cheia.","d":2},
  {"c":"water","t":"habit","k":"water.habit.safe_reuse","q":"Reaproveito água limpa quando isso é seguro.","d":3},
  {"c":"water","t":"habit","k":"water.habit.report_leaks","q":"Aviso ou procuro consertar vazamentos quando percebo.","d":2},
  {"c":"water","t":"habit","k":"water.habit.dishwashing_basin","q":"Lavo louça evitando deixar a torneira aberta sem pausa.","d":2},
  {"c":"water","t":"habit","k":"water.habit.bucket_cleaning","q":"Uso balde em vez de mangueira para limpezas simples.","d":3},
  {"c":"water","t":"habit","k":"water.habit.conscious_flush","q":"Uso descarga e torneiras com atenção ao desperdício.","d":1},
  {"c":"water","t":"capability","k":"water.capability.controls_fixtures","q":"Tenho algum controle sobre torneiras, chuveiro ou descarga onde moro.","d":1},
  {"c":"water","t":"capability","k":"water.capability.can_check_leaks","q":"Consigo observar sinais de vazamento na minha moradia.","d":2},
  {"c":"water","t":"capability","k":"water.capability.has_bucket","q":"Tenho balde ou recipiente para pequenas limpezas.","d":1},
  {"c":"water","t":"capability","k":"water.capability.shared_rules","q":"Posso combinar regras de uso de água com quem mora comigo.","d":3},
  {"c":"water","t":"preference","k":"water.preference.bill_saving","q":"Tenho interesse em desafios para reduzir gasto de água.","d":1},
  {"c":"water","t":"preference","k":"water.preference.detect_waste","q":"Quero aprender a identificar desperdícios de água.","d":2},
  {"c":"water","t":"preference","k":"water.preference.quick_home","q":"Prefiro missões de água rápidas e domésticas.","d":1},
  {"c":"water","t":"preference","k":"water.preference.local_waters","q":"Tenho interesse em cuidar de rios, praias ou lagoas locais.","d":3},

  {"c":"energy","t":"habit","k":"energy.habit.turn_off_lights","q":"Desligo luzes quando saio de um cômodo.","d":1},
  {"c":"energy","t":"habit","k":"energy.habit.unplug_standby","q":"Tiro aparelhos da tomada quando ficam muito tempo sem uso.","d":2},
  {"c":"energy","t":"habit","k":"energy.habit.natural_light","q":"Aproveito luz natural antes de acender lâmpadas.","d":1},
  {"c":"energy","t":"habit","k":"energy.habit.full_laundry_energy","q":"Evito ligar máquina de lavar com poucas peças.","d":2},
  {"c":"energy","t":"habit","k":"energy.habit.fan_before_ac","q":"Uso ventilação natural ou ventilador antes do ar-condicionado quando possível.","d":2},
  {"c":"energy","t":"habit","k":"energy.habit.charger_unplug","q":"Retiro carregadores da tomada quando não estão carregando nada.","d":1},
  {"c":"energy","t":"habit","k":"energy.habit.peak_awareness","q":"Evito consumo elétrico desnecessário em horários de pico.","d":3},
  {"c":"energy","t":"habit","k":"energy.habit.fridge_attention","q":"Evito deixar geladeira aberta por muito tempo.","d":1},
  {"c":"energy","t":"capability","k":"energy.capability.controls_lights","q":"Tenho controle sobre lâmpadas e interruptores onde fico.","d":1},
  {"c":"energy","t":"capability","k":"energy.capability.can_access_outlets","q":"Consigo acessar tomadas para desligar aparelhos com segurança.","d":1},
  {"c":"energy","t":"capability","k":"energy.capability.sees_bill","q":"Consigo acompanhar ou perguntar sobre a conta de luz.","d":2},
  {"c":"energy","t":"capability","k":"energy.capability.adjusts_ac","q":"Posso ajustar ventilador ou ar-condicionado em parte da rotina.","d":2},
  {"c":"energy","t":"preference","k":"energy.preference.save_bill","q":"Tenho interesse em economizar energia para reduzir custos.","d":1},
  {"c":"energy","t":"preference","k":"energy.preference.device_efficiency","q":"Quero aprender a usar aparelhos com mais eficiência.","d":2},
  {"c":"energy","t":"preference","k":"energy.preference.comfort_balance","q":"Prefiro missões que economizem energia sem perder conforto básico.","d":2},
  {"c":"energy","t":"preference","k":"energy.preference.measure_progress","q":"Gosto de acompanhar pequenas reduções no consumo de luz.","d":3},

  {"c":"waste","t":"habit","k":"waste.habit.recycle_sort","q":"Separo recicláveis do lixo comum quando tenho estrutura.","d":1},
  {"c":"waste","t":"habit","k":"waste.habit.reusable_bag","q":"Levo sacola reutilizável em compras.","d":1},
  {"c":"waste","t":"habit","k":"waste.habit.avoid_disposables","q":"Evito copos, canudos ou talheres descartáveis quando posso.","d":1},
  {"c":"waste","t":"habit","k":"waste.habit.correct_batteries","q":"Separo pilhas e baterias para descarte correto.","d":2},
  {"c":"waste","t":"habit","k":"waste.habit.reuse_containers","q":"Reutilizo potes ou embalagens antes de descartar.","d":2},
  {"c":"waste","t":"habit","k":"waste.habit.oil_disposal","q":"Evito descartar óleo de cozinha na pia.","d":2},
  {"c":"waste","t":"habit","k":"waste.habit.organic_separation","q":"Evito misturar lixo orgânico com recicláveis quando consigo separar.","d":3},
  {"c":"waste","t":"habit","k":"waste.habit.donate_items","q":"Tento doar itens em bom estado antes de jogar fora.","d":2},
  {"c":"waste","t":"capability","k":"waste.capability.has_bins","q":"Tenho algum recipiente ou espaço para separar resíduos.","d":1},
  {"c":"waste","t":"capability","k":"waste.capability.knows_collection","q":"Sei onde deixar recicláveis ou descartes especiais perto de mim.","d":2},
  {"c":"waste","t":"capability","k":"waste.capability.storage_space","q":"Tenho um pequeno espaço para guardar recicláveis por alguns dias.","d":2},
  {"c":"waste","t":"capability","k":"waste.capability.shared_agreement","q":"Consigo combinar separação de resíduos com outras pessoas da casa.","d":3},
  {"c":"waste","t":"preference","k":"waste.preference.less_trash","q":"Tenho interesse em gerar menos lixo no dia a dia.","d":1},
  {"c":"waste","t":"preference","k":"waste.preference.recycling_learning","q":"Quero aprender melhor o que pode ser reciclado.","d":2},
  {"c":"waste","t":"preference","k":"waste.preference.reuse_creative","q":"Gosto de ideias criativas para reutilizar objetos.","d":2},
  {"c":"waste","t":"preference","k":"waste.preference.community_clean","q":"Tenho interesse em ações coletivas de limpeza ou descarte correto.","d":3},

  {"c":"transport","t":"habit","k":"transport.habit.walk_short","q":"Caminho em trajetos curtos quando é seguro.","d":1},
  {"c":"transport","t":"habit","k":"transport.habit.public_transport","q":"Uso transporte público em parte da rotina.","d":1},
  {"c":"transport","t":"habit","k":"transport.habit.bike_short","q":"Uso bicicleta ou considero usar em trajetos viáveis.","d":2},
  {"c":"transport","t":"habit","k":"transport.habit.combine_trips","q":"Combino saídas para evitar deslocamentos extras.","d":2},
  {"c":"transport","t":"habit","k":"transport.habit.avoid_idling","q":"Evito deixar motor ligado enquanto espero.","d":2},
  {"c":"transport","t":"habit","k":"transport.habit.remote_errands","q":"Resolvo algumas tarefas online para evitar deslocamento desnecessário.","d":1},
  {"c":"transport","t":"habit","k":"transport.habit.shared_rides","q":"Compartilho caronas ou viagens quando faz sentido.","d":3},
  {"c":"transport","t":"habit","k":"transport.habit.local_options","q":"Prefiro opções perto de casa quando elas atendem bem.","d":2},
  {"c":"transport","t":"capability","k":"transport.capability.safe_walk","q":"Tenho rotas seguras para caminhar em alguns trajetos.","d":1},
  {"c":"transport","t":"capability","k":"transport.capability.transit_access","q":"Tenho acesso prático a transporte público.","d":1},
  {"c":"transport","t":"capability","k":"transport.capability.flex_schedule","q":"Consigo ajustar horário para evitar deslocamentos ruins ou lotados.","d":2},
  {"c":"transport","t":"capability","k":"transport.capability.bike_storage","q":"Tenho onde guardar bicicleta ou equipamento de mobilidade com segurança.","d":3},
  {"c":"transport","t":"preference","k":"transport.preference.low_carbon","q":"Tenho interesse em reduzir impacto dos deslocamentos.","d":1},
  {"c":"transport","t":"preference","k":"transport.preference.walking_routes","q":"Gosto de descobrir rotas caminháveis e seguras.","d":2},
  {"c":"transport","t":"preference","k":"transport.preference.transit_tips","q":"Quero dicas para tornar transporte público mais viável.","d":2},
  {"c":"transport","t":"preference","k":"transport.preference.local_life","q":"Prefiro missões que valorizem opções próximas do bairro.","d":3},

  {"c":"food","t":"habit","k":"food.habit.plan_meals","q":"Planejo refeições ou compras para evitar desperdício.","d":1},
  {"c":"food","t":"habit","k":"food.habit.use_leftovers","q":"Aproveito sobras de comida de forma segura.","d":1},
  {"c":"food","t":"habit","k":"food.habit.seasonal_food","q":"Escolho frutas e verduras da época quando posso.","d":2},
  {"c":"food","t":"habit","k":"food.habit.shopping_list","q":"Uso lista de compras para não levar comida demais.","d":1},
  {"c":"food","t":"habit","k":"food.habit.store_food","q":"Guardo alimentos de um jeito que ajuda a durar mais.","d":2},
  {"c":"food","t":"habit","k":"food.habit.less_delivery_packaging","q":"Evito embalagens extras quando peço comida.","d":2},
  {"c":"food","t":"habit","k":"food.habit.plant_forward","q":"Incluo refeições com mais vegetais quando faz sentido para mim.","d":3},
  {"c":"food","t":"habit","k":"food.habit.check_expiry","q":"Confiro validade antes de comprar ou descartar alimentos.","d":1},
  {"c":"food","t":"capability","k":"food.capability.kitchen_access","q":"Tenho acesso à cozinha para preparar algo simples.","d":1},
  {"c":"food","t":"capability","k":"food.capability.fridge_access","q":"Tenho geladeira ou local adequado para guardar comida.","d":1},
  {"c":"food","t":"capability","k":"food.capability.can_choose_food","q":"Consigo escolher ao menos parte dos alimentos que consumo.","d":2},
  {"c":"food","t":"capability","k":"food.capability.has_time_cook","q":"Tenho tempo para preparar refeições simples em alguns dias.","d":2},
  {"c":"food","t":"preference","k":"food.preference.less_waste","q":"Tenho interesse em desperdiçar menos comida.","d":1},
  {"c":"food","t":"preference","k":"food.preference.simple_recipes","q":"Prefiro receitas simples e de baixo custo.","d":1},
  {"c":"food","t":"preference","k":"food.preference.local_food","q":"Tenho interesse em alimentos locais ou da época.","d":2},
  {"c":"food","t":"preference","k":"food.preference.food_impact","q":"Quero entender melhor o impacto ambiental da alimentação.","d":3},

  {"c":"consumption","t":"habit","k":"consumption.habit.plan_before_buy","q":"Penso se realmente preciso antes de comprar algo.","d":1},
  {"c":"consumption","t":"habit","k":"consumption.habit.repair_first","q":"Tento consertar objetos antes de substituir.","d":2},
  {"c":"consumption","t":"habit","k":"consumption.habit.borrow_share","q":"Peço emprestado ou compartilho itens de uso raro.","d":2},
  {"c":"consumption","t":"habit","k":"consumption.habit.second_hand","q":"Considero brechos ou usados quando faz sentido.","d":2},
  {"c":"consumption","t":"habit","k":"consumption.habit.avoid_impulse","q":"Evito compras por impulso em promoções.","d":1},
  {"c":"consumption","t":"habit","k":"consumption.habit.durable_products","q":"Prefiro produtos duráveis quando cabem no meu orçamento.","d":3},
  {"c":"consumption","t":"habit","k":"consumption.habit.digital_documents","q":"Evito imprimir quando a versão digital resolve.","d":1},
  {"c":"consumption","t":"habit","k":"consumption.habit.donate_unused","q":"Doo, vendo ou troco itens que não uso mais.","d":2},
  {"c":"consumption","t":"capability","k":"consumption.capability.can_delay_purchase","q":"Consigo esperar um pouco antes de comprar itens não urgentes.","d":1},
  {"c":"consumption","t":"capability","k":"consumption.capability.repair_access","q":"Tenho acesso a alguma forma de reparo, mesmo simples.","d":2},
  {"c":"consumption","t":"capability","k":"consumption.capability.storage_reuse","q":"Tenho pequeno espaço para guardar itens reutilizáveis.","d":2},
  {"c":"consumption","t":"capability","k":"consumption.capability.budget_awareness","q":"Consigo acompanhar gastos para evitar consumo automático.","d":1},
  {"c":"consumption","t":"preference","k":"consumption.preference.spend_less","q":"Tenho interesse em consumir menos e economizar.","d":1},
  {"c":"consumption","t":"preference","k":"consumption.preference.minimalism","q":"Gosto da ideia de ter menos coisas acumuladas.","d":2},
  {"c":"consumption","t":"preference","k":"consumption.preference.repair_culture","q":"Quero aprender mais sobre reparo e vida útil dos objetos.","d":3},
  {"c":"consumption","t":"preference","k":"consumption.preference.low_cost","q":"Prefiro missões de consumo que não dependam de comprar nada.","d":1}
]
$flashcards$::jsonb) AS item(c text, t text, k text, q text, d int)
),
prepared AS (
  SELECT
    (
      substr(md5('rootine-flashcard:' || k), 1, 8) || '-' ||
      substr(md5('rootine-flashcard:' || k), 9, 4) || '-4' ||
      substr(md5('rootine-flashcard:' || k), 14, 3) || '-8' ||
      substr(md5('rootine-flashcard:' || k), 18, 3) || '-' ||
      substr(md5('rootine-flashcard:' || k), 21, 12)
    )::uuid AS id,
    c AS category,
    t AS signal_type,
    k AS signal_key,
    q AS question,
    d AS difficulty
  FROM raw_seed
)
INSERT INTO public.flashcards
  (id, question, category, signal_key, signal_type, true_effect, false_effect, skip_effect, weight, difficulty, active)
SELECT
  id,
  question,
  category,
  signal_key,
  signal_type,
  jsonb_build_object(
    'fact_type', CASE signal_type
      WHEN 'habit' THEN 'habit'
      WHEN 'capability' THEN 'capability'
      ELSE 'preference'
    END,
    'value', true,
    'confidence', 0.78,
    'affinity_delta', 0.06
  ),
  jsonb_build_object(
    'fact_type', CASE signal_type
      WHEN 'habit' THEN 'deficit'
      WHEN 'capability' THEN 'constraint'
      ELSE 'preference'
    END,
    'value', false,
    'confidence', 0.70,
    'affinity_delta', CASE signal_type WHEN 'habit' THEN -0.03 ELSE -0.01 END
  ),
  '{"profile_update":false,"reason":"skip_without_penalty"}'::jsonb,
  1,
  difficulty,
  true
FROM prepared
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  category = EXCLUDED.category,
  signal_key = EXCLUDED.signal_key,
  signal_type = EXCLUDED.signal_type,
  true_effect = EXCLUDED.true_effect,
  false_effect = EXCLUDED.false_effect,
  skip_effect = EXCLUDED.skip_effect,
  weight = EXCLUDED.weight,
  difficulty = EXCLUDED.difficulty,
  active = true;

WITH raw_quiz AS (
  SELECT row_number() OVER () AS ordinal, *
  FROM jsonb_to_recordset($quizzes$
[
  {"c":"water","k":"water.quiz.close_tap","d":1,"q":"Qual atitude reduz desperdício de água ao escovar os dentes?","ok":"Fechar a torneira enquanto escova.","w1":"Abrir mais a torneira para terminar rápido.","w2":"Deixar a água correndo para limpar a pia.","w3":"Usar água quente sem necessidade.","e":"Fechar a torneira evita litros de desperdício em poucos minutos."},
  {"c":"water","k":"water.quiz.leak","d":1,"q":"O que fazer ao perceber um vazamento pequeno?","ok":"Avisar responsáveis ou registrar para conserto.","w1":"Esperar aumentar para valer a pena.","w2":"Cobrir com pano e ignorar.","w3":"Abrir outra torneira para compensar.","e":"Vazamentos pequenos podem desperdiçar muita água ao longo do dia."},
  {"c":"water","k":"water.quiz.bucket","d":2,"q":"Para limpeza simples de área externa, qual opção tende a gastar menos água?","ok":"Usar balde e pano.","w1":"Usar mangueira aberta continuamente.","w2":"Lavar duas vezes a mesma área.","w3":"Deixar a chuva resolver sempre.","e":"Balde limita o volume usado e facilita perceber o consumo."},
  {"c":"water","k":"water.quiz.laundry","d":2,"q":"Quando faz sentido usar a máquina de lavar roupas?","ok":"Com carga adequada, evitando ciclos quase vazios.","w1":"Sempre com poucas peças para lavar mais rápido.","w2":"Com duplo enxágue em toda lavagem.","w3":"Sem separar roupas por necessidade real.","e":"Cargas adequadas reduzem água e energia por peça lavada."},
  {"c":"water","k":"water.quiz.shower","d":3,"q":"Qual métrica simples ajuda a melhorar o banho sem julgamento?","ok":"Tempo aproximado de banho e frequência.","w1":"Marca do sabonete usado.","w2":"Cor da toalha.","w3":"Quantidade de espelho no banheiro.","e":"Tempo e frequência permitem missões realistas de redução."},
  {"c":"water","k":"water.quiz.rain_reuse","d":3,"q":"Quando reutilizar água da chuva é mais adequado?","ok":"Para regar plantas ou limpar áreas, se armazenada com cuidado.","w1":"Para beber sem tratamento.","w2":"Para cozinhar sem filtro.","w3":"Para misturar com produtos perigosos.","e":"Reutilização deve respeitar segurança e finalidade não potável."},
  {"c":"water","k":"water.quiz.dishes","d":4,"q":"Na louça, qual prática reduz consumo sem exigir equipamento novo?","ok":"Ensaboar com a torneira fechada e enxaguar de uma vez.","w1":"Enxaguar item por item com fluxo máximo.","w2":"Deixar a torneira aberta enquanto organiza pratos.","w3":"Usar água corrente para remover qualquer resto seco.","e":"Agrupar etapas reduz tempo de torneira aberta."},
  {"c":"water","k":"water.quiz.shared_home","d":4,"q":"Em moradia compartilhada, qual abordagem costuma funcionar melhor?","ok":"Combinar uma regra pequena e observável.","w1":"Impor mudança grande sem conversa.","w2":"Culpar quem esqueceu uma vez.","w3":"Desistir de qualquer acordo doméstico.","e":"Acordos pequenos reduzem atrito e aumentam adesão."},
  {"c":"water","k":"water.quiz.virtual_water","d":5,"q":"O que significa água virtual em consumo?","ok":"Água usada indiretamente para produzir bens e alimentos.","w1":"Água que existe apenas em aplicativos.","w2":"Água de torneiras inteligentes.","w3":"Água que não conta no impacto ambiental.","e":"Produtos e alimentos carregam consumo indireto de água na produção."},
  {"c":"water","k":"water.quiz.priority","d":5,"q":"Se uma pessoa tem pouco controle doméstico, qual missão de água é mais justa?","ok":"Observar vazamentos e reduzir torneira aberta em usos pessoais.","w1":"Trocar todos os encanamentos da casa.","w2":"Exigir reforma imediata do banheiro.","w3":"Assumir controle total da conta de água.","e":"Personalização deve respeitar controle real da pessoa."},

  {"c":"energy","k":"energy.quiz.lights","d":1,"q":"Qual hábito simples reduz consumo de energia?","ok":"Apagar luzes ao sair de ambientes vazios.","w1":"Acender luzes durante todo o dia.","w2":"Deixar lâmpadas ligadas para lembrar tarefas.","w3":"Usar mais tomadas que o necessário.","e":"Luzes apagadas em ambientes vazios reduzem desperdício direto."},
  {"c":"energy","k":"energy.quiz.standby","d":1,"q":"O que é consumo em stand-by?","ok":"Energia usada por aparelhos ligados na tomada mesmo sem uso ativo.","w1":"Energia produzida por plantas.","w2":"Luz solar entrando pela janela.","w3":"Energia que não aparece na conta.","e":"Alguns aparelhos continuam consumindo quando ficam em espera."},
  {"c":"energy","k":"energy.quiz.natural_light","d":2,"q":"Qual escolha aproveita melhor a luz natural?","ok":"Abrir cortinas de dia antes de acender lâmpadas.","w1":"Fechar tudo e acender luzes cedo.","w2":"Usar lâmpadas mais fortes ao meio-dia.","w3":"Deixar telas no brilho máximo sempre.","e":"Luz natural pode substituir iluminação artificial em muitos momentos."},
  {"c":"energy","k":"energy.quiz.ac","d":2,"q":"Como reduzir uso de ar-condicionado com conforto?","ok":"Testar ventilação natural ou ventilador quando o clima permite.","w1":"Ligar ar com portas abertas.","w2":"Usar temperatura mínima sempre.","w3":"Bloquear toda circulação de ar.","e":"Alternativas graduais preservam conforto e reduzem gasto."},
  {"c":"energy","k":"energy.quiz.chargers","d":3,"q":"Por que retirar carregadores ociosos pode ajudar?","ok":"Evita pequenos consumos repetidos ao longo do tempo.","w1":"Faz o celular carregar mais depois.","w2":"Aumenta a potência da tomada.","w3":"Substitui manutenção elétrica.","e":"Pequenos consumos recorrentes somam no mês."},
  {"c":"energy","k":"energy.quiz.fridge","d":3,"q":"Qual cuidado ajuda a geladeira a gastar menos?","ok":"Evitar abrir a porta por muito tempo.","w1":"Guardar comida quente sempre.","w2":"Bloquear a ventilação traseira.","w3":"Regular para frio máximo sem necessidade.","e":"Menos troca de ar quente reduz esforço do motor."},
  {"c":"energy","k":"energy.quiz.peak","d":4,"q":"Por que horários de pico importam?","ok":"Concentram demanda e podem exigir fontes mais caras ou poluentes.","w1":"São horários sem consumo elétrico.","w2":"Só afetam quem tem energia solar.","w3":"Mudam a cor da luz.","e":"Distribuir consumo ajuda o sistema elétrico."},
  {"c":"energy","k":"energy.quiz.safety","d":4,"q":"Qual regra vem antes de qualquer missão com tomadas?","ok":"Segurança: não mexer em instalação ou tomada danificada.","w1":"Economizar mesmo com risco.","w2":"Abrir equipamentos sem preparo.","w3":"Usar adaptadores improvisados.","e":"Sustentabilidade não deve criar risco elétrico."},
  {"c":"energy","k":"energy.quiz.efficiency","d":5,"q":"O que significa eficiência energética?","ok":"Entregar o mesmo serviço usando menos energia.","w1":"Usar mais energia para terminar rápido.","w2":"Trocar tudo mesmo funcionando.","w3":"Medir apenas o preço do aparelho.","e":"Eficiência compara resultado e energia usada."},
  {"c":"energy","k":"energy.quiz.personalization","d":5,"q":"Se alguém não controla a conta de luz, qual missão é mais adequada?","ok":"Focar em aparelhos e luzes sob controle pessoal.","w1":"Exigir troca da fiação.","w2":"Prometer redução total da conta.","w3":"Ignorar energia completamente.","e":"Missões devem respeitar autonomia real."},

  {"c":"waste","k":"waste.quiz.recycle","d":1,"q":"Qual primeiro passo para reciclar melhor?","ok":"Separar recicláveis limpos do lixo comum quando há destino.","w1":"Misturar tudo para facilitar coleta.","w2":"Lavar com água em excesso sempre.","w3":"Guardar lixo sem limite de tempo.","e":"Separação básica melhora a chance de reciclagem."},
  {"c":"waste","k":"waste.quiz.batteries","d":1,"q":"Pilhas e baterias devem ir para onde?","ok":"Pontos de coleta apropriados.","w1":"Lixo orgânico.","w2":"Ralo ou pia.","w3":"Queima doméstica.","e":"Baterias podem contaminar solo e água se descartadas errado."},
  {"c":"waste","k":"waste.quiz.oil","d":2,"q":"Por que não descartar óleo na pia?","ok":"Pode entupir tubulações e contaminar água.","w1":"Porque evapora rápido demais.","w2":"Porque vira reciclagem automaticamente.","w3":"Porque deixa a água potável.","e":"Óleo usado precisa de descarte ou reaproveitamento adequado."},
  {"c":"waste","k":"waste.quiz.disposables","d":2,"q":"Qual ação reduz descartáveis sem compra grande?","ok":"Recusar itens descartáveis extras quando não precisa.","w1":"Aceitar sempre para estocar.","w2":"Trocar todos por itens caros de uma vez.","w3":"Usar descartável duas vezes sem higiene.","e":"Recusar excesso evita resíduo na origem."},
  {"c":"waste","k":"waste.quiz.organic","d":3,"q":"O que acontece quando orgânico suja recicláveis?","ok":"Pode reduzir a chance de reciclagem do material.","w1":"Aumenta o valor do reciclável.","w2":"Transforma plástico em adubo.","w3":"Elimina necessidade de coleta.","e":"Materiais contaminados são mais difíceis de reciclar."},
  {"c":"waste","k":"waste.quiz.storage","d":3,"q":"Para quem tem pouco espaço, qual estratégia é realista?","ok":"Separar apenas uma categoria fácil e levar com frequência.","w1":"Guardar todo resíduo por meses.","w2":"Assumir compostagem grande sem local.","w3":"Desistir de qualquer separação.","e":"Pequena separação consistente funciona melhor que excesso inviável."},
  {"c":"waste","k":"waste.quiz.labels","d":4,"q":"Por que olhar rótulos pode ajudar no descarte?","ok":"Indica material, risco ou orientação de coleta.","w1":"Sempre prova que tudo é reciclável.","w2":"Substitui limpeza do resíduo.","w3":"Define o preço final do lixo.","e":"Rótulos podem orientar decisões de descarte."},
  {"c":"waste","k":"waste.quiz.reuse","d":4,"q":"Quando reutilizar embalagem faz sentido?","ok":"Quando está limpa, segura e evita compra ou descarte imediato.","w1":"Quando guarda alimento perigoso sem higiene.","w2":"Quando acumula sem uso definido.","w3":"Quando substitui descarte de material tóxico.","e":"Reutilização boa precisa de segurança e finalidade."},
  {"c":"waste","k":"waste.quiz.hazard","d":5,"q":"O que é resíduo doméstico perigoso?","ok":"Material como pilha, tinta ou eletrônico que exige descarte especial.","w1":"Qualquer folha seca.","w2":"Todo papel limpo.","w3":"Água de chuva em balde.","e":"Alguns resíduos exigem cuidado por risco ambiental."},
  {"c":"waste","k":"waste.quiz.skip","d":5,"q":"Se a pessoa pula uma carta de resíduos, o que o sistema deve inferir?","ok":"Nada crítico automaticamente; skip não cria déficit nem bloqueio.","w1":"Que ela rejeita reciclagem para sempre.","w2":"Que existe hard block financeiro.","w3":"Que a categoria deve ser proibida.","e":"Pular não é evidência forte para fato negativo."},

  {"c":"transport","k":"transport.quiz.short_trip","d":1,"q":"Para trajeto curto e seguro, qual opção reduz emissões?","ok":"Caminhar ou pedalar quando viável.","w1":"Usar carro para qualquer distância.","w2":"Deixar motor ligado antes de sair.","w3":"Fazer duas viagens em vez de uma.","e":"Mobilidade ativa reduz combustível e ainda pode fazer bem à saúde."},
  {"c":"transport","k":"transport.quiz.public","d":1,"q":"Qual vantagem ambiental do transporte público cheio?","ok":"Divide emissões por mais pessoas.","w1":"Sempre aumenta carros na rua.","w2":"Não usa energia alguma.","w3":"Elimina toda poluição automaticamente.","e":"Compartilhar deslocamento reduz impacto por pessoa."},
  {"c":"transport","k":"transport.quiz.combine","d":2,"q":"O que significa combinar deslocamentos?","ok":"Resolver várias tarefas em uma saída planejada.","w1":"Sair várias vezes sem rota.","w2":"Ir mais longe sem motivo.","w3":"Trocar caminhada por carro sempre.","e":"Planejamento evita trajetos repetidos."},
  {"c":"transport","k":"transport.quiz.idling","d":2,"q":"Por que evitar motor ligado parado?","ok":"Reduz combustível desperdicado e emissões locais.","w1":"Aumenta vida útil do ar parado.","w2":"Carrega combustível de volta.","w3":"Não muda nada em nenhum caso.","e":"Motor parado ligado consome e polui sem deslocar."},
  {"c":"transport","k":"transport.quiz.safety","d":3,"q":"O que vem antes de sugerir caminhada ou bike?","ok":"Verificar segurança, distância e condição da pessoa.","w1":"Mandar fazer mesmo com risco.","w2":"Ignorar clima e horário.","w3":"Comparar moralmente escolhas.","e":"Personalização precisa respeitar segurança."},
  {"c":"transport","k":"transport.quiz.remote","d":3,"q":"Como tarefas online podem reduzir impacto?","ok":"Evitando deslocamentos desnecessários quando resolvem bem.","w1":"Substituindo toda convivência.","w2":"Aumentando entregas sem critério.","w3":"Obrigando uso de tela o dia todo.","e":"Evitar uma viagem dispensável reduz emissão."},
  {"c":"transport","k":"transport.quiz.carbon","d":4,"q":"Qual fator influencia emissão de um deslocamento?","ok":"Modo de transporte, distância e ocupação.","w1":"A cor do veículo apenas.","w2":"O nome da rua.","w3":"A marca do calçado.","e":"Impacto depende de como e quanto se desloca."},
  {"c":"transport","k":"transport.quiz.local","d":4,"q":"Por que escolher serviços perto de casa pode ajudar?","ok":"Pode reduzir distância percorrida e tempo de deslocamento.","w1":"Sempre custa mais carbono.","w2":"Elimina qualquer necessidade de planejamento.","w3":"Impede uso de transporte público.","e":"Proximidade pode reduzir viagens longas."},
  {"c":"transport","k":"transport.quiz.shared","d":5,"q":"Quando carona compartilhada é ambientalmente melhor?","ok":"Quando substitui viagens separadas e é segura para todos.","w1":"Quando cria deslocamento extra sem necessidade.","w2":"Quando deixa mais carros vazios na rua.","w3":"Quando ignora rota e horário.","e":"Compartilhar precisa reduzir viagens totais."},
  {"c":"transport","k":"transport.quiz.limited","d":5,"q":"Se alguém tem limitação de mobilidade, qual abordagem é adequada?","ok":"Sugerir ações de transporte de baixo esforço ou planejamento remoto.","w1":"Prescrever caminhada longa.","w2":"Bloquear toda categoria transporte.","w3":"Assumir falta de interesse.","e":"Limitação pede ajuste, não julgamento."},

  {"c":"food","k":"food.quiz.leftovers","d":1,"q":"Qual prática reduz desperdício de comida?","ok":"Aproveitar sobras de forma segura.","w1":"Jogar fora antes de avaliar.","w2":"Comprar mais do que cabe na geladeira.","w3":"Ignorar validade e cheiro sempre.","e":"Sobras seguras podem virar novas refeições."},
  {"c":"food","k":"food.quiz.list","d":1,"q":"Por que lista de compras ajuda?","ok":"Reduz compras duplicadas e excesso que estraga.","w1":"Garante comprar tudo em maior quantidade.","w2":"Substitui armazenamento correto.","w3":"Impede escolher alimentos frescos.","e":"Planejamento evita desperdício e gasto."},
  {"c":"food","k":"food.quiz.seasonal","d":2,"q":"Alimentos da época costumam ter qual vantagem?","ok":"Podem exigir menos recurso e ter melhor preço local.","w1":"Sempre vem de mais longe.","w2":"Nunca precisam de transporte.","w3":"Não influenciam desperdício.","e":"Sazonalidade pode favorecer custo e impacto."},
  {"c":"food","k":"food.quiz.storage","d":2,"q":"Guardar alimento corretamente ajuda porque:","ok":"Aumenta chance de consumo antes de estragar.","w1":"Torna qualquer comida eterna.","w2":"Dispensa higiene.","w3":"Elimina necessidade de geladeira.","e":"Armazenamento adequado reduz perdas."},
  {"c":"food","k":"food.quiz.kitchen","d":3,"q":"Se a pessoa quase não tem cozinha, qual missão é melhor?","ok":"Focar em planejamento, escolha ou desperdício sem exigir preparo.","w1":"Exigir receita longa no fogão.","w2":"Mandar comprar utensílios caros.","w3":"Ignorar alimentação para sempre.","e":"Missão boa respeita acesso real à cozinha."},
  {"c":"food","k":"food.quiz.plant","d":3,"q":"Uma refeição com mais vegetais pode ajudar quando:","ok":"Cabe na cultura, saúde, acesso e preferência da pessoa.","w1":"Desrespeita restrição alimentar.","w2":"É imposta como julgamento moral.","w3":"Exige gasto inviável.","e":"Alimentação sustentável precisa ser contextual."},
  {"c":"food","k":"food.quiz.delivery","d":4,"q":"Como reduzir embalagem em delivery?","ok":"Dispensar talheres, sachês ou itens extras quando não preciso.","w1":"Pedir embalagens duplicadas sempre.","w2":"Separar tudo sem lavar com muita água.","w3":"Escolher apenas pedidos mais distantes.","e":"Evitar extras reduz resíduo na origem."},
  {"c":"food","k":"food.quiz.expiry","d":4,"q":"Qual cuidado evita descarte desnecessário por validade?","ok":"Conferir data e condição antes de comprar ou jogar fora.","w1":"Descartar tudo antes da data.","w2":"Ignorar sinais de deterioração.","w3":"Comprar sem olhar estoque.","e":"Checagem simples reduz perdas e mantém segurança."},
  {"c":"food","k":"food.quiz.impact","d":5,"q":"Impacto alimentar envolve mais que carbono porque inclui:","ok":"Água, solo, transporte, desperdício e contexto social.","w1":"Apenas cor do prato.","w2":"Somente tamanho da embalagem.","w3":"Só a marca do mercado.","e":"A cadeia alimentar tem vários impactos interligados."},
  {"c":"food","k":"food.quiz.restriction","d":5,"q":"Se alguém prefere não detalhar restrição alimentar, o app deve:","ok":"Evitar assumir trocas alimentares específicas.","w1":"Pedir detalhes médicos sensíveis.","w2":"Forçar dieta padrão.","w3":"Criar hard block moral.","e":"Privacidade e segurança devem guiar personalização."},

  {"c":"consumption","k":"consumption.quiz.need","d":1,"q":"Qual pergunta reduz compra por impulso?","ok":"Eu preciso disso agora ou posso esperar?","w1":"Quantos anúncios vi hoje?","w2":"Como comprar mais rápido?","w3":"Qual embalagem parece maior?","e":"Pausar antes de comprar reduz consumo automático."},
  {"c":"consumption","k":"consumption.quiz.repair","d":1,"q":"Antes de substituir um objeto, o que vale checar?","ok":"Se há reparo simples, doação ou uso alternativo.","w1":"Se existe modelo mais novo.","w2":"Se dá para descartar escondido.","w3":"Se comprar dois economiza impacto.","e":"Reparo e reutilização prolongam vida útil."},
  {"c":"consumption","k":"consumption.quiz.borrow","d":2,"q":"Quando pegar emprestado pode ser sustentável?","ok":"Para item de uso raro, com acordo claro.","w1":"Para acumular itens duplicados.","w2":"Para evitar devolver.","w3":"Para substituir manutenção.","e":"Compartilhar reduz necessidade de comprar algo pouco usado."},
  {"c":"consumption","k":"consumption.quiz.durable","d":2,"q":"Produto durável é melhor quando:","ok":"Cabe no orçamento e realmente será usado por mais tempo.","w1":"É comprado por modismo.","w2":"Substitui item funcionando sem motivo.","w3":"Tem embalagem maior sempre.","e":"Durabilidade precisa vir com uso real e custo viável."},
  {"c":"consumption","k":"consumption.quiz.digital","d":3,"q":"Evitar impressão ajuda quando:","ok":"Documento digital atende a necessidade.","w1":"A impressão é obrigatória por regra.","w2":"Precisa de assinatura física única.","w3":"A tela impede acesso da pessoa.","e":"Digital reduz papel quando não cria barreira."},
  {"c":"consumption","k":"consumption.quiz.promo","d":3,"q":"Promoção relâmpago pode aumentar impacto porque:","ok":"Estimula compra sem necessidade planejada.","w1":"Sempre reduz desperdício.","w2":"Impede qualquer consumo.","w3":"Não influencia decisões.","e":"Desconto não transforma compra desnecessária em sustentável."},
  {"c":"consumption","k":"consumption.quiz.second_hand","d":4,"q":"Comprar usado pode reduzir impacto quando:","ok":"Evita fabricar novo e atende a necessidade com segurança.","w1":"Cria acumulação sem uso.","w2":"É feito só por status.","w3":"Substitui descarte correto de item perigoso.","e":"Segunda mão amplia vida útil de produtos."},
  {"c":"consumption","k":"consumption.quiz.budget","d":4,"q":"Orçamento apertado deve levar o app a:","ok":"Priorizar missões grátis ou de economia.","w1":"Sugerir compras caras verdes.","w2":"Ignorar consumo.","w3":"Criar culpa por não gastar.","e":"Sustentabilidade acessível respeita restrição financeira."},
  {"c":"consumption","k":"consumption.quiz.lifecycle","d":5,"q":"Pensar em ciclo de vida significa considerar:","ok":"Produção, uso, reparo e descarte do item.","w1":"Apenas o momento da compra.","w2":"Somente a cor do produto.","w3":"Só o preço promocional.","e":"Impacto aparece em várias etapas da vida do produto."},
  {"c":"consumption","k":"consumption.quiz.low_cost","d":5,"q":"Qual missão de consumo é adequada para começar?","ok":"Revisar um item antes de comprar outro.","w1":"Trocar todos os objetos por versões novas.","w2":"Comprar kit sustentável caro.","w3":"Descartar tudo que parece antigo.","e":"Reduzir compra desnecessária costuma ser acessível e efetivo."}
]
$quizzes$::jsonb) AS item(c text, k text, d int, q text, ok text, w1 text, w2 text, w3 text, e text)
),
prepared_quiz AS (
  SELECT
    (
      substr(md5('rootine-quiz:' || k), 1, 8) || '-' ||
      substr(md5('rootine-quiz:' || k), 9, 4) || '-4' ||
      substr(md5('rootine-quiz:' || k), 14, 3) || '-8' ||
      substr(md5('rootine-quiz:' || k), 18, 3) || '-' ||
      substr(md5('rootine-quiz:' || k), 21, 12)
    )::uuid AS id,
    ordinal,
    c AS category,
    k AS signal_key,
    d AS difficulty,
    q AS question,
    ok,
    w1,
    w2,
    w3,
    e AS explanation
  FROM raw_quiz
),
optioned AS (
  SELECT
    *,
    CASE (ordinal % 4)
      WHEN 1 THEN 'A'
      WHEN 2 THEN 'B'
      WHEN 3 THEN 'C'
      ELSE 'D'
    END AS correct_option
  FROM prepared_quiz
)
INSERT INTO public.quiz_questions
  (id, category, question, options, correct_option, explanation, difficulty, signal_key, active, metadata)
SELECT
  id,
  category,
  question,
  jsonb_build_array(
    jsonb_build_object('id', 'A', 'text', CASE correct_option WHEN 'A' THEN ok ELSE w1 END),
    jsonb_build_object('id', 'B', 'text', CASE correct_option WHEN 'B' THEN ok WHEN 'A' THEN w1 ELSE w2 END),
    jsonb_build_object('id', 'C', 'text', CASE correct_option WHEN 'C' THEN ok WHEN 'D' THEN w3 ELSE w2 END),
    jsonb_build_object('id', 'D', 'text', CASE correct_option WHEN 'D' THEN ok ELSE w3 END)
  ),
  correct_option,
  explanation,
  difficulty,
  signal_key,
  true,
  jsonb_build_object(
    'seed_version', 'prompt5_adventure_v1',
    'algorithm', 'deterministic_adventure_v1'
  )
FROM optioned
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  category = EXCLUDED.category,
  options = EXCLUDED.options,
  correct_option = EXCLUDED.correct_option,
  explanation = EXCLUDED.explanation,
  difficulty = EXCLUDED.difficulty,
  signal_key = EXCLUDED.signal_key,
  active = true,
  metadata = EXCLUDED.metadata,
  updated_at = now();

COMMIT;

-- ============================================================================
-- PROMPT 7 - Revisão AI Mission Composer e action_fingerprint.
-- Execute depois do bloco incremental correspondente em ddl.sql.
-- ============================================================================
BEGIN;

UPDATE public.mission_patterns
SET action_fingerprint = key,
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{action_fingerprint}',
      to_jsonb(key),
      true
    ),
    updated_at = now()
WHERE action_fingerprint IS NULL OR btrim(action_fingerprint) = '';

UPDATE public.user_missions AS mission
SET action_fingerprint = pattern.action_fingerprint
FROM public.mission_patterns AS pattern
WHERE mission.pattern_key = pattern.key
  AND (mission.action_fingerprint IS NULL OR btrim(mission.action_fingerprint) = '');

UPDATE public.mission_generation_logs AS generation_log
SET selected_action_fingerprint = pattern.action_fingerprint
FROM public.mission_patterns AS pattern
WHERE generation_log.selected_pattern_key = pattern.key
  AND (generation_log.selected_action_fingerprint IS NULL OR btrim(generation_log.selected_action_fingerprint) = '');

ALTER TABLE public.mission_patterns VALIDATE CONSTRAINT mission_patterns_action_fingerprint_check;
ALTER TABLE public.user_missions VALIDATE CONSTRAINT user_missions_action_fingerprint_check;

COMMIT;

-- ============================================================================
-- PROMPT 9 - XP, impacto, conquistas e Habitat reais.
-- Execute depois do bloco incremental correspondente em ddl.sql.
-- ============================================================================
BEGIN;

UPDATE public.impact_ledger AS impact
SET
  pattern_key = COALESCE(impact.pattern_key, mission.pattern_key),
  impact_model_key = COALESCE(pattern.impact_model_key, impact.impact_model_key, 'legacy.default'),
  model_version = COALESCE(NULLIF(impact.model_version, ''), 'impact_model_v1'),
  metadata = COALESCE(impact.metadata, '{}'::jsonb) ||
    jsonb_build_object(
      'prompt9_backfilled', true,
      'schema_version', 1,
      'algorithm', 'rootine_progress_v1'
    )
FROM public.user_missions AS mission
LEFT JOIN public.mission_patterns AS pattern
  ON pattern.key = mission.pattern_key
WHERE impact.mission_id = mission.id;

UPDATE public.impact_ledger
SET
  impact_model_key = COALESCE(NULLIF(impact_model_key, ''), 'legacy.default'),
  model_version = COALESCE(NULLIF(model_version, ''), 'impact_model_v1')
WHERE impact_model_key IS NULL
   OR btrim(impact_model_key) = ''
   OR model_version IS NULL
   OR btrim(model_version) = '';

ALTER TABLE public.impact_ledger VALIDATE CONSTRAINT impact_ledger_impact_model_key_check;
ALTER TABLE public.impact_ledger VALIDATE CONSTRAINT impact_ledger_model_version_check;

INSERT INTO public.achievement_definitions
  (key, title, description, xp_reward, category, criteria, sort_order, active)
VALUES
  (
    'first_mission_completed',
    'Primeira missão viva',
    'Concluiu a primeira missão da Trilha.',
    20,
    'consumption',
    '{"metric":"completed_missions","min":1}'::jsonb,
    30,
    true
  ),
  (
    'five_missions_completed',
    'Ritmo de cuidado',
    'Concluiu cinco missões da Trilha.',
    35,
    'consumption',
    '{"metric":"completed_missions","min":5}'::jsonb,
    35,
    true
  ),
  (
    'twenty_missions_completed',
    'Guardião constante',
    'Concluiu vinte missões da Trilha.',
    80,
    'consumption',
    '{"metric":"completed_missions","min":20}'::jsonb,
    45,
    true
  ),
  (
    'first_adventure_batch',
    'Semente de aventura',
    'Concluiu o primeiro lote da Aventura com respostas suficientes.',
    15,
    'consumption',
    '{"metric":"adventure_batches","min":1}'::jsonb,
    20,
    true
  ),
  (
    'seven_active_days',
    'Sete amanheceres',
    'Interagiu com o Rootine em sete dias diferentes.',
    40,
    'consumption',
    '{"metric":"active_days","min":7}'::jsonb,
    55,
    true
  ),
  (
    'four_categories_touched',
    'Mapa do território',
    'Trabalhou quatro categorias sustentáveis diferentes.',
    35,
    'consumption',
    '{"metric":"categories_touched","min":4}'::jsonb,
    65,
    true
  ),
  (
    'first_mission_edit',
    'Missão sob medida',
    'Adaptou uma missão com feedback útil.',
    20,
    'consumption',
    '{"metric":"mission_edits","min":1}'::jsonb,
    75,
    true
  ),
  (
    'mission_difficulty_3',
    'Passo firme',
    'Concluiu uma missão de dificuldade 3 ou maior.',
    25,
    'consumption',
    '{"metric":"mission_difficulty","min":3}'::jsonb,
    85,
    true
  ),
  (
    'mission_difficulty_4',
    'Copa resiliente',
    'Concluiu uma missão de dificuldade 4 ou maior.',
    45,
    'consumption',
    '{"metric":"mission_difficulty","min":4}'::jsonb,
    95,
    true
  ),
  (
    'impact_water',
    'Cuidado com a água',
    'Registrou impacto estimado positivo em água.',
    25,
    'water',
    '{"metric":"impact.water_l","min":0.01}'::jsonb,
    105,
    true
  ),
  (
    'impact_waste',
    'Menos resíduos',
    'Registrou impacto estimado positivo em resíduos.',
    25,
    'waste',
    '{"metric":"impact.waste_g","min":0.01}'::jsonb,
    115,
    true
  ),
  (
    'impact_co2_energy',
    'Ar mais leve',
    'Registrou impacto estimado positivo em CO2 ou energia.',
    25,
    'energy',
    '{"metric":"impact.co2_or_energy","min":0.01}'::jsonb,
    125,
    true
  )
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  xp_reward = EXCLUDED.xp_reward,
  category = EXCLUDED.category,
  criteria = EXCLUDED.criteria,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

WITH ledger AS (
  SELECT user_id, COALESCE(SUM(GREATEST(xp_delta, 0)), 0)::int AS total_xp
  FROM public.xp_ledger
  GROUP BY user_id
)
UPDATE public.profiles AS profile
SET xp = COALESCE(ledger.total_xp, 0)
FROM public.profiles AS all_profiles
LEFT JOIN ledger ON ledger.user_id = all_profiles.id
WHERE profile.id = all_profiles.id;

-- Evita bônus duplicado com a conquista obrigatória impact_water do Prompt 9.
UPDATE public.achievement_definitions
SET active = false,
    updated_at = now()
WHERE key = 'water_saver_seed';

-- Remove rodapé genérico dos patterns para a IA/fallback trabalharem com ações concretas.
UPDATE public.mission_patterns
SET fallback_description_pt = btrim(regexp_replace(
      fallback_description_pt,
      '\s*Faça em um momento seguro da rotina e registre mentalmente o que funcionou\.?',
      '',
      'gi'
    )),
    updated_at = now()
WHERE fallback_description_pt ILIKE '%registre mentalmente o que funcionou%';

-- Limpa missões ativas já criadas com o rodapé antigo.
UPDATE public.user_missions
SET description = btrim(regexp_replace(
      regexp_replace(
        regexp_replace(
          description,
          '\s*Faça em um momento seguro da rotina e registre mentalmente o que funcionou\.?',
          '',
          'gi'
        ),
        '\s*Reserve em (poucos minutos|cerca de [0-9]+ minutos|até [0-9]+ minutos, sem pressa|ao longo de até [0-9]+ minutos) e não compre nada para concluir\.?',
        '',
        'gi'
      ),
      '\s*Distribua ou repita a ação ao longo de até 7 dias, acompanhando o que funcionou\.?',
      '',
      'gi'
    ))
WHERE status = 'active'
  AND (
    description ILIKE '%registre mentalmente o que funcionou%'
    OR description ILIKE '%não compre nada para concluir%'
    OR description ILIKE '%Distribua ou repita a ação%'
  );

-- Idempotência para geração: retries da mesma tentativa lógica não criam missões duplicadas.
ALTER TABLE public.user_missions
  ADD COLUMN IF NOT EXISTS generation_request_id text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_missions_generation_request_id_check'
      AND conrelid = 'public.user_missions'::regclass
  ) THEN
    ALTER TABLE public.user_missions
      ADD CONSTRAINT user_missions_generation_request_id_check
      CHECK (generation_request_id IS NULL OR btrim(generation_request_id) <> '') NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS user_missions_user_generation_request_unique_idx
  ON public.user_missions (user_id, generation_request_id)
  WHERE generation_request_id IS NOT NULL;

-- Biosfera comunitaria real: posts publicos autenticados com RLS.
CREATE TABLE IF NOT EXISTS public.biosphere_posts (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_name text NOT NULL DEFAULT 'Guardião Rootine',
  post_type text NOT NULL DEFAULT 'community',
  title text NOT NULL,
  body text NOT NULL,
  category text,
  impact_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  achievement_key text REFERENCES public.achievement_definitions(key) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'biosphere_posts_type_check'
      AND conrelid = 'public.biosphere_posts'::regclass
  ) THEN
    ALTER TABLE public.biosphere_posts
      ADD CONSTRAINT biosphere_posts_type_check
      CHECK (post_type IN ('community','impact_milestone','achievement_share','challenge')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'biosphere_posts_visibility_check'
      AND conrelid = 'public.biosphere_posts'::regclass
  ) THEN
    ALTER TABLE public.biosphere_posts
      ADD CONSTRAINT biosphere_posts_visibility_check
      CHECK (visibility IN ('public','hidden')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'biosphere_posts_category_check'
      AND conrelid = 'public.biosphere_posts'::regclass
  ) THEN
    ALTER TABLE public.biosphere_posts
      ADD CONSTRAINT biosphere_posts_category_check
      CHECK (category IS NULL OR category IN ('water','energy','waste','transport','food','consumption')) NOT VALID;
  END IF;
END $$;

DROP TRIGGER IF EXISTS biosphere_posts_touch_updated_at ON public.biosphere_posts;
CREATE TRIGGER biosphere_posts_touch_updated_at
  BEFORE UPDATE ON public.biosphere_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.rootine_touch_updated_at();

CREATE INDEX IF NOT EXISTS biosphere_posts_public_created_idx
  ON public.biosphere_posts (visibility, created_at DESC);

CREATE INDEX IF NOT EXISTS biosphere_posts_user_created_idx
  ON public.biosphere_posts (user_id, created_at DESC);

ALTER TABLE public.biosphere_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS biosphere_posts_select_public ON public.biosphere_posts;
CREATE POLICY biosphere_posts_select_public
  ON public.biosphere_posts FOR SELECT TO authenticated
  USING (visibility = 'public');

DROP POLICY IF EXISTS biosphere_posts_insert_own ON public.biosphere_posts;
CREATE POLICY biosphere_posts_insert_own
  ON public.biosphere_posts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS biosphere_posts_update_own ON public.biosphere_posts;
CREATE POLICY biosphere_posts_update_own
  ON public.biosphere_posts FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS biosphere_posts_delete_own ON public.biosphere_posts;
CREATE POLICY biosphere_posts_delete_own
  ON public.biosphere_posts FOR DELETE TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.biosphere_posts VALIDATE CONSTRAINT biosphere_posts_type_check;
ALTER TABLE public.biosphere_posts VALIDATE CONSTRAINT biosphere_posts_visibility_check;
ALTER TABLE public.biosphere_posts VALIDATE CONSTRAINT biosphere_posts_category_check;

COMMIT;
