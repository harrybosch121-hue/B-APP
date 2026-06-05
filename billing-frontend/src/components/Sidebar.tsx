import { LayoutDashboard, FileText, Users, Package, BarChart3, Upload, LogOut, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Screen } from "@/App";

interface SidebarProps {
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

export default function Sidebar({ active, navigate, onLogout }: SidebarProps) {
  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 glass border-r border-border/50 sticky top-0 h-screen z-20">
      <div className="p-6 border-b border-border/40">
        <h1 className="font-display text-2xl tracking-wide text-foreground">BALAJI TILES</h1>
        <p className="text-[10px] uppercase tracking-[0.25em] text-primary mt-1 font-body">Billing & Accounts</p>
      </div>

      <div className="px-4 pt-4">
        <button
          onClick={() => navigate("invoice-new")}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-2.5 px-4 font-medium text-sm shadow-md btn-press hover:opacity-95 transition"
        >
          <Plus className="w-4 h-4" /> New Invoice
        </button>
      </div>

      <nav className="flex-1 mt-6 px-3 space-y-1 overflow-y-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive =
            active === t.id ||
            (t.id === "invoices" && (active === "invoice-new" || active === "invoice-edit" || active === "invoice-detail")) ||
            (t.id === "parties" && active === "party-detail");
          return (
            <button
              key={t.id}
              onClick={() => navigate(t.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm btn-press",
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
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition text-sm btn-press"
        >
          <LogOut className="w-4 h-4" />
          <span className="font-body">Logout</span>
        </button>
      </div>
    </aside>
  );
}
