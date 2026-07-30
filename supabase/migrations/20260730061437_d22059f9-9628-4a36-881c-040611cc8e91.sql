REVOKE INSERT, UPDATE ON public.trades FROM authenticated, anon;
REVOKE INSERT, UPDATE ON public.signals FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.equity_snapshots FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated, anon;

GRANT ALL ON public.trades TO service_role;
GRANT ALL ON public.signals TO service_role;
GRANT ALL ON public.equity_snapshots TO service_role;
GRANT ALL ON public.subscriptions TO service_role;