import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — Tradedesk" },
      { name: "description", content: "Set a new password for your Tradedesk account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase JS auto-processes the recovery link and fires PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!PASSWORD_RULE.test(password)) {
      return toast.error("Password must be 6+ chars with letters and numbers.");
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated.");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="relative grid min-h-screen w-full place-items-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-[15%] -left-[15%] h-[45%] w-[45%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute -bottom-[15%] -right-[15%] h-[45%] w-[45%] rounded-full bg-success/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-[350px]">
        <div className="relative rounded-2xl border border-white/10 bg-card/80 p-6 shadow-2xl backdrop-blur-xl">
          <div className="mb-8 flex flex-col items-center">
            <Link to="/" className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/5">
              <Activity className="h-6 w-6 text-primary" />
            </Link>
            <h1 className="font-sans text-xl font-semibold tracking-tight text-foreground">RESET PASSCODE</h1>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Set a new passcode
            </p>
          </div>

          {!ready ? (
            <p className="font-mono text-xs text-muted-foreground">
              Validating recovery link… If this stays here, request a new reset link from the sign-in page.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label className="ml-1 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  New Passcode
                </Label>
                <div className="relative">
                  <Input
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="h-11 w-full rounded-lg border border-white/10 bg-black/40 px-4 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground/70">
                  At least 6 characters, mixing letters and numbers.
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading || !PASSWORD_RULE.test(password)}
                className="h-11 w-full rounded-lg bg-white text-sm font-semibold text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all hover:bg-gray-200 active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? "Updating…" : "Update Passcode"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}