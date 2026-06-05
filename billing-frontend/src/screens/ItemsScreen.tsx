import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Item, type Party } from "@/lib/api";
import { fmtINR } from "@/lib/format";
import { Plus, Search, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function ItemsScreen() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["items"], queryFn: api.getItems });
  const { data: parties } = useQuery({ queryKey: ["parties"], queryFn: api.getParties });
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Item>>({ name: "", hsn: "", unit: "Pcs", default_price: 0, purchase_price: 0, opening_stock: 0, gst_rate: 18, low_stock_threshold: 0 });
  const [pricesOpen, setPricesOpen] = useState<string | null>(null);

  const openCreate = () => { setEditingId(null); setDraft({ name: "", hsn: "", unit: "Pcs", default_price: 0, purchase_price: 0, opening_stock: 0, gst_rate: 18, low_stock_threshold: 0 }); setShowForm(true); };
  const openEdit = (it: Item) => { setEditingId(it.id); setDraft(it); setShowForm(true); };

  const handleSave = async () => {
    if (!draft.name) return toast.error("Name required");
    try {
      if (editingId) await api.updateItem(editingId, draft);
      else await api.createItem(draft);
      toast.success("Saved");
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["items"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const filtered = (data || []).filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl md:text-4xl tracking-wide">Items</h1>
          <p className="text-sm text-muted-foreground mt-1">{data?.length || 0} items</p>
        </div>
        <button onClick={openCreate} className="bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-medium shadow btn-press hover:opacity-95 flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Item
        </button>
      </header>

      <div className="premium-card rounded-2xl p-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items..." className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none text-sm" />
        </div>
      </div>

      <div className="premium-card rounded-2xl overflow-hidden">
        {isLoading ? <div className="p-12 text-center text-muted-foreground">Loading...</div> :
         !filtered.length ? <div className="p-12 text-center text-muted-foreground">No items found.</div> :
         <div className="overflow-x-auto">
           <table className="w-full text-sm">
             <thead className="bg-muted/30">
               <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                 <th className="py-3 px-4">Name</th><th className="py-3 px-4">HSN</th><th className="py-3 px-4">Unit</th>
                 <th className="py-3 px-4 text-right">Default Price</th><th className="py-3 px-4 text-right">GST%</th><th className="py-3 px-4" />
               </tr>
             </thead>
             <tbody>
               {filtered.map((it) => (
                 <tr key={it.id} className="border-t border-border/20 hover:bg-muted/30">
                   <td className="py-3 px-4 font-medium cursor-pointer" onClick={() => openEdit(it)}>{it.name}</td>
                   <td className="py-3 px-4 text-muted-foreground text-xs">{it.hsn || "—"}</td>
                   <td className="py-3 px-4 text-xs">{it.unit}</td>
                   <td className="py-3 px-4 text-right">{fmtINR(it.default_price)}</td>
                   <td className="py-3 px-4 text-right text-muted-foreground">{it.gst_rate}%</td>
                   <td className="py-3 px-4 text-right">
                     <button onClick={() => setPricesOpen(it.id)} className="text-xs text-primary hover:underline">Customer prices</button>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
        }
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} className="glass rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-2xl">{editingId ? "Edit Item" : "New Item"}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div><label className="text-xs uppercase tracking-wider text-muted-foreground">Name *</label><input value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs uppercase tracking-wider text-muted-foreground">HSN</label><input value={draft.hsn || ""} onChange={(e) => setDraft({ ...draft, hsn: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none" /></div>
                <div><label className="text-xs uppercase tracking-wider text-muted-foreground">Unit</label><input value={draft.unit || ""} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs uppercase tracking-wider text-muted-foreground">Sale Price (MRP)</label><input type="number" value={draft.default_price ?? ""} onChange={(e) => setDraft({ ...draft, default_price: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none" /></div>
                <div><label className="text-xs uppercase tracking-wider text-muted-foreground">Purchase Price</label><input type="number" value={draft.purchase_price ?? ""} onChange={(e) => setDraft({ ...draft, purchase_price: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs uppercase tracking-wider text-muted-foreground">Opening Stock</label><input type="number" value={draft.opening_stock ?? ""} onChange={(e) => setDraft({ ...draft, opening_stock: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none" /></div>
                <div><label className="text-xs uppercase tracking-wider text-muted-foreground">GST %</label><input type="number" value={draft.gst_rate ?? ""} onChange={(e) => setDraft({ ...draft, gst_rate: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none" /></div>
              </div>
              <div><label className="text-xs uppercase tracking-wider text-muted-foreground">Low Stock Threshold</label><input type="number" value={draft.low_stock_threshold ?? ""} onChange={(e) => setDraft({ ...draft, low_stock_threshold: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none" /></div>
              <button onClick={handleSave} className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 font-medium btn-press hover:opacity-95 mt-2">Save</button>
            </div>
          </div>
        </div>
      )}

      {pricesOpen && <CustomerPricesDialog itemId={pricesOpen} parties={parties || []} onClose={() => setPricesOpen(null)} />}
    </div>
  );
}

function CustomerPricesDialog({ itemId, parties, onClose }: { itemId: string; parties: Party[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: item } = useQuery({ queryKey: ["item", itemId], queryFn: () => api.getItem(itemId) });
  const [partyId, setPartyId] = useState("");
  const [price, setPrice] = useState<number | "">("");

  const handleAdd = async () => {
    if (!partyId || !price) return toast.error("Party and price required");
    try {
      await api.setCustomerPrice(itemId, partyId, Number(price));
      toast.success("Price set");
      setPartyId(""); setPrice("");
      qc.invalidateQueries({ queryKey: ["item", itemId] });
    } catch (err) { toast.error((err as Error).message); }
  };

  const handleRemove = async (pid: string) => {
    try { await api.deleteCustomerPrice(itemId, pid); qc.invalidateQueries({ queryKey: ["item", itemId] }); } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass rounded-2xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl">{item?.name} — Customer Prices</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Default: {fmtINR(item?.default_price || 0)}</p>

        <div className="flex gap-2 mb-4">
          <select value={partyId} onChange={(e) => setPartyId(e.target.value)} className="flex-1 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none text-sm">
            <option value="">Select customer...</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="number" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))} className="w-28 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none text-sm" />
          <button onClick={handleAdd} className="bg-primary text-primary-foreground rounded-lg px-4 text-sm font-medium btn-press">Set</button>
        </div>

        {!item?.customerPrices?.length ? <p className="text-sm text-muted-foreground text-center py-4">No overrides yet</p> :
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {item.customerPrices.map((cp) => (
              <div key={cp.id} className="flex items-center justify-between bg-background/40 rounded-lg px-3 py-2 text-sm">
                <span>{cp.party_name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{fmtINR(cp.price)}</span>
                  <button onClick={() => handleRemove(cp.party_id)} className="text-muted-foreground hover:text-destructive btn-press"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        }
      </div>
    </div>
  );
}
