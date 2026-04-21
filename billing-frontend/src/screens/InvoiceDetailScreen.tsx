import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtINR, fmtDate } from "@/lib/format";
import { ArrowLeft, Edit, XCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Screen } from "@/App";

interface Props {
  navigate: (s: Screen, ctx?: { invoiceId?: string }) => void;
  id: string;
}

export default function InvoiceDetailScreen({ navigate, id }: Props) {
  const qc = useQueryClient();
  const { data: inv, isLoading } = useQuery({ queryKey: ["invoice", id], queryFn: () => api.getInvoice(id) });

  if (isLoading || !inv) return <div className="text-muted-foreground">Loading...</div>;

  const handleCancel = async () => {
    if (!confirm(`Cancel invoice #${inv.invoice_no}? This cannot be undone.`)) return;
    try {
      await api.cancelInvoice(id);
      toast.success("Invoice cancelled");
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("BALAJI TILES", 14, 18);
    doc.setFontSize(10);
    doc.text("Tax Invoice", 14, 25);
    doc.text(`Invoice #: ${inv.invoice_no}`, 150, 18);
    doc.text(`Date: ${fmtDate(inv.date)}`, 150, 25);

    doc.setFontSize(11);
    doc.text("Bill To:", 14, 40);
    doc.setFontSize(10);
    doc.text(inv.party_name || "", 14, 46);
    if (inv.address) doc.text(inv.address, 14, 52);
    if (inv.gstin) doc.text(`GSTIN: ${inv.gstin}`, 14, 58);
    if (inv.phone) doc.text(`Phone: ${inv.phone}`, 14, 64);

    autoTable(doc, {
      startY: 75,
      head: [["#", "Item", "HSN", "Qty", "Unit", "Price", "GST%", "Total"]],
      body: (inv.items || []).map((it, i) => [
        i + 1,
        it.item_name_snapshot || "",
        it.hsn || "-",
        it.qty,
        it.unit || "",
        Number(it.price).toFixed(2),
        `${it.gst_rate}%`,
        Number(it.line_total || 0).toFixed(2),
      ]),
      theme: "grid",
      headStyles: { fillColor: [202, 164, 74] },
      styles: { fontSize: 9 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.text(`Subtotal: ${Number(inv.subtotal).toFixed(2)}`, 150, finalY);
    doc.text(`GST: ${Number(inv.gst_amount).toFixed(2)}`, 150, finalY + 6);
    doc.setFontSize(12);
    doc.text(`Total: ₹${Number(inv.total).toFixed(2)}`, 150, finalY + 14);
    doc.setFontSize(9);
    doc.text(`Mode: ${inv.payment_mode}`, 14, finalY);
    doc.text(`Status: ${inv.status}`, 14, finalY + 6);

    doc.save(`Invoice-${inv.invoice_no}.pdf`);
  };

  const due = Number(inv.total) - Number(inv.paid_amount);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex items-center justify-between gap-4">
        <button onClick={() => navigate("invoices")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground btn-press">
          <ArrowLeft className="w-4 h-4" /> Back to invoices
        </button>
        <div className="flex gap-2">
          <button onClick={handlePDF} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm btn-press hover:bg-muted/40">
            <Printer className="w-4 h-4" /> PDF
          </button>
          {inv.status !== "Cancelled" && (
            <>
              <button onClick={() => navigate("invoice-edit", { invoiceId: id })} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm btn-press hover:bg-muted/40">
                <Edit className="w-4 h-4" /> Edit
              </button>
              <button onClick={handleCancel} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive/40 text-destructive text-sm btn-press hover:bg-destructive/5">
                <XCircle className="w-4 h-4" /> Cancel
              </button>
            </>
          )}
        </div>
      </header>

      <div className="premium-card rounded-2xl p-8 marble-noise relative">
        <div className="flex flex-wrap justify-between gap-6 mb-8">
          <div>
            <h1 className="font-display text-4xl tracking-wide">Invoice #{inv.invoice_no}</h1>
            <p className="text-sm text-muted-foreground mt-1">{fmtDate(inv.date)} • {inv.source} • <span className={inv.status === 'Cancelled' ? 'text-destructive font-medium' : 'text-success font-medium'}>{inv.status}</span></p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Total</p>
            <p className="font-display text-4xl text-primary">{fmtINR(inv.total)}</p>
            <p className={`text-xs mt-1 ${inv.payment_mode === 'Cash' ? 'text-success' : 'text-primary'}`}>{inv.payment_mode}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Bill To</p>
            <p className="font-display text-xl">{inv.party_name}</p>
            {inv.address && <p className="text-sm text-muted-foreground mt-1">{inv.address}</p>}
            {inv.gstin && <p className="text-xs text-muted-foreground mt-1">GSTIN: {inv.gstin}</p>}
            {inv.phone && <p className="text-xs text-muted-foreground">{inv.phone}</p>}
          </div>
          <div className="text-right md:text-left">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Payment</p>
            <p className="text-sm">Paid: <span className="font-medium">{fmtINR(inv.paid_amount)}</span></p>
            {due > 0 && <p className="text-sm text-destructive">Outstanding: <span className="font-medium">{fmtINR(due)}</span></p>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 px-3">#</th>
                <th className="py-2 px-3">Item</th>
                <th className="py-2 px-3">HSN</th>
                <th className="py-2 px-3 text-right">Qty</th>
                <th className="py-2 px-3">Unit</th>
                <th className="py-2 px-3 text-right">Price</th>
                <th className="py-2 px-3 text-right">GST</th>
                <th className="py-2 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(inv.items || []).map((it, i) => (
                <tr key={it.id || i} className="border-t border-border/20">
                  <td className="py-2.5 px-3 text-muted-foreground">{i + 1}</td>
                  <td className="py-2.5 px-3">{it.item_name_snapshot}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{it.hsn || "—"}</td>
                  <td className="py-2.5 px-3 text-right">{it.qty}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{it.unit}</td>
                  <td className="py-2.5 px-3 text-right">{fmtINR(it.price)}</td>
                  <td className="py-2.5 px-3 text-right text-muted-foreground">{it.gst_rate}%</td>
                  <td className="py-2.5 px-3 text-right font-medium">{fmtINR(it.line_total || 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border/40">
              <tr><td colSpan={7} className="text-right py-2 px-3 text-muted-foreground">Subtotal</td><td className="text-right py-2 px-3 font-medium">{fmtINR(inv.subtotal)}</td></tr>
              <tr><td colSpan={7} className="text-right py-2 px-3 text-muted-foreground">GST</td><td className="text-right py-2 px-3 font-medium">{fmtINR(inv.gst_amount)}</td></tr>
              <tr><td colSpan={7} className="text-right py-3 px-3 font-display text-lg">Total</td><td className="text-right py-3 px-3 font-display text-2xl text-primary">{fmtINR(inv.total)}</td></tr>
            </tfoot>
          </table>
        </div>

        {inv.notes && (
          <div className="mt-6 pt-4 border-t border-border/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
            <p className="text-sm text-muted-foreground">{inv.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
