import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Require 6+ chars with at least one letter and one number
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;
function validatePassword(pw: string): string | null {
  if (pw.length < 6) return "Password must be at least 6 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw))
    return "Password must include both letters and numbers.";
  return null;
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Tradedesk" },
      { name: "description", content: "Sign in or create your Tradedesk account to manage trading bots." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    const err = validatePassword(password);
    if (err) return toast.error(err);
    setLoading(true);
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined;
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    if (!data.session) {
      // Auto-confirm is on: sign in immediately so the user lands authenticated.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setLoading(false);
        toast.success("Account created. Please sign in.");
        return;
      }
    }
    setLoading(false);
    toast.success("Account created.");
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleRecover() {
    if (!email) return toast.error("Enter your email above, then tap Recover.");
    setRecovering(true);
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setRecovering(false);
    if (error) return toast.error(error.message);
    toast.success("Password reset link sent. Check your inbox.");
  }

  return (
    <div className="relative grid min-h-screen w-full place-items-center overflow-hidden bg-background p-4">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-[15%] -left-[15%] h-[45%] w-[45%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute -bottom-[15%] -right-[15%] h-[45%] w-[45%] rounded-full bg-success/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-[350px]">
        {/* Decorative accents */}
        <div className="absolute -right-1 top-1/2 h-12 w-[2px] -translate-y-1/2 rounded-full bg-primary/40 blur-[1px]" />
        <div className="absolute -left-1 top-1/3 h-8 w-[2px] -translate-y-1/2 rounded-full bg-success/40 blur-[1px]" />

        {/* Main card */}
        <div className="relative rounded-2xl border border-white/10 bg-card/80 p-6 shadow-2xl backdrop-blur-xl">
          {/* Header */}
          <div className="mb-8 flex flex-col items-center">
            <Link
              to="/"
              className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/5"
            >
              <img src="/favicon.png" alt="Tradedesk" width={40} height={40} className="h-8 w-8 rounded-lg object-cover" />
            </Link>
            <h1 className="font-sans text-xl font-semibold tracking-tight text-foreground">TRADEDESK</h1>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Secure Terminal v4.2</p>
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="mb-8 flex w-full gap-1 rounded-lg border border-white/5 bg-black/40 p-1">
              <TabsTrigger
                value="signin"
                className="flex-1 rounded-md py-2 text-sm font-medium transition-all data-[state=active]:bg-white/5 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
              >
                Sign In
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="flex-1 rounded-md py-2 text-sm font-medium transition-all data-[state=active]:bg-white/5 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
              >
                Sign Up
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-5">
                <div className="space-y-1.5">
                  <Label className="ml-1 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Terminal ID
                  </Label>
                  <div className="relative group">
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="operator@tradedesk.io"
                      required
                      autoComplete="email"
                      className="h-11 w-full rounded-lg border border-white/10 bg-black/40 px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="h-1.5 w-1.5 rounded-full bg-success/50" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="ml-1 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      Passcode
                    </Label>
                    <button
                      type="button"
                      onClick={handleRecover}
                      disabled={recovering}
                      className="font-mono text-[10px] text-primary/80 transition-colors hover:text-primary"
                    >
                      {recovering ? "SENDING…" : "RECOVER"}
                    </button>
                  </div>
                  <PasswordField
                    value={password}
                    onChange={setPassword}
                    show={showPassword}
                    onToggle={() => setShowPassword((s) => !s)}
                    autoComplete="current-password"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 w-full rounded-lg bg-white text-sm font-semibold text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all hover:bg-gray-200 active:scale-[0.98] disabled:opacity-60"
                >
                  {loading ? "Initializing…" : "Initialize Session"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-5">
                <div className="space-y-1.5">
                  <Label className="ml-1 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Terminal ID
                  </Label>
                  <div className="relative group">
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="operator@tradedesk.io"
                      required
                      autoComplete="email"
                      className="h-11 w-full rounded-lg border border-white/10 bg-black/40 px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="h-1.5 w-1.5 rounded-full bg-success/50" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="ml-1 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Passcode
                  </Label>
                  <PasswordField
                    value={password}
                    onChange={setPassword}
                    show={showPassword}
                    onToggle={() => setShowPassword((s) => !s)}
                    autoComplete="new-password"
                    hint="At least 6 characters, mixing letters and numbers."
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading || !PASSWORD_RULE.test(password)}
                  className="h-11 w-full rounded-lg bg-white text-sm font-semibold text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all hover:bg-gray-200 active:scale-[0.98] disabled:opacity-60"
                >
                  {loading ? "Creating…" : "Initialize Session"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Footer metadata */}
          <div className="mt-8 flex items-center justify-between font-mono text-[9px] font-medium uppercase tracking-widest text-muted-foreground/70">
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              System: Online
            </span>
            <span>Encrypted 256-AES</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          autoComplete={autoComplete}
          placeholder="••••••••"
          className="h-11 w-full rounded-lg border border-white/10 bg-black/40 px-4 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint ? <p className="font-mono text-[10px] text-muted-foreground/70">{hint}</p> : null}
    </div>
  );
}
