import { useState } from "react";
import { LayoutDashboard, FileText, Users, Package, BarChart3, Upload, LogOut, Plus, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Screen } from "@/App";

interface MobileNavProps {
  active: Screen;
  navigate: (s: Screen) => void;
  onLogout: () => void;
}

const tabs: { id: Screen; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "parties", label: "Customers", icon: Users },
  { id: "items", label: "Items", icon: Package },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "import", label: "Busy Import", icon: Upload },
];

export default function MobileNav({ active, navigate, onLogout }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  const go = (s: Screen) => {
    navigate(s);
    setOpen(false);
  };

  return (
    <>
      <header className="md:hidden sticky top-0 z-30 glass border-b border-border/50 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="p-2 -ml-2 rounded-lg hover:bg-muted/40 btn-press"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="font-display text-lg tracking-wide">BALAJI TILES</h1>
        <button
          onClick={() => navigate("invoice-new")}
          aria-label="New invoice"
          className="p-2 -mr-2 rounded-lg bg-primary text-primary-foreground btn-press"
        >
          <Plus className="w-5 h-5" />
        </button>
      </header>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-charcoal/40 backdrop-blur-sm animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-0 h-full w-72 max-w-[85%] glass border-r border-border/50 flex flex-col shadow-2xl"
          >
            <div className="p-5 border-b border-border/40 flex items-center justify-between">
              <div>
                <h1 className="font-display text-xl tracking-wide">BALAJI TILES</h1>
                <p className="text-[10px] uppercase tracking-[0.25em] text-primary mt-1">Billing & Accounts</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="p-2 rounded-lg hover:bg-muted/40 btn-press">
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 mt-4 px-3 space-y-1 overflow-y-auto">
              {tabs.map((t) => {
                const Icon = t.icon;
                const isActive =
                  active === t.id ||
                  (t.id === "invoices" && (active === "invoice-new" || active === "invoice-edit" || active === "invoice-detail")) ||
                  (t.id === "parties" && (active === "party-detail" || active === "party-statement"));
                return (
                  <button
                    key={t.id}
                    onClick={() => go(t.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all text-sm btn-press",
                      isActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="w-4 h-4" strokeWidth={isActive ? 2.5 : 1.75} />
                    <span className="font-body tracking-wide">{t.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-4 border-t border-border/40">
              <button
                onClick={() => { onLogout(); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition text-sm btn-press"
              >
                <LogOut className="w-4 h-4" />
                <span className="font-body">Logout</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
