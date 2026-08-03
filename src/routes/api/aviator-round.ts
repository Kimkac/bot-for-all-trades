import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/aviator-round")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("authorization");
        if (!apiKey || !apiKey.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const token = apiKey.replace("Bearer ", "");

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return Response.json({ error: "Server misconfigured" }, { status: 500 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
        if (authErr || !claims?.claims?.sub) {
          return Response.json({ error: "Invalid token" }, { status: 401 });
        }

        let body: { action: string; round_id?: string; crash_point?: number };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const { action } = body;

        try {
          if (action === "create_round") {
            // Generate crash point: provably fair-ish
            // 3% instant crash (1.00x), otherwise exponential distribution
            const rand = Math.random();
            let crashPoint: number;
            if (rand < 0.03) {
              crashPoint = 1.0;
            } else {
              // House edge ~3%, median ~2x
              const e = Math.random();
              crashPoint = Math.max(1.0, Math.floor((1 / (1 - e * 0.97)) * 100) / 100);
              crashPoint = Math.min(crashPoint, 1000);
            }

            const { data: roundNum } = await supabase.rpc("get_next_round_number");
            const roundNumber = roundNum as number;

            const { data: round, error } = await supabase
              .from("aviator_rounds")
              .insert({
                round_number: roundNumber,
                crash_point: crashPoint,
                status: "flying",
                started_at: new Date().toISOString(),
              })
              .select("id, round_number, crash_point, status, created_at, started_at, ended_at")
              .single();

            if (error) return Response.json({ error: error.message }, { status: 500 });
            return Response.json({ round });
          }

          if (action === "crash_round") {
            if (!body.round_id) return Response.json({ error: "round_id required" }, { status: 400 });

            const { error: crashErr } = await supabase
              .from("aviator_rounds")
              .update({ status: "crashed", ended_at: new Date().toISOString() })
              .eq("id", body.round_id);

            if (crashErr) return Response.json({ error: crashErr.message }, { status: 500 });

            // Mark all active bets as lost
            const { error: betErr } = await supabase
              .from("aviator_bets")
              .update({ status: "lost" })
              .eq("round_id", body.round_id)
              .eq("status", "active");

            if (betErr) return Response.json({ error: betErr.message }, { status: 500 });

            return Response.json({ success: true });
          }

          return Response.json({ error: "Unknown action" }, { status: 400 });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Server error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
