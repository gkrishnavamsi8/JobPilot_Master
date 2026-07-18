-- JobPilot: candidate profiles (resume parser + UI form data)
CREATE TABLE IF NOT EXISTS public.candidates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(320),
    first_name varchar(100),
    last_name varchar(100),
    resume_path text,
    resume_filename varchar(255),
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidates_email ON public.candidates (email);
CREATE INDEX IF NOT EXISTS idx_candidates_updated_at ON public.candidates (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_data_gin ON public.candidates USING gin (data);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidates_set_updated_at ON public.candidates;
CREATE TRIGGER candidates_set_updated_at
    BEFORE UPDATE ON public.candidates
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.candidates IS 'Job application profiles: parsed resume + UI form data as JSON';
COMMENT ON COLUMN public.candidates.data IS 'Full CandidateData payload: profile, work_experience, education, work_authorization, etc.';
