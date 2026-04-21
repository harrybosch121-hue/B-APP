import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtINR, fmtDate } from "@/lib/format";
import { Search, Plus } from "lucide-react";
import type { Screen } from "@/App";

interface Props {
  navigate: (s: Screen, ctx?: { invoiceId?: string }) => void;
}

export default function InvoicesScreen({ navigate }: Props) {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["invoices", { q, mode, status }],
    queryFn: () =>
      api.getInvoices({
        ...(q ? { q } : {}),
        ...(mode ? { mode } : {}),
        ...(status ? { status } : {}),
      }),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl md:text-4xl tracking-wide">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">{data?.length || 0} records</p>
        </div>
        <button
          onClick={() => navigate("invoice-new")}
          className="bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-medium shadow btn-press hover:opacity-95 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Invoice
        </button>
      </header>

      <div className="premium-card rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search invoice # or party..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none text-sm"
          />
        </div>
        <select value={mode} onChange={(e) => setMode(e.target.value)} className="rounded-lg bg-background/60 border border-border px-3 py-2.5 text-sm">
          <option value="">All modes</option>
          <option value="Cash">Cash</option>
          <option value="Credit">Credit</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg bg-background/60 border border-border px-3 py-2.5 text-sm">
          <option value="">All status</option>
          <option value="Active">Active</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      <div className="premium-card rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading...</div>
        ) : !data?.length ? (
          <div className="p-12 text-center text-muted-foreground">No invoices found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Party</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate("invoice-detail", { invoiceId: inv.id })}
                    className="border-t border-border/20 hover:bg-muted/30 cursor-pointer transition"
                  >
                    <td className="py-3 px-4 font-medium">
                      #{inv.invoice_no}
                      {inv.voucher_type === 'SaleReturn' && (
                        <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">RETURN</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{fmtDate(inv.date)}</td>
                    <td className="py-3 px-4">{inv.party_name || "—"}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${inv.payment_mode === 'Cash' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
                        {inv.payment_mode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">{inv.source}</td>
                    <td className={`py-3 px-4 text-right font-medium ${inv.voucher_type === 'SaleReturn' ? 'text-destructive' : ''}`}>{fmtINR(inv.total)}</td>
                    <td className="py-3 px-4 text-right text-xs">
                      {inv.status === 'Cancelled' ? <span className="text-destructive">Cancelled</span> : <span className="text-success">Active</span>}
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
