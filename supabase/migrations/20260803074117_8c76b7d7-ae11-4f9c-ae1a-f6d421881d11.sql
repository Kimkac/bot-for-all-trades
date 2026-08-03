CREATE TABLE public.health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  failed_count integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  base_url text NOT NULL,
  results jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX health_checks_checked_at_idx ON public.health_checks (checked_at DESC);

GRANT SELECT ON public.health_checks TO authenticated;
GRANT ALL ON public.health_checks TO service_role;

ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view health checks"
  ON public.health_checks FOR SELECT TO authenticated USING (true);