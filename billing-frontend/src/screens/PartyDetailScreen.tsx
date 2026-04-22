import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtINR, fmtDate, todayISO } from "@/lib/format";
import { ArrowLeft, Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import type { Screen } from "@/App";

interface Props {
  navigate: (s: Screen, ctx?: { invoiceId?: string }) => void;
  goBack?: (fallback?: Screen) => void;
  id: string;
}

export default function PartyDetailScreen({ navigate, goBack, id }: Props) {
  const qc = useQueryClient();
  const { data: party, isLoading } = useQuery({ queryKey: ["party", id], queryFn: () => api.getParty(id) });
  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount] = useState<number | "">("");
  const [payMode, setPayMode] = useState("Cash");
  const [payDate, setPayDate] = useState(todayISO());
  const [payNotes, setPayNotes] = useState("");

  if (isLoading || !party) return <div className="text-muted-foreground">Loading...</div>;

  const handleAddPayment = async () => {
    if (!payAmount || Number(payAmount) <= 0) return toast.error("Amount required");
    try {
      await api.createPayment({ party_id: id, amount: Number(payAmount), mode: payMode, date: payDate, notes: payNotes || null });
      toast.success("Payment recorded");
      setShowPayment(false);
      setPayAmount("");
      setPayNotes("");
      qc.invalidateQueries({ queryKey: ["party", id] });
      qc.invalidateQueries({ queryKey: ["parties"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const overLimit = (party.credit_limit || 0) > 0 && (party.outstanding || 0) > (party.credit_limit || 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex items-center justify-between">
        <button onClick={() => goBack ? goBack("parties") : navigate("parties")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground btn-press">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("party-statement")} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm btn-press hover:bg-muted/40">
            <Printer className="w-4 h-4" /> Statement
          </button>
          <button onClick={() => setShowPayment(true)} className="bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-medium shadow btn-press hover:opacity-95 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Record Payment
          </button>
        </div>
      </header>

      <div className="premium-card rounded-2xl p-6 marble-noise relative grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <h1 className="font-display text-3xl md:text-4xl tracking-wide">{party.name}</h1>
          {party.address && <p className="text-sm text-muted-foreground mt-1">{party.address}</p>}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground mt-2">
            {party.phone && <span>📞 {party.phone}</span>}
            {party.gstin && <span>GSTIN: {party.gstin}</span>}
            <span>Type: {party.party_type}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Outstanding</p>
          <p className={`font-display text-3xl ${overLimit ? "text-destructive" : (party.outstanding || 0) > 0 ? "text-primary" : "text-success"}`}>
            {fmtINR(party.outstanding || 0)}
          </p>
          {(party.credit_limit || 0) > 0 && (
            <p className={`text-xs mt-1 ${overLimit ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              Credit limit: {fmtINR(party.credit_limit)}
              {overLimit && " — EXCEEDED ⚠"}
            </p>
          )}
        </div>
      </div>

      <div className="premium-card rounded-2xl p-6">
        <h2 className="font-display text-2xl mb-4">Account Ledger</h2>
        <PartyLedger id={id} navigate={navigate} />
      </div>

      {showPayment && (
        <div className="fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowPayment(false)}>
          <div onClick={(e) => e.stopPropagation()} className="glass rounded-2xl p-6 w-full max-w-md">
            <h2 className="font-display text-2xl mb-4">Record Payment</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Amount</label>
                <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value === "" ? "" : Number(e.target.value))} className="w-full mt-1 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">Mode</label>
                  <select value={payMode} onChange={(e) => setPayMode(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none">
                    <option>Cash</option><option>UPI</option><option>Bank</option><option>Cheque</option><option>Acc</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">Date</label>
                  <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</label>
                <input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowPayment(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-sm btn-press">Cancel</button>
                <button onClick={handleAddPayment} className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 font-medium btn-press hover:opacity-95">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PartyLedger({ id, navigate }: { id: string; navigate: (s: Screen, ctx?: { invoiceId?: string }) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["party-ledger", id], queryFn: () => api.getPartyStatement(id) });
  if (isLoading || !data) return <p className="text-sm text-muted-foreground py-8 text-center">Loading ledger…</p>;
  const opening = Number(data.opening) || 0;
  const closing = Number(data.closing) || 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
            <th className="py-2 pr-3">Date</th>
            <th className="py-2 pr-3">Type</th>
            <th className="py-2 pr-3">Vch / Ref</th>
            <th className="py-2 pr-3 text-right">Debit</th>
            <th className="py-2 pr-3 text-right">Credit</th>
            <th className="py-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/20 bg-muted/20">
            <td className="py-2 pr-3 text-muted-foreground italic" colSpan={3}>Opening Balance</td>
            <td className="py-2 pr-3 text-right">—</td>
            <td className="py-2 pr-3 text-right">—</td>
            <td className="py-2 text-right font-medium">{fmtINR(Math.abs(opening))} {opening >= 0 ? "Dr" : "Cr"}</td>
          </tr>
          {data.ledger.length === 0 ? (
            <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No transactions in this period.</td></tr>
          ) : data.ledger.map((row, idx) => {
            const clickable = !!row.invoice_id;
            return (
              <tr
                key={idx}
                onClick={() => clickable && navigate("invoice-detail", { invoiceId: row.invoice_id! })}
                className={`border-b border-border/20 ${clickable ? "hover:bg-muted/30 cursor-pointer" : ""}`}
              >
                <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{fmtDate(row.date)}</td>
                <td className="py-2 pr-3 text-xs">{row.type}</td>
                <td className="py-2 pr-3 text-xs font-medium">{row.ref || "—"}</td>
                <td className="py-2 pr-3 text-right">{row.debit ? fmtINR(row.debit) : "—"}</td>
                <td className="py-2 pr-3 text-right text-success">{row.credit ? fmtINR(row.credit) : "—"}</td>
                <td className="py-2 text-right font-medium">{fmtINR(Math.abs(row.balance))} {row.balance >= 0 ? "Dr" : "Cr"}</td>
              </tr>
            );
          })}
          <tr className="bg-muted/30">
            <td className="py-3 pr-3 font-display text-base" colSpan={5}>Closing Balance</td>
            <td className={`py-3 text-right font-display text-base ${closing > 0 ? "text-primary" : closing < 0 ? "text-success" : ""}`}>
              {fmtINR(Math.abs(closing))} {closing >= 0 ? "Dr" : "Cr"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
