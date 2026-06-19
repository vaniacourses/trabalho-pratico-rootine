-- ENUM usado em user_missions.status
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'mission_status_enum' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.mission_status_enum AS ENUM ('pending','active','completed','expired','refused','failed');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'mission_type_enum' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.mission_type_enum AS ENUM ('daily','specialized');
  END IF;
END $$;

-- 1) profiles
CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY,
  nome text NOT NULL,
  xp int NOT NULL,
  socioeconomic_context jsonb,
  learned_preferences jsonb,
  affinities jsonb,
  impact_totals jsonb NOT NULL DEFAULT '{"co2_kg":0,"water_l":0,"waste_g":0}'::jsonb,
  created_at timestamptz,
  avatar_url text,
  onboarding_completed boolean,
  daily_flashcards_completed boolean
);

-- FK: profiles.id -> auth.users.id
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fk_auth_users
  FOREIGN KEY (id) REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- 2) user_missions
CREATE TABLE public.user_missions (
  id uuid NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  ai_justification jsonb,
  feedback_notes jsonb,
  status public.mission_status_enum NOT NULL,
  mission_type public.mission_type_enum NOT NULL DEFAULT 'daily',
  created_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz
);

-- FK: user_missions.user_id -> profiles.id
ALTER TABLE public.user_missions
  ADD CONSTRAINT user_missions_user_id_fk_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- 3) flashcards
CREATE TABLE public.flashcards (
  id uuid NOT NULL PRIMARY KEY,
  question text
);

-- 4) user_daily_flashcards
CREATE TABLE public.user_daily_flashcards (
  id uuid NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL,
  completed_at timestamptz,
  active boolean,
  created_at timestamptz,
  amount int
);

-- FK: user_daily_flashcards.user_id -> profiles.id
ALTER TABLE public.user_daily_flashcards
  ADD CONSTRAINT user_daily_flashcards_user_id_fk_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- 5) user_flashcards_answers
CREATE TABLE public.user_flashcards_answers (
  id uuid NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL,
  flashcard_id uuid NOT NULL,
  daily_batch uuid NOT NULL,
  answer boolean
);

-- FK: user_flashcards_answers.flashcard_id -> flashcards.id
ALTER TABLE public.user_flashcards_answers
  ADD CONSTRAINT user_flashcards_answers_flashcard_id_fk_flashcards
  FOREIGN KEY (flashcard_id) REFERENCES public.flashcards(id)
  ON DELETE CASCADE;

-- FK: user_flashcards_answers.daily_batch -> user_daily_flashcards.id
ALTER TABLE public.user_flashcards_answers
  ADD CONSTRAINT user_flashcards_answers_daily_batch_fk_user_daily_flashcards
  FOREIGN KEY (daily_batch) REFERENCES public.user_daily_flashcards(id)
  ON DELETE CASCADE;

-- 6) agent_interactions
CREATE TABLE public.agent_interactions (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent text NOT NULL,
  event_type text NOT NULL,
  input_summary jsonb,
  output jsonb,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_interactions
  ADD CONSTRAINT agent_interactions_user_id_fk_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- 7) habitat_leaves
CREATE TABLE public.habitat_leaves (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  position int NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  source_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.habitat_leaves
  ADD CONSTRAINT habitat_leaves_user_id_fk_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- 8) quizzes
CREATE TABLE public.quizzes (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question text NOT NULL,
  options jsonb NOT NULL,
  correct_option text NOT NULL,
  explanation text,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quizzes
  ADD CONSTRAINT quizzes_user_id_fk_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- 9) user_quiz_answers
CREATE TABLE public.user_quiz_answers (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_id uuid NOT NULL,
  selected_option text NOT NULL,
  correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_quiz_answers
  ADD CONSTRAINT user_quiz_answers_user_id_fk_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE CASCADE;

ALTER TABLE public.user_quiz_answers
  ADD CONSTRAINT user_quiz_answers_quiz_id_fk_quizzes
  FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id)
  ON DELETE CASCADE;

-- ============================================================================
-- PROMPT 2 - SCRIPT INCREMENTAL PARA EXECUTAR NO SUPABASE
-- Data: 2026-06-07
--
-- Execute apenas este bloco no SQL Editor do Supabase. Não execute o ddl.sql
-- inteiro no banco real, pois o topo deste arquivo e um registro legado.
--
-- Fonte de verdade usada para compatibilidade:
-- print real do Supabase em 2026-06-07 com profiles.name, user_missions sem
-- mission_type visível, flashcards básico e tabelas legadas de Aventura.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'mission_status_enum' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.mission_status_enum AS ENUM ('active','completed','refused','failed');
  END IF;
END $$;

DO $$ BEGIN
  ALTER TYPE public.mission_status_enum ADD VALUE IF NOT EXISTS 'refused';
  ALTER TYPE public.mission_status_enum ADD VALUE IF NOT EXISTS 'failed';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'mission_type_enum' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.mission_type_enum AS ENUM ('daily','specialized');
  END IF;
END $$;

-- Compatibilidade temporaria entre o banco real (`name`) e historico local
-- (`nome`). Ambos ficam nullable para nao quebrar upserts/clientes legados.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS nome text,
  ADD COLUMN IF NOT EXISTS impact_totals jsonb NOT NULL DEFAULT '{"co2_kg":0,"water_l":0,"waste_g":0}'::jsonb;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN name DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'nome'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN nome DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.profiles
  ALTER COLUMN xp SET DEFAULT 1,
  ALTER COLUMN onboarding_completed SET DEFAULT false,
  ALTER COLUMN daily_flashcards_completed SET DEFAULT false;

-- Tabelas legadas que algumas telas/functions atuais ja usam. IF NOT EXISTS
-- deixa o script seguro para bancos onde elas ja existem.
CREATE TABLE IF NOT EXISTS public.agent_interactions (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agent text NOT NULL,
  event_type text NOT NULL,
  input_summary jsonb,
  output jsonb,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.habitat_leaves (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  position int NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  source_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quizzes (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question text NOT NULL,
  options jsonb NOT NULL,
  correct_option text NOT NULL,
  explanation text,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_quiz_answers (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quiz_id uuid REFERENCES public.quizzes(id) ON DELETE CASCADE,
  selected_option text NOT NULL,
  correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now()
);

-- Tabelas novas minimas do Prompt 2.
CREATE TABLE IF NOT EXISTS public.user_profile_events (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  source text NOT NULL DEFAULT 'app',
  source_table text,
  source_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version int NOT NULL DEFAULT 1,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_profile_events_user_time_idx
  ON public.user_profile_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS user_profile_events_user_type_idx
  ON public.user_profile_events (user_id, event_type);

CREATE TABLE IF NOT EXISTS public.user_profile_facts (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fact_key text NOT NULL,
  fact_type text NOT NULL,
  category text,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4,3) NOT NULL DEFAULT 0.500,
  source_event_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  active boolean NOT NULL DEFAULT true,
  derived_by text NOT NULL DEFAULT 'deterministic',
  evidence_count int NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_profile_facts_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT user_profile_facts_user_fact_key_unique UNIQUE (user_id, fact_key)
);

CREATE INDEX IF NOT EXISTS user_profile_facts_user_active_idx
  ON public.user_profile_facts (user_id, active);

CREATE INDEX IF NOT EXISTS user_profile_facts_user_category_idx
  ON public.user_profile_facts (user_id, category);

CREATE TABLE IF NOT EXISTS public.xp_ledger (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid,
  reason text,
  xp_delta int NOT NULL,
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT xp_ledger_non_zero_delta_check CHECK (xp_delta <> 0),
  CONSTRAINT xp_ledger_user_idempotency_unique UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS xp_ledger_user_created_idx
  ON public.xp_ledger (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.impact_ledger (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES public.user_missions(id) ON DELETE SET NULL,
  source_type text NOT NULL DEFAULT 'mission',
  impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimated boolean NOT NULL DEFAULT true,
  confidence numeric(4,3),
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  logged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT impact_ledger_confidence_check CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT impact_ledger_user_idempotency_unique UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS impact_ledger_user_logged_idx
  ON public.impact_ledger (user_id, logged_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS impact_ledger_mission_unique_idx
  ON public.impact_ledger (mission_id)
  WHERE mission_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.achievement_definitions (
  key text NOT NULL PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  xp_reward int NOT NULL DEFAULT 0,
  category text,
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT achievement_definitions_xp_reward_check CHECK (xp_reward >= 0)
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_key text NOT NULL REFERENCES public.achievement_definitions(key) ON DELETE RESTRICT,
  xp_ledger_id uuid REFERENCES public.xp_ledger(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_achievements_user_key_unique UNIQUE (user_id, achievement_key)
);

CREATE INDEX IF NOT EXISTS user_achievements_user_unlocked_idx
  ON public.user_achievements (user_id, unlocked_at DESC);

CREATE TABLE IF NOT EXISTS public.mission_patterns (
  key text NOT NULL PRIMARY KEY,
  category text NOT NULL,
  environmental_goal text NOT NULL,
  difficulty_min int NOT NULL,
  difficulty_max int NOT NULL,
  cost_level text NOT NULL DEFAULT 'free',
  effort_minutes_min int NOT NULL DEFAULT 1,
  effort_minutes_max int NOT NULL DEFAULT 10,
  required_or_helpful_fact_types text[] NOT NULL DEFAULT '{}'::text[],
  disqualifying_fact_keys text[] NOT NULL DEFAULT '{}'::text[],
  personalization_slots text[] NOT NULL DEFAULT '{}'::text[],
  impact_model_key text NOT NULL,
  recurrence_allowed boolean NOT NULL DEFAULT false,
  fallback_title_pt text NOT NULL,
  fallback_description_pt text NOT NULL,
  fallback_reason_pt text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mission_patterns_category_check CHECK (category IN ('water','energy','waste','transport','food','consumption')),
  CONSTRAINT mission_patterns_difficulty_check CHECK (difficulty_min BETWEEN 1 AND 5 AND difficulty_max BETWEEN 1 AND 5 AND difficulty_min <= difficulty_max),
  CONSTRAINT mission_patterns_effort_check CHECK (effort_minutes_min >= 0 AND effort_minutes_max >= effort_minutes_min),
  CONSTRAINT mission_patterns_cost_level_check CHECK (cost_level IN ('free','low','medium','high'))
);

CREATE INDEX IF NOT EXISTS mission_patterns_active_category_idx
  ON public.mission_patterns (active, category);

CREATE TABLE IF NOT EXISTS public.mission_generation_logs (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES public.user_missions(id) ON DELETE SET NULL,
  mission_type text NOT NULL DEFAULT 'daily',
  context_version text NOT NULL DEFAULT 'MissionGenerationContextV1',
  candidate_pattern_keys text[] NOT NULL DEFAULT '{}'::text[],
  selected_pattern_key text REFERENCES public.mission_patterns(key) ON DELETE SET NULL,
  rejected_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  generation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  used_fallback boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mission_generation_logs_type_check CHECK (mission_type IN ('daily','specialized')),
  CONSTRAINT mission_generation_logs_status_check CHECK (status IN ('success','error','rejected','fallback'))
);

CREATE INDEX IF NOT EXISTS mission_generation_logs_user_requested_idx
  ON public.mission_generation_logs (user_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  question text NOT NULL,
  options jsonb NOT NULL,
  correct_option text NOT NULL,
  explanation text,
  difficulty int NOT NULL DEFAULT 1,
  signal_key text,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quiz_questions_category_check CHECK (category IN ('water','energy','waste','transport','food','consumption')),
  CONSTRAINT quiz_questions_difficulty_check CHECK (difficulty BETWEEN 1 AND 5),
  CONSTRAINT quiz_questions_correct_option_check CHECK (correct_option IN ('A','B','C','D')),
  CONSTRAINT quiz_questions_question_unique UNIQUE (question)
);

CREATE INDEX IF NOT EXISTS quiz_questions_active_category_idx
  ON public.quiz_questions (active, category, difficulty);

-- Categoria como seed/constante de banco para os seis dominios canonicos.
CREATE TABLE IF NOT EXISTS public.sustainability_categories (
  key text NOT NULL PRIMARY KEY,
  label_pt text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Expansoes de tabelas existentes.
ALTER TABLE public.flashcards
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS signal_key text,
  ADD COLUMN IF NOT EXISTS signal_type text,
  ADD COLUMN IF NOT EXISTS true_effect jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS false_effect jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS skip_effect jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS weight numeric(6,3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS difficulty int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flashcards_category_check'
      AND conrelid = 'public.flashcards'::regclass
  ) THEN
    ALTER TABLE public.flashcards
      ADD CONSTRAINT flashcards_category_check
      CHECK (category IS NULL OR category IN ('water','energy','waste','transport','food','consumption')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flashcards_difficulty_check'
      AND conrelid = 'public.flashcards'::regclass
  ) THEN
    ALTER TABLE public.flashcards
      ADD CONSTRAINT flashcards_difficulty_check
      CHECK (difficulty BETWEEN 1 AND 5) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS flashcards_active_category_idx
  ON public.flashcards (active, category, difficulty);

ALTER TABLE public.user_missions
  ADD COLUMN IF NOT EXISTS mission_type public.mission_type_enum NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS environmental_goal text,
  ADD COLUMN IF NOT EXISTS difficulty int,
  ADD COLUMN IF NOT EXISTS effort_minutes int,
  ADD COLUMN IF NOT EXISTS cost_level text,
  ADD COLUMN IF NOT EXISTS xp_reward int,
  ADD COLUMN IF NOT EXISTS used_fact_keys text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS personalization_reason text,
  ADD COLUMN IF NOT EXISTS generation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS expected_impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS impact_logged_at timestamptz,
  ADD COLUMN IF NOT EXISTS pattern_key text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_missions_category_check'
      AND conrelid = 'public.user_missions'::regclass
  ) THEN
    ALTER TABLE public.user_missions
      ADD CONSTRAINT user_missions_category_check
      CHECK (category IS NULL OR category IN ('water','energy','waste','transport','food','consumption')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_missions_difficulty_check'
      AND conrelid = 'public.user_missions'::regclass
  ) THEN
    ALTER TABLE public.user_missions
      ADD CONSTRAINT user_missions_difficulty_check
      CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_missions_effort_minutes_check'
      AND conrelid = 'public.user_missions'::regclass
  ) THEN
    ALTER TABLE public.user_missions
      ADD CONSTRAINT user_missions_effort_minutes_check
      CHECK (effort_minutes IS NULL OR effort_minutes >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_missions_cost_level_check'
      AND conrelid = 'public.user_missions'::regclass
  ) THEN
    ALTER TABLE public.user_missions
      ADD CONSTRAINT user_missions_cost_level_check
      CHECK (cost_level IS NULL OR cost_level IN ('free','low','medium','high')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_missions_xp_reward_check'
      AND conrelid = 'public.user_missions'::regclass
  ) THEN
    ALTER TABLE public.user_missions
      ADD CONSTRAINT user_missions_xp_reward_check
      CHECK (xp_reward IS NULL OR xp_reward >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_missions_pattern_key_fk'
      AND conrelid = 'public.user_missions'::regclass
  ) THEN
    ALTER TABLE public.user_missions
      ADD CONSTRAINT user_missions_pattern_key_fk
      FOREIGN KEY (pattern_key) REFERENCES public.mission_patterns(key) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_missions_user_status_created_idx
  ON public.user_missions (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS user_missions_user_pattern_created_idx
  ON public.user_missions (user_id, pattern_key, created_at DESC);

ALTER TABLE public.user_quiz_answers
  ADD COLUMN IF NOT EXISTS quiz_question_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_quiz_answers_quiz_question_id_fk'
      AND conrelid = 'public.user_quiz_answers'::regclass
  ) THEN
    ALTER TABLE public.user_quiz_answers
      ADD CONSTRAINT user_quiz_answers_quiz_question_id_fk
      FOREIGN KEY (quiz_question_id) REFERENCES public.quiz_questions(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- PROMPT 5 - Aventura determinística: horário real de resposta das cartas.
-- Execute este bloco incremental no SQL Editor do Supabase antes dos seeds do
-- Prompt 5 em add.sql.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_flashcards_answers
  ADD COLUMN IF NOT EXISTS answered_at timestamptz;

CREATE INDEX IF NOT EXISTS user_flashcards_answers_user_answered_at_idx
  ON public.user_flashcards_answers (user_id, answered_at DESC)
  WHERE answered_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- PROMPT 7 - Revisão AI Mission Composer e anti-repetição prática.
-- Execute este bloco incremental no SQL Editor do Supabase antes de redeployar
-- generate-missions com a versão hybrid_ai_mission_composer_v2.
-- ---------------------------------------------------------------------------
ALTER TABLE public.mission_patterns
  ADD COLUMN IF NOT EXISTS action_fingerprint text;

ALTER TABLE public.user_missions
  ADD COLUMN IF NOT EXISTS action_fingerprint text;

ALTER TABLE public.mission_generation_logs
  ADD COLUMN IF NOT EXISTS selected_action_fingerprint text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mission_patterns_action_fingerprint_check'
      AND conrelid = 'public.mission_patterns'::regclass
  ) THEN
    ALTER TABLE public.mission_patterns
      ADD CONSTRAINT mission_patterns_action_fingerprint_check
      CHECK (action_fingerprint IS NULL OR btrim(action_fingerprint) <> '') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_missions_action_fingerprint_check'
      AND conrelid = 'public.user_missions'::regclass
  ) THEN
    ALTER TABLE public.user_missions
      ADD CONSTRAINT user_missions_action_fingerprint_check
      CHECK (action_fingerprint IS NULL OR btrim(action_fingerprint) <> '') NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS mission_patterns_active_action_fingerprint_idx
  ON public.mission_patterns (active, action_fingerprint);

CREATE INDEX IF NOT EXISTS user_missions_user_action_fingerprint_created_idx
  ON public.user_missions (user_id, action_fingerprint, created_at DESC)
  WHERE action_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS mission_generation_logs_user_action_requested_idx
  ON public.mission_generation_logs (user_id, selected_action_fingerprint, requested_at DESC)
  WHERE selected_action_fingerprint IS NOT NULL;

-- ---------------------------------------------------------------------------
-- PROMPT 9 - XP, impacto, conquistas e Habitat reais.
-- Execute este bloco incremental no SQL Editor do Supabase antes de redeployar
-- as Edge Functions que usam rootine_progress_v1.
-- ---------------------------------------------------------------------------
ALTER TABLE public.impact_ledger
  ADD COLUMN IF NOT EXISTS pattern_key text,
  ADD COLUMN IF NOT EXISTS impact_model_key text NOT NULL DEFAULT 'legacy.default',
  ADD COLUMN IF NOT EXISTS model_version text NOT NULL DEFAULT 'impact_model_v1';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'impact_ledger_impact_model_key_check'
      AND conrelid = 'public.impact_ledger'::regclass
  ) THEN
    ALTER TABLE public.impact_ledger
      ADD CONSTRAINT impact_ledger_impact_model_key_check
      CHECK (btrim(impact_model_key) <> '') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'impact_ledger_model_version_check'
      AND conrelid = 'public.impact_ledger'::regclass
  ) THEN
    ALTER TABLE public.impact_ledger
      ADD CONSTRAINT impact_ledger_model_version_check
      CHECK (btrim(model_version) <> '') NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS impact_ledger_user_model_logged_idx
  ON public.impact_ledger (user_id, impact_model_key, logged_at DESC);

CREATE INDEX IF NOT EXISTS impact_ledger_user_pattern_logged_idx
  ON public.impact_ledger (user_id, pattern_key, logged_at DESC)
  WHERE pattern_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Geração idempotente de missões.
-- Execute este bloco incremental antes de redeployar generate-missions.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- PROMPT 10 - Biosfera comunitaria real.
-- Posts publicos autenticados, sem ranking competitivo.
-- ---------------------------------------------------------------------------
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT biosphere_posts_type_check CHECK (post_type IN ('community','impact_milestone','achievement_share','challenge')),
  CONSTRAINT biosphere_posts_visibility_check CHECK (visibility IN ('public','hidden')),
  CONSTRAINT biosphere_posts_category_check CHECK (category IS NULL OR category IN ('water','energy','waste','transport','food','consumption'))
);

CREATE INDEX IF NOT EXISTS biosphere_posts_public_created_idx
  ON public.biosphere_posts (visibility, created_at DESC);

CREATE INDEX IF NOT EXISTS biosphere_posts_user_created_idx
  ON public.biosphere_posts (user_id, created_at DESC);
