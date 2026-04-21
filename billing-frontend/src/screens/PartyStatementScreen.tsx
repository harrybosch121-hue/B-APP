import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtINR, fmtDate } from "@/lib/format";
import { ArrowLeft, Printer } from "lucide-react";
import type { Screen } from "@/App";

interface Props {
  navigate: (s: Screen) => void;
  id: string;
}

export default function PartyStatementScreen({ navigate, id }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["party-statement", id, from, to],
    queryFn: () => api.getPartyStatement(id, from || undefined, to || undefined),
  });

  if (isLoading || !data) return <div className="text-muted-foreground">Loading...</div>;
  const p = data.party;

  return (
    <div className="space-y-6 animate-fade-in">
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .premium-card { box-shadow: none !important; border: 1px solid #ccc !important; background: white !important; }
          .print-area { padding: 0 !important; }
        }
      `}</style>

      <header className="flex items-center justify-between flex-wrap gap-3 no-print">
        <button onClick={() => navigate("party-detail")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground btn-press">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-muted-foreground">From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-2 px-2 py-1 rounded border border-border bg-background/60 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-2 px-2 py-1 rounded border border-border bg-background/60 text-sm" />
          </label>
          <button onClick={() => window.print()} className="bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-medium shadow btn-press hover:opacity-95 flex items-center gap-2">
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </header>

      <div className="premium-card rounded-2xl p-8 print-area space-y-6">
        <div className="flex items-start justify-between gap-6 border-b border-border/40 pb-4">
          <div>
            <h1 className="font-display text-3xl">{p.name}</h1>
            {p.address && <p className="text-sm text-muted-foreground mt-1 max-w-md">{p.address}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
              {p.phone && <span>📞 {p.phone}</span>}
              {p.gstin && <span>GSTIN: {p.gstin}</span>}
              {p.state && <span>State: {p.state}</span>}
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl">Statement of Account</p>
            <p className="text-xs text-muted-foreground mt-1">
              {data.from ? fmtDate(data.from) : "Inception"} → {data.to ? fmtDate(data.to) : fmtDate(data.generatedAt.slice(0, 10))}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">Generated {fmtDate(data.generatedAt.slice(0, 10))}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-background/40 rounded-xl p-3 border border-border/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Opening</p>
            <p className="font-display text-xl mt-1">{fmtINR(data.opening)}</p>
          </div>
          <div className="bg-background/40 rounded-xl p-3 border border-border/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Entries</p>
            <p className="font-display text-xl mt-1">{data.ledger.length}</p>
          </div>
          <div className="bg-background/40 rounded-xl p-3 border border-border/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Closing</p>
            <p className={`font-display text-xl mt-1 ${data.closing > 0 ? "text-primary" : data.closing < 0 ? "text-success" : ""}`}>
              {fmtINR(data.closing)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Particulars</th>
                <th className="py-2 pr-3">Ref</th>
                <th className="py-2 pr-3 text-right">Debit</th>
                <th className="py-2 pr-3 text-right">Credit</th>
                <th className="py-2 pr-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/20 bg-muted/20">
                <td className="py-2 pr-3 text-muted-foreground" colSpan={5}><em>Opening Balance</em></td>
                <td className="py-2 pr-3 text-right font-medium">{fmtINR(data.opening)}</td>
              </tr>
              {data.ledger.map((row, i) => (
                <tr key={i} className="border-b border-border/20">
                  <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{fmtDate(row.date)}</td>
                  <td className="py-2 pr-3">{row.type}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{row.ref}</td>
                  <td className="py-2 pr-3 text-right">{row.debit ? fmtINR(row.debit) : "—"}</td>
                  <td className="py-2 pr-3 text-right">{row.credit ? fmtINR(row.credit) : "—"}</td>
                  <td className="py-2 pr-3 text-right font-medium">{fmtINR(row.balance)}</td>
                </tr>
              ))}
              <tr className="bg-muted/30 font-medium">
                <td className="py-3 pr-3" colSpan={5}>Closing Balance</td>
                <td className="py-3 pr-3 text-right font-display text-lg">{fmtINR(data.closing)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {data.ledger.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No transactions in this period.</p>
        )}
      </div>
    </div>
  );
}
