import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Party } from "@/lib/api";
import { fmtINR, fmtDate } from "@/lib/format";
import { Search, Users } from "lucide-react";

export default function SundryDebtorsScreen() {
  const { data, isLoading } = useQuery({ queryKey: ["parties"], queryFn: api.getParties });
  const [q, setQ] = useState("");

  // Only customers (Sundry Debtors = party_type 'Customer'), sorted A-Z by name
  const debtors = (data || [])
    .filter(
      (p) =>
        p.party_type === "Customer" &&
        (!q || p.name.toLowerCase().includes(q.toLowerCase()))
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const totalOutstanding = debtors.reduce((s, d) => s + (d.outstanding || 0), 0);
  const totalInvoiced = debtors.reduce((s, d) => s + (d.total_invoiced || 0), 0);
  const overdueCount = debtors.filter((d) => (d.outstanding || 0) > 0).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h1 className="font-display text-3xl md:text-4xl tracking-wide">Sundry Debtors</h1>
        <p className="text-sm text-muted-foreground mt-1">{debtors.length} debtor{debtors.length !== 1 ? "s" : ""} · Busy import via Sundry Debtors ledger</p>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total Debtors" value={String(debtors.length)} icon={<Users className="w-4 h-4" />} />
        <SummaryCard label="Total Invoiced" value={fmtINR(totalInvoiced)} />
        <SummaryCard label="Outstanding" value={fmtINR(totalOutstanding)} highlight={totalOutstanding > 0 ? "destructive" : "success"} />
        <SummaryCard label="With Dues" value={String(overdueCount)} highlight="warning" />
      </div>

      {/* Search */}
      <div className="premium-card rounded-2xl p-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none text-sm"
          />
        </div>
      </div>

      {/* Debtors table */}
      <div className="premium-card rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading...</div>
        ) : !debtors.length ? (
          <div className="p-12 text-center text-muted-foreground">No debtors found. Import a Busy masters file to populate.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 px-4 whitespace-nowrap">Name</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Op. Bal.</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Cr. Limit</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Invoiced</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Paid</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Outstanding</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Last Sale</th>
                </tr>
              </thead>
              <tbody>
                {debtors.map((d) => {
                  const out = d.outstanding || 0;
                  const overLimit = (d.credit_limit || 0) > 0 && out > (d.credit_limit || 0);
                  const outColor = out > 0 ? "text-destructive" : out < 0 ? "text-success" : "text-muted-foreground";
                  return (
                    <tr key={d.id} className="border-t border-border/20 hover:bg-muted/30">
                      <td className="py-3 px-4 font-medium whitespace-nowrap">
                        <div>{d.name}</div>
                        {d.print_name && d.print_name !== d.name && (
                          <div className="text-[10px] text-muted-foreground">{d.print_name}</div>
                        )}
                      </td>

                      <td className={`py-3 px-4 text-right font-medium whitespace-nowrap ${d.opening_balance > 0 ? "text-destructive" : d.opening_balance < 0 ? "text-success" : "text-muted-foreground"}`}>
                        {fmtINR(d.opening_balance)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap text-muted-foreground">{d.credit_limit ? fmtINR(d.credit_limit) : "—"}</td>
                      <td className="py-3 px-4 text-right whitespace-nowrap text-muted-foreground">{d.total_invoiced ? fmtINR(d.total_invoiced) : "—"}</td>
                      <td className="py-3 px-4 text-right whitespace-nowrap text-muted-foreground">{d.total_paid ? fmtINR(d.total_paid) : "—"}</td>
                      <td className={`py-3 px-4 text-right font-semibold whitespace-nowrap ${outColor}`}>
                        {fmtINR(out)}{overLimit && <span title="Over credit limit" className="ml-1">⚠</span>}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap text-muted-foreground text-xs">{d.last_invoice_date ? fmtDate(d.last_invoice_date) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, highlight, icon }: { label: string; value: string; highlight?: string; icon?: React.ReactNode }) {
  const colorMap: Record<string, string> = {
    destructive: "text-destructive",
    success: "text-success",
    warning: "text-amber-500",
  };
  return (
    <div className="premium-card rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <p className={`font-display text-xl md:text-2xl mt-1 ${highlight ? colorMap[highlight] || "" : ""}`}>{value}</p>
    </div>
  );
}
