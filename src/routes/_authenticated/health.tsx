import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Activity, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CheckResult = {
  path: string;
  label: string;
  status: number | null;
  ok: boolean;
  ms: number;
  error?: string;
};

export const Route = createFileRoute("/_authenticated/health")({
  component: HealthPage,
});

export function useHealthRuns(limit = 20) {
  return useQuery({
    queryKey: ["health-checks", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("health_checks")
        .select("*")
        .order("checked_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });
}

function HealthPage() {
  const { data: runs, isLoading } = useHealthRuns();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  const latest = runs?.[0];
  const results = (latest?.results as unknown as CheckResult[] | null) ?? [];

  async function runNow() {
    setRunning(true);
    try {
      const res = await fetch("/api/public/health-check", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; failed_count?: number; error?: string };
      if (json.ok) toast.success("All checks passed");
      else toast.error(`${json.failed_count ?? "?"} check(s) failing`, { description: json.error });
      await queryClient.invalidateQueries({ queryKey: ["health-checks"] });
    } catch (e) {
      toast.error("Health check could not run", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Site health"
        description="Automated checks run every 15 minutes against the published site."
        actions={
          <Button onClick={runNow} disabled={running} size="sm">
            <RefreshCw className={cn("mr-2 h-4 w-4", running && "animate-spin")} />
            {running ? "Checking…" : "Run check now"}
          </Button>
        }
      />

      <div className="space-y-6 p-8">
        {isLoading && <p className="text-sm text-muted-foreground">Loading health history…</p>}

        {!isLoading && !latest && (
          <p className="text-sm text-muted-foreground">
            No checks recorded yet — run one now to create the first snapshot.
          </p>
        )}

        {latest && (
          <div
            className={cn(
              "rounded-lg border p-5",
              latest.ok
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-destructive/40 bg-destructive/5",
            )}
          >
            <div className="flex flex-wrap items-center gap-3">
              {latest.ok ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              <span className="text-lg font-semibold">
                {latest.ok ? "All systems operational" : `${latest.failed_count} check(s) failing`}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(latest.checked_at).toLocaleString()} · {latest.duration_ms} ms ·{" "}
                {latest.base_url}
              </span>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {results.map((r) => (
                <div
                  key={r.path}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.label}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{r.path}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className={cn(
                        "font-mono text-sm",
                        r.ok ? "text-emerald-400" : "text-destructive",
                      )}
                    >
                      {r.status ?? "ERR"}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.ms} ms</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {runs && runs.length > 1 && (
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Activity className="h-4 w-4" /> Recent runs
            </h2>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(run.checked_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <span className={run.ok ? "text-emerald-400" : "text-destructive"}>
                          {run.ok ? "Healthy" : `${run.failed_count} failing`}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                        {run.duration_ms} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}