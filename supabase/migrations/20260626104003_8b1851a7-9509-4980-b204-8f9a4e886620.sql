
CREATE TYPE public.plan_tier AS ENUM ('starter','trader','pro','elite');

CREATE TABLE public.subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier public.plan_tier NOT NULL DEFAULT 'starter',
  status text NOT NULL DEFAULT 'active',
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own subscription" ON public.subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create a Starter subscription whenever a profile is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.subscriptions (user_id, tier) VALUES (NEW.id, 'starter');
  RETURN NEW;
END;
$$;

-- Backfill existing users
INSERT INTO public.subscriptions (user_id, tier)
SELECT id, 'starter' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
