import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtINR } from "@/lib/format";
import { TrendingUp, FileText, Users, Package, AlertCircle } from "lucide-react";
import type { Screen } from "@/App";

interface Props {
  navigate: (s: Screen, ctx?: { invoiceId?: string; partyId?: string }) => void;
}

export default function DashboardScreen({ navigate }: Props) {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });
  const { data: recent } = useQuery({ queryKey: ["recent-invoices"], queryFn: () => api.getInvoices({ limit: "8" }) });

  const cards = [
    { label: "Today's Sales", value: fmtINR(data?.today?.sales || 0), sub: `${data?.today?.invoice_count || 0} invoices`, icon: TrendingUp, color: "text-primary" },
    { label: "This Month", value: fmtINR(data?.month?.sales || 0), sub: `${data?.month?.invoice_count || 0} invoices`, icon: FileText, color: "text-foreground" },
    { label: "Outstanding", value: fmtINR(data?.outstanding || 0), sub: "Credit unpaid", icon: AlertCircle, color: "text-destructive" },
    { label: "Customers", value: String(data?.partiesCount || 0), sub: `${data?.itemsCount || 0} items`, icon: Users, color: "text-foreground" },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl md:text-4xl tracking-wide">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Overview of today's activity</p>
        </div>
        <button
          onClick={() => navigate("invoice-new")}
          className="bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-medium shadow btn-press hover:opacity-95"
        >
          + New Invoice
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="premium-card rounded-2xl p-5 marble-noise relative">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-body">{c.label}</span>
                <Icon className={`w-4 h-4 ${c.color}`} />
              </div>
              <div className="mt-3 font-display text-3xl tracking-wide">{isLoading ? "—" : c.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="premium-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl">Recent Invoices</h2>
          <button onClick={() => navigate("invoices")} className="text-xs text-primary hover:underline">View all →</button>
        </div>
        {!recent?.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No invoices yet. Create your first one.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <th className="py-2 pr-3">Invoice #</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Party</th>
                  <th className="py-2 pr-3">Mode</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pl-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate("invoice-detail", { invoiceId: inv.id })}
                    className="border-b border-border/20 hover:bg-muted/30 cursor-pointer transition"
                  >
                    <td className="py-2.5 pr-3 font-medium">#{inv.invoice_no}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{inv.date}</td>
                    <td className="py-2.5 pr-3">{inv.party_name || "—"}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${inv.payment_mode === 'Cash' ? 'bg-success/10 text-success' : inv.payment_mode === 'Acc' ? 'bg-amber-500/10 text-amber-600' : 'bg-primary/10 text-primary'}`}>
                        {inv.payment_mode}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium">{fmtINR(inv.total)}</td>
                    <td className="py-2.5 pl-3 text-right text-xs">
                      {inv.status === 'Cancelled' ? <span className="text-destructive">Cancelled</span> : <span className="text-muted-foreground">Active</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
