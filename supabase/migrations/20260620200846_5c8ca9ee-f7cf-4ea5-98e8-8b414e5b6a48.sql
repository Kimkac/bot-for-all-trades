
-- Roles (separate table — prevents privilege escalation)
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Trigger: auto-create profile + role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Generic updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Exchanges
CREATE TYPE public.exchange_kind AS ENUM ('binance', 'coinbase', 'alpaca');
CREATE TYPE public.exchange_mode AS ENUM ('live', 'demo');

CREATE TABLE public.exchange_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange public.exchange_kind NOT NULL,
  mode public.exchange_mode NOT NULL DEFAULT 'demo',
  label TEXT NOT NULL,
  -- encrypted ciphertext (base64) of API credentials, server-side only
  api_key_enc TEXT NOT NULL,
  api_secret_enc TEXT NOT NULL,
  passphrase_enc TEXT,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_accounts TO authenticated;
GRANT ALL ON public.exchange_accounts TO service_role;
ALTER TABLE public.exchange_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own exchange accounts" ON public.exchange_accounts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER exchange_accounts_updated_at BEFORE UPDATE ON public.exchange_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Bots
CREATE TYPE public.bot_status AS ENUM ('stopped', 'running', 'error');
CREATE TYPE public.strategy_kind AS ENUM ('sma_crossover', 'rsi_reversion', 'grid', 'dca');

CREATE TABLE public.bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.exchange_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '1m',
  strategy public.strategy_kind NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.bot_status NOT NULL DEFAULT 'stopped',
  max_position NUMERIC NOT NULL DEFAULT 0,
  max_daily_loss NUMERIC NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  last_tick_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bots TO authenticated;
GRANT ALL ON public.bots TO service_role;
ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bots" ON public.bots FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER bots_updated_at BEFORE UPDATE ON public.bots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Signals
CREATE TYPE public.signal_kind AS ENUM ('buy', 'sell', 'hold');

CREATE TABLE public.signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind public.signal_kind NOT NULL,
  price NUMERIC,
  reason TEXT
);
CREATE INDEX signals_bot_ts_idx ON public.signals (bot_id, ts DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signals TO authenticated;
GRANT ALL ON public.signals TO service_role;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own signals" ON public.signals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own signals" ON public.signals FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Trades
CREATE TYPE public.trade_side AS ENUM ('buy', 'sell');
CREATE TYPE public.trade_status AS ENUM ('pending', 'filled', 'cancelled', 'rejected');

CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  side public.trade_side NOT NULL,
  qty NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  fee NUMERIC NOT NULL DEFAULT 0,
  order_id TEXT,
  status public.trade_status NOT NULL DEFAULT 'pending',
  raw JSONB
);
CREATE INDEX trades_bot_ts_idx ON public.trades (bot_id, ts DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own trades" ON public.trades FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own trades" ON public.trades FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Equity snapshots
CREATE TABLE public.equity_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  equity NUMERIC NOT NULL,
  pnl NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX equity_bot_ts_idx ON public.equity_snapshots (bot_id, ts DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equity_snapshots TO authenticated;
GRANT ALL ON public.equity_snapshots TO service_role;
ALTER TABLE public.equity_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own equity snapshots" ON public.equity_snapshots FOR SELECT TO authenticated USING (auth.uid() = user_id);
