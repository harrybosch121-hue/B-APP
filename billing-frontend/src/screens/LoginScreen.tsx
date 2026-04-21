import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Lock } from "lucide-react";

export default function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.login(username, password);
      localStorage.setItem("billing_auth_token", res.token);
      toast.success("Welcome back");
      onLogin();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen premium-bg flex items-center justify-center p-6">
      <div className="spotlight relative w-full max-w-sm">
        <div className="glass rounded-2xl p-8 relative z-10 marble-noise">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <h1 className="font-display text-3xl tracking-wide">BALAJI TILES</h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-primary mt-1">Billing & Accounts</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-body">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full mt-1.5 px-4 py-2.5 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none transition"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-body">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full mt-1.5 px-4 py-2.5 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none transition"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 font-medium tracking-wide btn-press disabled:opacity-60 hover:opacity-95 transition shadow-md"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
