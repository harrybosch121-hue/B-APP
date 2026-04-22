import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { Upload, FileCheck, AlertCircle, Trash2, Download } from "lucide-react";
import { toast } from "sonner";

export default function ImportBusyScreen() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.importBusy>> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    if (!file) return toast.error("Choose a .DAT file");
    setBusy(true);
    setResult(null);
    try {
      const r = await api.importBusy(file);
      setResult(r);
      const m = r.masters;
      const bits: string[] = [];
      if (r.totalInFile > 0) bits.push(`${r.imported}/${r.totalInFile} invoices`);
      if (r.returns && r.returns.totalInFile > 0) bits.push(`${r.returns.imported}/${r.returns.totalInFile} returns`);
      if (r.journals && r.journals.totalInFile > 0) bits.push(`${r.journals.imported}/${r.journals.totalInFile} journals`);
      if (m.accountsInFile > 0) bits.push(`${m.partiesCreated} parties`);
      if (m.itemsInFile > 0) bits.push(`${m.itemsCreated} items`);
      const summary = bits.join(", ") || "0 records";
      if (r.errors.length > 0) {
        toast.error(`Imported ${summary} — ${r.errors.length} errors. See details below.`);
      } else {
        toast.success(`Imported ${summary}`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleWipe = async () => {
    const ok = window.confirm(
      "WIPE ALL DATA?\n\nThis deletes every invoice, payment, customer, item and price. Your login is kept. This cannot be undone."
    );
    if (!ok) return;
    const confirm2 = window.prompt('Type "DELETE" to confirm:');
    if (confirm2 !== "DELETE") return toast.message("Cancelled");
    setWiping(true);
    try {
      await api.resetData();
      toast.success("All data wiped. Reloading...");
      setResult(null);
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setWiping(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <header>
        <h1 className="font-display text-3xl md:text-4xl tracking-wide">Busy Import</h1>
        <p className="text-sm text-muted-foreground mt-1">One-way import from Busy Accounting DAT exports</p>
      </header>

      <div className="premium-card rounded-2xl p-8 marble-noise relative">
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 transition"
        >
          <Upload className="w-10 h-10 mx-auto text-muted-foreground" />
          <p className="font-display text-xl mt-3">{file ? file.name : "Drop DAT file or click to browse"}</p>
          <p className="text-xs text-muted-foreground mt-1">Accepts .DAT (Busy XML export)</p>
          <input ref={inputRef} type="file" accept=".dat,.xml" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>

        <div className="flex justify-end gap-3 mt-6">
          {file && <button onClick={() => setFile(null)} className="px-4 py-2 rounded-lg border border-border text-sm btn-press">Clear</button>}
          <button onClick={handleImport} disabled={!file || busy} className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm shadow btn-press disabled:opacity-50 hover:opacity-95">
            {busy ? "Importing..." : "Import"}
          </button>
        </div>

        <div className="mt-6 text-xs text-muted-foreground bg-muted/30 rounded-lg p-4 space-y-1">
          <p><strong className="text-foreground">How it works:</strong></p>
          <p>• Accepts both file types — vouchers (e.g. <code>SBMT_…_Vh….DAT</code>) and masters (e.g. <code>SBMT_…_MSAll.DAT</code>)</p>
          <p>• <strong>Vouchers</strong>: reads &lt;Sale&gt; entries; cash invoices auto-record full payment, credit invoices stay outstanding</p>
          <p>• <strong>Masters</strong>: reads &lt;Account&gt; (Sundry Debtors → Customer, Sundry Creditors → Supplier) and &lt;Item&gt; (with MRP, unit, GST)</p>
          <p>• Idempotent — existing invoices/parties/items are <strong>skipped</strong>, safe to re-upload</p>
          <p>• Tip: import the <strong>masters file first</strong>, then the voucher file, so parties &amp; items already have addresses, GSTIN, MRP etc.</p>
        </div>
      </div>

      <div className="premium-card rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-display text-xl flex items-center gap-2"><Download className="w-4 h-4" /> Backup</h3>
            <p className="text-xs text-muted-foreground mt-1">Download a full JSON snapshot of every party, item, invoice, payment and expense. Keep a copy before risky imports.</p>
          </div>
          <button
            onClick={async () => {
              setDownloading(true);
              try { await api.downloadBackup(); toast.success("Backup downloaded"); }
              catch (err) { toast.error((err as Error).message); }
              finally { setDownloading(false); }
            }}
            disabled={downloading}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium btn-press disabled:opacity-50 hover:opacity-95"
          >
            {downloading ? "Preparing..." : "Download backup"}
          </button>
        </div>
      </div>

      <div className="premium-card rounded-2xl p-6 border border-destructive/30">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-display text-xl text-destructive flex items-center gap-2"><Trash2 className="w-4 h-4" /> Danger zone</h3>
            <p className="text-xs text-muted-foreground mt-1">Wipe all invoices, payments, customers, items and prices. Login is preserved. Use this before re-importing if a previous import had wrong amounts.</p>
          </div>
          <button onClick={handleWipe} disabled={wiping} className="px-4 py-2 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 text-sm font-medium btn-press disabled:opacity-50">
            {wiping ? "Wiping..." : "Wipe all data"}
          </button>
        </div>
      </div>

      {result && (
        <div className="premium-card rounded-2xl p-6 space-y-4">
          <h3 className="font-display text-2xl flex items-center gap-2"><FileCheck className="w-5 h-5 text-success" /> Import Complete</h3>

          {result.totalInFile > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Vouchers</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Total in file" value={String(result.totalInFile)} />
                <Stat label="Imported" value={String(result.imported)} good />
                <Stat label="Skipped (existed)" value={String(result.skippedExisting)} />
                <Stat label="Parties auto-created" value={String(result.partiesCreated)} />
                <Stat label="Items auto-created" value={String(result.itemsCreated)} />
              </div>
            </div>
          )}

          {result.returns && result.returns.totalInFile > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Sale Returns</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Total in file" value={String(result.returns.totalInFile)} />
                <Stat label="Imported" value={String(result.returns.imported)} good />
                <Stat label="Skipped (existed)" value={String(result.returns.skippedExisting)} />
              </div>
            </div>
          )}

          {result.journals && result.journals.totalInFile > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Journals (Cash Receipts / Payments)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Total in file" value={String(result.journals.totalInFile)} />
                <Stat label="Imported" value={String(result.journals.imported)} good />
                <Stat label="Skipped (existed)" value={String(result.journals.skippedExisting)} />
                <Stat label="Skipped (no party)" value={String(result.journals.skippedNoParty)} />
              </div>
            </div>
          )}

          {(result.masters.accountsInFile > 0 || result.masters.itemsInFile > 0) && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Masters</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Accounts in file" value={String(result.masters.accountsInFile)} />
                <Stat label="Parties created" value={String(result.masters.partiesCreated)} good />
                <Stat label="Parties skipped (existed)" value={String(result.masters.partiesSkippedExisting)} />
                <Stat label="Non-party ledgers skipped" value={String(result.masters.partiesSkippedNonParty)} />
                <Stat label="Items in file" value={String(result.masters.itemsInFile)} />
                <Stat label="Items created" value={String(result.masters.itemsCreated)} good />
                <Stat label="Items skipped (existed)" value={String(result.masters.itemsSkippedExisting)} />
              </div>
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 text-xs space-y-1 max-h-64 overflow-y-auto">
              <p className="font-medium text-destructive flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {result.errors.length} errors</p>
              {result.errors.slice(0, 50).map((e, i) => <p key={i} className="text-destructive/80">{e}</p>)}
            </div>
          )}
          {result.skipped && result.skipped.length > 0 && (
            <div className="bg-muted/30 border border-border rounded-lg p-4 text-xs space-y-1 max-h-64 overflow-y-auto">
              <p className="font-medium text-muted-foreground">{result.skipped.length} non-standard vouchers skipped (alternative Busy series — safe to ignore)</p>
              {result.skipped.slice(0, 50).map((e, i) => <p key={i} className="text-muted-foreground/80">{e}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="bg-background/40 rounded-xl p-3 border border-border/40">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-display text-2xl mt-0.5 ${good ? "text-success" : ""}`}>{value}</p>
    </div>
  );
}
