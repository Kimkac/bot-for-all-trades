import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Plug, Bot, LogOut, CreditCard, HeartPulse } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/exchanges", label: "Exchanges", icon: Plug },
  { to: "/bots", label: "Bots", icon: Bot },
  { to: "/billing", label: "Plans", icon: CreditCard },
  { to: "/health", label: "Site health", icon: HeartPulse },
] as const;

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const alerted = useRef<string | null>(null);

  const { data: lastCheck } = useQuery({
    queryKey: ["health-checks", "latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("health_checks")
        .select("id, ok, failed_count, checked_at")
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!lastCheck || lastCheck.ok) return;
    if (alerted.current === lastCheck.id) return;
    alerted.current = lastCheck.id;
    toast.error(`Site health: ${lastCheck.failed_count} check(s) failing`, {
      description: "Open Site health for details.",
      duration: 10_000,
    });
  }, [lastCheck]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4 font-semibold tracking-tight">
          <img
            src="/favicon.png"
            alt="Tradedesk"
            width={28}
            height={28}
            className="h-7 w-7 rounded-md object-cover"
          />
          Tradedesk
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.to === "/health" && lastCheck && !lastCheck.ok && (
                  <span className="ml-auto h-2 w-2 rounded-full bg-destructive" />
                )}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={signOut}
          className="m-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border bg-background/80 px-8 py-6 backdrop-blur">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}