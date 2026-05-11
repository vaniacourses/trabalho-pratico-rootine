-- ENUM usado em user_missions.status
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'mission_status_enum' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.mission_status_enum AS ENUM ('pending','active','completed','expired');
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