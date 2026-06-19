DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'mission_type_enum' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.mission_type_enum AS ENUM ('daily','specialized');
  END IF;
END $$;

DO $$ BEGIN
  ALTER TYPE public.mission_status_enum ADD VALUE IF NOT EXISTS 'refused';
  ALTER TYPE public.mission_status_enum ADD VALUE IF NOT EXISTS 'failed';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS impact_totals jsonb NOT NULL
  DEFAULT '{"co2_kg":0,"water_l":0,"waste_g":0}'::jsonb;

ALTER TABLE public.user_missions
  ADD COLUMN IF NOT EXISTS mission_type public.mission_type_enum NOT NULL DEFAULT 'daily';

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
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  selected_option text NOT NULL,
  correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now()
);
