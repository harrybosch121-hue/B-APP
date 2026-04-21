import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type InvoiceLine, type Item, type Party } from "@/lib/api";
import { fmtINR, todayISO } from "@/lib/format";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Screen } from "@/App";

interface Props {
  navigate: (s: Screen, ctx?: { invoiceId?: string }) => void;
  editId?: string;
}

interface LineDraft extends InvoiceLine {
  _key: string;
}

const newLine = (): LineDraft => ({
  _key: Math.random().toString(36).slice(2),
  item_id: null,
  item_name_snapshot: "",
  qty: 1,
  price: 0,
  gst_rate: 18,
  unit: "Pcs",
});

export default function InvoiceFormScreen({ navigate, editId }: Props) {
  const qc = useQueryClient();
  const { data: parties } = useQuery({ queryKey: ["parties"], queryFn: api.getParties });
  const { data: items } = useQuery({ queryKey: ["items"], queryFn: api.getItems });
  const existing = useQuery({
    queryKey: ["invoice", editId],
    queryFn: () => api.getInvoice(editId!),
    enabled: !!editId,
  });

  const [date, setDate] = useState(todayISO());
  const [partyId, setPartyId] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<"Cash" | "Credit" | "Acc">("Cash");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [partyQuery, setPartyQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing.data) {
      const inv = existing.data;
      setDate(inv.date);
      setPartyId(inv.party_id || "");
      setPaymentMode(inv.payment_mode);
      setNotes(inv.notes || "");
      setLines(
        (inv.items || []).map((it) => ({
          _key: it.id || Math.random().toString(36).slice(2),
          item_id: it.item_id || null,
          item_name_snapshot: it.item_name_snapshot || it.name || "",
          qty: Number(it.qty),
          price: Number(it.price),
          gst_rate: Number(it.gst_rate),
          unit: it.unit || "Pcs",
          hsn: it.hsn || null,
        }))
      );
    }
  }, [existing.data]);

  const filteredParties = useMemo(() => {
    const q = partyQuery.toLowerCase();
    return (parties || []).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [parties, partyQuery]);

  const subtotal = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.price || 0), 0);
  const gstAmount = lines.reduce(
    (s, l) => s + Number(l.qty || 0) * Number(l.price || 0) * (Number(l.gst_rate || 0) / 100),
    0
  );
  const total = subtotal + gstAmount;

  const updateLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, ...patch } : l)));

  const handleItemPick = async (key: string, item: Item) => {
    let price = item.default_price;
    if (partyId) {
      try {
        const r = await api.getEffectivePrice(item.id, partyId);
        price = r.price;
      } catch { /* ignore */ }
    }
    updateLine(key, {
      item_id: item.id,
      item_name_snapshot: item.name,
      hsn: item.hsn,
      unit: item.unit,
      price,
      gst_rate: item.gst_rate,
    });
  };

  const handleSave = async () => {
    if (!partyId) return toast.error("Select a party");
    const validLines = lines.filter((l) => l.item_name_snapshot && Number(l.qty) > 0);
    if (validLines.length === 0) return toast.error("Add at least one item");

    setSaving(true);
    try {
      const payload = {
        date,
        party_id: partyId,
        payment_mode: paymentMode,
        notes,
        items: validLines.map((l) => ({
          item_id: l.item_id,
          item_name_snapshot: l.item_name_snapshot,
          hsn: l.hsn || null,
          qty: Number(l.qty),
          unit: l.unit,
          price: Number(l.price),
          gst_rate: Number(l.gst_rate),
        })),
      };
      if (editId) {
        await api.updateInvoice(editId, payload);
        toast.success("Invoice updated");
      } else {
        const created = await api.createInvoice(payload);
        toast.success(`Invoice #${created.invoice_no} created`);
      }
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["recent-invoices"] });
      navigate(editId ? "invoice-detail" : "invoices", editId ? { invoiceId: editId } : undefined);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate(editId ? "invoice-detail" : "invoices", editId ? { invoiceId: editId } : undefined)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground btn-press">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h1 className="font-display text-3xl tracking-wide">{editId ? "Edit Invoice" : "New Invoice"}</h1>
        <div />
      </header>

      <div className="premium-card rounded-2xl p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full mt-1.5 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Party</label>
          <input
            list="party-list"
            value={partyQuery || (partyId ? parties?.find((p) => p.id === partyId)?.name || "" : "")}
            onChange={(e) => {
              const v = e.target.value;
              setPartyQuery(v);
              const match = parties?.find((p) => p.name.toLowerCase() === v.toLowerCase());
              if (match) setPartyId(match.id);
              else setPartyId("");
            }}
            placeholder="Search or select customer"
            className="w-full mt-1.5 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none"
          />
          <datalist id="party-list">
            {filteredParties.map((p) => <option key={p.id} value={p.name} />)}
          </datalist>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Payment Mode</label>
          <div className="mt-1.5 flex rounded-lg overflow-hidden border border-border">
            {(["Cash", "Credit", "Acc"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMode(m)}
                className={`flex-1 py-2 text-sm font-medium transition btn-press ${paymentMode === m ? "bg-primary text-primary-foreground" : "bg-background/60 text-muted-foreground hover:text-foreground"}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="premium-card rounded-2xl p-6">
        <h2 className="font-display text-2xl mb-4">Line Items</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                <th className="py-2 pr-3 w-1/3">Item</th>
                <th className="py-2 pr-3">HSN</th>
                <th className="py-2 pr-3 text-right">Qty</th>
                <th className="py-2 pr-3">Unit</th>
                <th className="py-2 pr-3 text-right">Price</th>
                <th className="py-2 pr-3 text-right">GST %</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const lineBase = Number(l.qty || 0) * Number(l.price || 0);
                const lineTotal = lineBase * (1 + Number(l.gst_rate || 0) / 100);
                return (
                  <tr key={l._key} className="border-b border-border/20">
                    <td className="py-2 pr-3">
                      <input
                        list={`items-list-${l._key}`}
                        value={l.item_name_snapshot}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateLine(l._key, { item_name_snapshot: v });
                          const match = items?.find((it) => it.name.toLowerCase() === v.toLowerCase());
                          if (match) handleItemPick(l._key, match);
                        }}
                        placeholder="Item name"
                        className="w-full px-2 py-1.5 rounded bg-background/50 border border-border/50 focus:border-primary focus:outline-none"
                      />
                      <datalist id={`items-list-${l._key}`}>
                        {(items || []).map((it) => <option key={it.id} value={it.name} />)}
                      </datalist>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        value={l.hsn || ""}
                        onChange={(e) => updateLine(l._key, { hsn: e.target.value })}
                        className="w-20 px-2 py-1.5 rounded bg-background/50 border border-border/50 focus:border-primary focus:outline-none"
                      />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <input
                        type="number"
                        value={l.qty}
                        onChange={(e) => updateLine(l._key, { qty: Number(e.target.value) })}
                        className="w-20 px-2 py-1.5 rounded bg-background/50 border border-border/50 focus:border-primary focus:outline-none text-right"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        value={l.unit}
                        onChange={(e) => updateLine(l._key, { unit: e.target.value })}
                        className="w-16 px-2 py-1.5 rounded bg-background/50 border border-border/50 focus:border-primary focus:outline-none"
                      />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <input
                        type="number"
                        value={l.price}
                        onChange={(e) => updateLine(l._key, { price: Number(e.target.value) })}
                        className="w-24 px-2 py-1.5 rounded bg-background/50 border border-border/50 focus:border-primary focus:outline-none text-right"
                      />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <input
                        type="number"
                        value={l.gst_rate}
                        onChange={(e) => updateLine(l._key, { gst_rate: Number(e.target.value) })}
                        className="w-16 px-2 py-1.5 rounded bg-background/50 border border-border/50 focus:border-primary focus:outline-none text-right"
                      />
                    </td>
                    <td className="py-2 pr-3 text-right font-medium">{fmtINR(lineTotal)}</td>
                    <td className="py-2 pl-2">
                      <button onClick={() => setLines((p) => p.filter((x) => x._key !== l._key))} className="text-muted-foreground hover:text-destructive p-1 btn-press">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button onClick={() => setLines((p) => [...p, newLine()])} className="mt-3 flex items-center gap-2 text-sm text-primary hover:underline">
          <Plus className="w-4 h-4" /> Add line
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 premium-card rounded-2xl p-5">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full mt-2 px-3 py-2 rounded-lg bg-background/60 border border-border focus:border-primary focus:outline-none text-sm"
            placeholder="Optional notes..."
          />
        </div>
        <div className="premium-card rounded-2xl p-5 space-y-2 marble-noise relative">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">{fmtINR(subtotal)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">GST</span><span className="font-medium">{fmtINR(gstAmount)}</span></div>
          <div className="border-t border-border/40 pt-2 flex justify-between items-end">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Total</span>
            <span className="font-display text-3xl text-primary">{fmtINR(total)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button onClick={() => navigate(editId ? "invoice-detail" : "invoices", editId ? { invoiceId: editId } : undefined)} className="px-5 py-2.5 rounded-xl border border-border text-sm btn-press">Cancel</button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm shadow btn-press disabled:opacity-60 hover:opacity-95"
        >
          {saving ? "Saving..." : editId ? "Update Invoice" : "Save Invoice"}
        </button>
      </div>
    </div>
  );
}
