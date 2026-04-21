import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Party } from "@/lib/api";
import { fmtINR, fmtDate } from "@/lib/format";
import { Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import type { Screen } from "@/App";

interface Props {
  navigate: (s: Screen, ctx?: { partyId?: string }) => void;
}

export default function PartiesScreen({ navigate }: Props) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["parties"], queryFn: api.getParties });
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Partial<Party>>({ name: "", phone: "", address: "", state: "", gstin: "", party_type: "Customer", opening_balance: 0 });

  const handleCreate = async () => {
    if (!draft.name) return toast.error("Name required");
    try {
      await api.createParty(draft);
      toast.success("Customer added");
      setShowForm(false);
      setDraft({ name: "", phone: "", address: "", state: "", gstin: "", party_type: "Customer", opening_balance: 0 });
      qc.invalidateQueries({ queryKey: ["parties"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const filtered = (data || []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.phone || "").includes(q));

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl md:text-4xl tracking-wide">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">{data?.length || 0} parties</p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-medium shadow btn-press hover:opacity-95 flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Customer
        </button>
      </header>

      <div className="premium-card rounded-2xl p-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone..." className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none text-sm" />
        </div>
      </div>

      <div className="premium-card rounded-2xl overflow-hidden">
        {isLoading ? <div className="p-12 text-center text-muted-foreground">Loading...</div> :
         !filtered.length ? <div className="p-12 text-center text-muted-foreground">No customers found.</div> :
         <div className="overflow-x-auto">
           <table className="w-full text-sm">
             <thead className="bg-muted/30">
               <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                 <th className="py-3 px-4">Name</th>
                 <th className="py-3 px-4">State</th>
                 <th className="py-3 px-4 text-right">Invoices</th>
                 <th className="py-3 px-4">Last Sale</th>
                 <th className="py-3 px-4 text-right">Total Business</th>
                 <th className="py-3 px-4 text-right">Outstanding</th>
               </tr>
             </thead>
             <tbody>
               {filtered.map((p) => {
                 const overLimit = (p.credit_limit || 0) > 0 && (p.outstanding || 0) > (p.credit_limit || 0);
                 return (
                   <tr key={p.id} onClick={() => navigate("party-detail", { partyId: p.id })} className="border-t border-border/20 hover:bg-muted/30 cursor-pointer">
                     <td className="py-3 px-4 font-medium">{p.name}</td>
                     <td className="py-3 px-4 text-muted-foreground text-xs">{p.state || "—"}</td>
                     <td className="py-3 px-4 text-right text-muted-foreground">{p.invoice_count || 0}</td>
                     <td className="py-3 px-4 text-muted-foreground text-xs">{p.last_invoice_date ? fmtDate(p.last_invoice_date) : "—"}</td>
                     <td className="py-3 px-4 text-right text-muted-foreground">{p.total_invoiced ? fmtINR(p.total_invoiced) : "—"}</td>
                     <td className={`py-3 px-4 text-right font-medium ${overLimit ? "text-destructive" : (p.outstanding || 0) > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                       {fmtINR(p.outstanding || 0)}{overLimit && " ⚠"}
                     </td>
                   </tr>
                 );
               })}
             </tbody>
           </table>
         </div>
        }
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto animate-fade-in" onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} className="glass rounded-2xl p-6 w-full max-w-md my-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-2xl">New Customer</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              {[
                { k: "name", label: "Name *" },
                { k: "phone", label: "Phone" },
                { k: "address", label: "Address" },
                { k: "state", label: "State (for GST)" },
                { k: "gstin", label: "GSTIN" },
              ].map(({ k, label }) => (
                <div key={k}>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
                  <input value={(draft as any)[k] || ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none" />
                </div>
              ))}
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Opening Balance (\u20B9)</label>
                <input type="number" value={draft.opening_balance ?? 0} onChange={(e) => setDraft({ ...draft, opening_balance: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none" />
                <p className="text-[10px] text-muted-foreground mt-1">Positive = customer owes you. Negative = advance paid.</p>
              </div>
              <button onClick={handleCreate} className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 font-medium btn-press hover:opacity-95 mt-2">Create Customer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
