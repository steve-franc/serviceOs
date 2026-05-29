import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Camera, Upload, Loader2, Trash2, Plus, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export interface ScannedItem {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  inventory_item_id?: string;
}

export interface ScannedReceipt {
  items: ScannedItem[];
  supplier_id: string | null;
  supplier_name: string;
  purchase_date: string;
  total: number;
  notes: string;
  file: File | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  inventoryItems: { id: string; name: string; unit: string | null }[];
  suppliers: { id: string; supplier_name: string }[];
  onConfirm: (r: ScannedReceipt) => Promise<void> | void;
}

// Parse OCR text into items, supplier, date, total
function parseReceipt(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items: ScannedItem[] = [];
  let supplier = "";
  let date = "";
  let total = 0;

  // First non-numeric line is likely supplier
  for (const l of lines) {
    if (!/\d/.test(l) && l.length > 2) { supplier = l; break; }
  }

  // Date: YYYY-MM-DD or DD/MM/YYYY or MM/DD/YYYY
  const dateMatch = text.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})|(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/);
  if (dateMatch) {
    const d = dateMatch[0].replace(/[./]/g, "-");
    const parts = d.split("-");
    if (parts[0].length === 4) date = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
    else {
      const yr = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      date = `${yr}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  }

  // Patterns: "Name x30 @ 70.00 = 2100.00" or "Name 30 70.00 2100.00" or "Name 2 x 95.00"
  const num = "([\\d.,]+)";
  const patterns = [
    new RegExp(`^(.+?)\\s*[xX×]\\s*${num}\\s*@\\s*${num}\\s*[=:]?\\s*${num}?`),
    new RegExp(`^(.+?)\\s+${num}\\s*[xX×@]\\s*${num}\\s*[=:]?\\s*${num}?`),
    new RegExp(`^(.+?)\\s+${num}\\s+${num}\\s+${num}$`),
  ];

  const toNum = (s: string) => parseFloat(s.replace(/[^\d.-]/g, "").replace(/,(\d{3})/g, "$1").replace(",", "."));

  for (const line of lines) {
    const low = line.toLowerCase();
    if (/^(sub.?total|total|tax|vat|kdv|amount)/.test(low)) {
      const m = line.match(/([\d.,]+)\s*$/);
      if (m && /total/.test(low) && !/sub/.test(low)) total = toNum(m[1]) || total;
      continue;
    }
    let matched = false;
    for (const p of patterns) {
      const m = line.match(p);
      if (m) {
        const name = m[1].trim().replace(/[:|*-]+$/, "").trim();
        let qty = 0, unit = 0, lineTotal = 0;
        if (p === patterns[0]) { qty = toNum(m[2]); unit = toNum(m[3]); lineTotal = m[4] ? toNum(m[4]) : qty * unit; }
        else if (p === patterns[1]) { qty = toNum(m[2]); unit = toNum(m[3]); lineTotal = m[4] ? toNum(m[4]) : qty * unit; }
        else { qty = toNum(m[2]); unit = toNum(m[3]); lineTotal = toNum(m[4]); }
        if (name && qty > 0 && unit > 0) {
          items.push({ name, qty, unitPrice: unit, total: lineTotal || qty * unit });
          matched = true;
          break;
        }
      }
    }
    if (!matched) continue;
  }

  if (!total && items.length) total = items.reduce((a, b) => a + b.total, 0);
  return { items, supplier, date, total };
}

export function ReceiptScanner({ open, onOpenChange, inventoryItems, suppliers, onConfirm }: Props) {
  const [stage, setStage] = useState<"capture" | "processing" | "review">("capture");
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [supplierName, setSupplierName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [total, setTotal] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStage("capture"); setProgress(0); setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null); setItems([]); setSupplierId(""); setSupplierName("");
    setPurchaseDate(format(new Date(), "yyyy-MM-dd")); setTotal(0); setNotes("");
  };

  const handleFile = async (f: File | null) => {
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setStage("processing");
    setProgress(0);
    try {
      const { default: Tesseract } = await import("tesseract.js");
      const { data } = await Tesseract.recognize(f, "eng", {
        logger: (m: any) => { if (m.status === "recognizing text") setProgress(Math.round((m.progress || 0) * 100)); },
      });
      const parsed = parseReceipt(data.text || "");
      if (parsed.items.length === 0) {
        toast.warning("No line items detected. You can add them manually below.");
      } else {
        toast.success(`Found ${parsed.items.length} item${parsed.items.length === 1 ? "" : "s"}`);
      }
      // Auto-match inventory items by fuzzy name (case-insensitive contains)
      const matched = parsed.items.map((it) => {
        const lower = it.name.toLowerCase();
        const found = inventoryItems.find((inv) =>
          inv.name.toLowerCase() === lower ||
          inv.name.toLowerCase().includes(lower) ||
          lower.includes(inv.name.toLowerCase())
        );
        return { ...it, inventory_item_id: found?.id };
      });
      setItems(matched);
      setSupplierName(parsed.supplier);
      if (parsed.date) setPurchaseDate(parsed.date);
      setTotal(parsed.total);
      // Auto-match supplier
      if (parsed.supplier) {
        const sup = suppliers.find((s) => s.supplier_name.toLowerCase().includes(parsed.supplier.toLowerCase()) || parsed.supplier.toLowerCase().includes(s.supplier_name.toLowerCase()));
        if (sup) setSupplierId(sup.id);
      }
      setStage("review");
    } catch (err: any) {
      toast.error("Could not read receipt. Please try another image or add items manually.");
      setItems([]);
      setStage("review");
    }
  };

  const updateItem = (i: number, patch: Partial<ScannedItem>) => {
    setItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      if ("qty" in patch || "unitPrice" in patch) {
        next[i].total = (next[i].qty || 0) * (next[i].unitPrice || 0);
      }
      return next;
    });
  };

  const addRow = () => setItems((p) => [...p, { name: "", qty: 1, unitPrice: 0, total: 0 }]);
  const removeRow = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));

  const submit = async () => {
    // Valid = has an inventory mapping OR has a name (will be auto-created)
    const valid = items.filter((i) => (i.inventory_item_id || i.name.trim()) && i.qty > 0 && i.unitPrice >= 0);
    const skipped = items.length - valid.length;
    if (valid.length === 0) return toast.error("Add at least one item with a name, quantity, and price.");
    if (skipped > 0) {
      if (!confirm(`${skipped} row(s) are missing a name, quantity, or price and will be skipped. Continue?`)) return;
    }
    setSaving(true);
    try {
      await onConfirm({
        items: valid,
        supplier_id: supplierId || null,
        supplier_name: supplierName,
        purchase_date: purchaseDate,
        total: total || valid.reduce((a, b) => a + b.total, 0),
        notes,
        file,
      });
      reset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5" /> Scan or Upload Receipt</DialogTitle>
          <DialogDescription>Take a photo or upload an image. We'll extract items and prices automatically.</DialogDescription>
        </DialogHeader>

        {stage === "capture" && (
          <Tabs defaultValue="camera" className="space-y-3">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="camera"><Camera className="h-4 w-4 mr-2" />Camera</TabsTrigger>
              <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-2" />Upload</TabsTrigger>
            </TabsList>
            <TabsContent value="camera">
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] || null)} />
              <Button type="button" className="w-full min-h-[44px]" onClick={() => cameraRef.current?.click()}>
                <Camera className="h-4 w-4 mr-2" /> Take Photo
              </Button>
              <p className="text-xs text-muted-foreground mt-2 text-center">Hold steady and capture the full receipt in good light.</p>
            </TabsContent>
            <TabsContent value="upload">
              <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] || null)} />
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0] || null); }}
                className="w-full border-2 border-dashed rounded-lg p-8 text-center hover:bg-muted/50 transition-colors min-h-[120px]"
              >
                <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm">Drop a receipt image here or click to browse</p>
              </button>
            </TabsContent>
          </Tabs>
        )}

        {stage === "processing" && (
          <div className="py-10 flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm font-medium">Extracting receipt data…</p>
            {progress > 0 && <p className="text-xs text-muted-foreground">{progress}%</p>}
          </div>
        )}

        {stage === "review" && (
          <div className="space-y-4">
            {previewUrl && (
              <div className="flex gap-3">
                <img src={previewUrl} alt="Receipt" className="h-24 w-auto rounded border" />
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Supplier</Label>
                    <Select value={supplierId} onValueChange={setSupplierId}>
                      <SelectTrigger><SelectValue placeholder={supplierName || "Select"} /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.supplier_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-muted/30 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Item → Inventory</TableHead>
                      <TableHead className="w-20 text-right">Qty</TableHead>
                      <TableHead className="w-24 text-right">Unit ₺</TableHead>
                      <TableHead className="w-24 text-right">Total ₺</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-sm">No items extracted — add manually below</TableCell></TableRow>
                    )}
                    {items.map((it, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Input className="mb-1 text-xs h-8" value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })} placeholder="Item name" />
                          <Select value={it.inventory_item_id || "__new__"} onValueChange={(v) => updateItem(i, { inventory_item_id: v === "__new__" ? undefined : v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__new__">+ Create new inventory item</SelectItem>
                              {inventoryItems.map((inv) => <SelectItem key={inv.id} value={inv.id}>{inv.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {!it.inventory_item_id && it.name.trim() && (
                            <p className="text-[10px] text-muted-foreground mt-1">New item will be created in inventory</p>
                          )}
                        </TableCell>
                        <TableCell><Input type="number" inputMode="decimal" className="h-8 text-right font-mono text-xs" value={it.qty} onChange={(e) => updateItem(i, { qty: parseFloat(e.target.value) || 0 })} /></TableCell>
                        <TableCell><Input type="number" inputMode="decimal" step="0.01" className="h-8 text-right font-mono text-xs" value={it.unitPrice} onChange={(e) => updateItem(i, { unitPrice: parseFloat(e.target.value) || 0 })} /></TableCell>
                        <TableCell className="text-right font-mono text-xs">{it.total.toFixed(2)}</TableCell>
                        <TableCell><Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeRow(i)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="p-2 border-t flex items-center justify-between">
                <Button type="button" variant="ghost" size="sm" onClick={addRow}><Plus className="h-3.5 w-3.5 mr-1" /> Add row</Button>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Total ₺</Label>
                  <Input type="number" inputMode="decimal" step="0.01" className="h-8 w-28 text-right font-mono text-xs" value={total} onChange={(e) => setTotal(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          {stage === "review" && (
            <Button type="button" disabled={saving || items.length === 0} onClick={submit}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Add to Restock"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
