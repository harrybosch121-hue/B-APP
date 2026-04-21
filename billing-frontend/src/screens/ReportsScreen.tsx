import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtINR, fmtDate, todayISO, monthStartISO } from "@/lib/format";
import { Calendar, Download } from "lucide-react";

const tabs = ["Day Book", "Sales Register", "Item Sales", "Top Customers", "P&L", "GSTR-1"] as const;
type Tab = typeof tabs[number];

export default function ReportsScreen() {
  const [tab, setTab] = useState<Tab>("Day Book");
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [topMode, setTopMode] = useState("");

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h1 className="font-display text-3xl md:text-4xl tracking-wide">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">Analyze sales, GST and customer activity</p>
      </header>

      <div className="premium-card rounded-2xl p-4 flex flex-wrap gap-3 items-center">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 rounded-lg bg-background/60 border border-border text-sm" />
        <span className="text-muted-foreground text-sm">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 rounded-lg bg-background/60 border border-border text-sm" />
        {tab === "Top Customers" && (
          <select value={topMode} onChange={(e) => setTopMode(e.target.value)} className="px-3 py-2 rounded-lg bg-background/60 border border-border text-sm">
            <option value="">All</option><option value="Cash">Cash only</option><option value="Credit">Credit only</option>
          </select>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm transition btn-press ${tab === t ? "bg-primary text-primary-foreground shadow" : "bg-background/40 text-muted-foreground hover:text-foreground border border-border"}`}>{t}</button>
        ))}
      </div>

      <div className="premium-card rounded-2xl p-6">
        {tab === "Day Book" && <DayBookView from={from} to={to} />}
        {tab === "Sales Register" && <SalesRegisterView from={from} to={to} />}
        {tab === "Item Sales" && <ItemSalesView from={from} to={to} />}
        {tab === "Top Customers" && <TopCustomersView from={from} to={to} mode={topMode} />}
        {tab === "P&L" && <PLView from={from} to={to} />}
        {tab === "GSTR-1" && <GSTR1View from={from} to={to} />}
      </div>
    </div>
  );
}

function downloadCsv(name: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
}

function DayBookView({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["daybook", from, to], queryFn: () => api.daybook(from, to) });
  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;
  const totalSales = (data?.invoices || []).reduce((s: number, i: any) => s + Number(i.total), 0);
  const totalPay = (data?.payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Invoices" value={String(data?.invoices?.length || 0)} sub={fmtINR(totalSales)} />
        <Stat label="Payments" value={String(data?.payments?.length || 0)} sub={fmtINR(totalPay)} />
        <Stat label="Expenses" value={String(data?.expenses?.length || 0)} sub={fmtINR((data?.expenses || []).reduce((s: number, e: any) => s + Number(e.amount), 0))} />
      </div>
      <h3 className="font-display text-xl">Invoices</h3>
      <SimpleTable headers={["#", "Date", "Party", "Mode", "Total"]} rows={(data?.invoices || []).map((i: any) => [`#${i.invoice_no}`, fmtDate(i.date), i.party_name || "—", i.payment_mode, fmtINR(i.total)])} />
      <h3 className="font-display text-xl">Payments</h3>
      <SimpleTable headers={["Date", "Party", "Mode", "Notes", "Amount"]} rows={(data?.payments || []).map((p: any) => [fmtDate(p.date), p.party_name || "—", p.mode, p.notes || "", fmtINR(p.amount)])} />
    </div>
  );
}

function SalesRegisterView({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["sales-reg", from, to], queryFn: () => api.salesRegister(from, to) });
  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => downloadCsv("sales-register", ["#", "Date", "Party", "GSTIN", "Subtotal", "GST", "Total", "Mode", "Status"], (data || []).map((i: any) => [i.invoice_no, i.date, i.party_name || "", i.gstin || "", i.subtotal, i.gst_amount, i.total, i.payment_mode, i.status]))} className="text-xs flex items-center gap-1 text-primary hover:underline"><Download className="w-3 h-3" /> CSV</button>
      </div>
      <SimpleTable
        headers={["#", "Date", "Party", "GSTIN", "Subtotal", "GST", "Total", "Mode"]}
        rows={(data || []).map((i: any) => [`#${i.invoice_no}`, fmtDate(i.date), i.party_name || "—", i.gstin || "—", fmtINR(i.subtotal), fmtINR(i.gst_amount), fmtINR(i.total), i.payment_mode])}
      />
    </div>
  );
}

function ItemSalesView({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["item-sales", from, to], queryFn: () => api.itemSales(from, to) });
  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => downloadCsv("item-sales", ["Item", "Qty", "Invoices", "Total"], (data || []).map((i: any) => [i.item_name, i.total_qty, i.invoice_count, i.total_amount]))} className="text-xs flex items-center gap-1 text-primary hover:underline"><Download className="w-3 h-3" /> CSV</button>
      </div>
      <SimpleTable
        headers={["Item", "Qty Sold", "Invoices", "Total Amount"]}
        rows={(data || []).map((i: any) => [i.item_name, i.total_qty, i.invoice_count, fmtINR(i.total_amount)])}
      />
    </div>
  );
}

function TopCustomersView({ from, to, mode }: { from: string; to: string; mode: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["top-cust", from, to, mode], queryFn: () => api.topCustomers(from, to, mode || undefined) });
  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;
  return <SimpleTable headers={["Customer", "Invoices", "Total Business"]} rows={(data || []).map((c: any) => [c.name, c.invoice_count, fmtINR(c.total_business)])} />;
}

function PLView({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["pl", from, to], queryFn: () => api.pl(from, to) });
  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Stat label="Sales (taxable)" value={fmtINR(data?.sales_subtotal || 0)} />
      <Stat label="GST collected" value={fmtINR(data?.sales_gst || 0)} />
      <Stat label="Sales (incl GST)" value={fmtINR(data?.sales_total || 0)} />
      <Stat label="Expenses" value={fmtINR(data?.total_expenses || 0)} />
      <div className="sm:col-span-2 premium-card rounded-2xl p-6 marble-noise relative">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Profit (Sales taxable - Expenses)</p>
        <p className={`font-display text-5xl mt-2 ${(data?.profit || 0) >= 0 ? "text-success" : "text-destructive"}`}>{fmtINR(data?.profit || 0)}</p>
      </div>
    </div>
  );
}

function GSTR1View({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["gstr1", from, to], queryFn: () => api.gstr1(from, to) });
  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-xl mb-2">B2B (with GSTIN)</h3>
        <SimpleTable headers={["GSTIN", "Party", "Taxable", "GST", "Total", "Invoices"]} rows={(data?.b2b || []).map((b: any) => [b.gstin, b.party_name, fmtINR(b.taxable), fmtINR(b.gst), fmtINR(b.total), b.invoice_count])} />
      </div>
      <div>
        <h3 className="font-display text-xl mb-2">B2C (no GSTIN)</h3>
        <div className="grid grid-cols-3 gap-3"><Stat label="Taxable" value={fmtINR(data?.b2c?.taxable || 0)} /><Stat label="GST" value={fmtINR(data?.b2c?.gst || 0)} /><Stat label="Total" value={fmtINR(data?.b2c?.total || 0)} /></div>
      </div>
      <div>
        <h3 className="font-display text-xl mb-2">By GST Rate</h3>
        <SimpleTable headers={["Rate", "Taxable", "GST"]} rows={(data?.byRate || []).map((r: any) => [`${r.gst_rate}%`, fmtINR(r.taxable), fmtINR(r.gst)])} />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-background/40 rounded-xl p-4 border border-border/40">
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="font-display text-2xl mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground text-center py-8">No data.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/30"><tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">{headers.map((h) => <th key={h} className="py-2 px-3">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border/20">{r.map((c, j) => <td key={j} className="py-2 px-3">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
