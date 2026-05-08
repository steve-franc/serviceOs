import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

import { useUpsertTier } from "@/hooks/useSuperadminData";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { FEATURE_CATALOG, type FeatureKind } from "@/lib/feature-catalog";

interface FeatureRow {
  key: string;
  kind: FeatureKind;
  // For number-or-unlimited: null = unlimited, else number
  num: number | null;
  bool: boolean;
  text: string;
}

const PRESET_KEYS = FEATURE_CATALOG.map((f) => ({ key: f.key, kind: f.kind, label: f.label, group: f.group }));

function inferKind(v: any): FeatureKind {
  if (typeof v === "boolean") return "boolean";
  if (v === null || typeof v === "number") return "number-or-unlimited";
  return "text";
}

function toRows(features: Record<string, any> | null | undefined): FeatureRow[] {
  const f = features ?? {};
  const seen = new Set<string>();
  const rows: FeatureRow[] = [];
  for (const p of PRESET_KEYS) {
    if (p.key in f) {
      seen.add(p.key);
      const v = f[p.key];
      rows.push({
        key: p.key,
        kind: p.kind,
        num: p.kind === "number-or-unlimited" ? (v === null ? null : Number(v)) : null,
        bool: p.kind === "boolean" ? !!v : false,
        text: p.kind === "text" ? String(v ?? "") : "",
      });
    }
  }
  for (const [k, v] of Object.entries(f)) {
    if (seen.has(k)) continue;
    const kind = inferKind(v);
    rows.push({
      key: k,
      kind,
      num: kind === "number-or-unlimited" ? (v === null ? null : Number(v)) : null,
      bool: kind === "boolean" ? !!v : false,
      text: kind === "text" ? String(v ?? "") : "",
    });
  }
  return rows;
}

function rowsToFeatures(rows: FeatureRow[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const r of rows) {
    if (!r.key.trim()) continue;
    if (r.kind === "boolean") out[r.key] = r.bool;
    else if (r.kind === "number-or-unlimited") out[r.key] = r.num;
    else out[r.key] = r.text;
  }
  return out;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tier: any | null;
}

export function TierEditDialog({ open, onOpenChange, tier }: Props) {
  const upsert = useUpsertTier();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [price, setPrice] = useState(0);
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [isFree, setIsFree] = useState(false);
  const [dodoTest, setDodoTest] = useState("");
  const [dodoLive, setDodoLive] = useState("");
  const [rows, setRows] = useState<FeatureRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(tier?.name ?? "");
    setSlug(tier?.slug ?? "");
    setPrice(Number(tier?.price_try ?? 0));
    setDisplayOrder(Number(tier?.display_order ?? 0));
    setIsActive(tier?.is_active ?? true);
    setIsFree(tier?.is_free ?? false);
    setDodoTest(tier?.dodo_price_id_test ?? "");
    setDodoLive(tier?.dodo_price_id_live ?? "");
    setRows(toRows(tier?.features ?? {}));
  }, [open, tier]);

  const presetCandidatesByGroup = useMemo(() => {
    const used = new Set(rows.map((r) => r.key));
    const groups = new Map<string, typeof PRESET_KEYS>();
    for (const p of PRESET_KEYS) {
      if (used.has(p.key)) continue;
      const arr = groups.get(p.group) ?? [];
      arr.push(p);
      groups.set(p.group, arr);
    }
    return Array.from(groups.entries());
  }, [rows]);

  const addAllRemaining = () => {
    setRows((prev) => {
      const used = new Set(prev.map((r) => r.key));
      const additions: FeatureRow[] = PRESET_KEYS
        .filter((p) => !used.has(p.key))
        .map((p) => ({
          key: p.key,
          kind: p.kind,
          num: p.kind === "number-or-unlimited" ? null : null,
          bool: p.kind === "boolean" ? true : false,
          text: "",
        }));
      return [...prev, ...additions];
    });
  };

  const addRow = (preset?: { key: string; kind: FeatureKind }) => {
    setRows((prev) => [
      ...prev,
      preset
        ? { key: preset.key, kind: preset.kind, num: null, bool: false, text: "" }
        : { key: "", kind: "number-or-unlimited", num: null, bool: false, text: "" },
    ]);
  };

  const updateRow = (i: number, patch: Partial<FeatureRow>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const onSave = async () => {
    if (!name.trim() || !slug.trim()) {
      toast.error("Name and slug are required");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: tier?.id ?? null,
        name: name.trim(),
        slug: slug.trim(),
        price_try: Number(price) || 0,
        dodo_price_id_test: dodoTest || null,
        dodo_price_id_live: dodoLive || null,
        features: rowsToFeatures(rows),
        display_order: Number(displayOrder) || 0,
        is_active: isActive,
        is_free: isFree,
      });
      toast.success(tier ? "Tier updated" : "Tier created");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save tier");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tier ? "Edit tier" : "New tier"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pro" />
            </div>
            <div className="space-y-1">
              <Label>Slug</Label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="pro" />
            </div>
            <div className="space-y-1">
              <Label>Price (TRY / month)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label>Display order</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <Label className="cursor-pointer">Active</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <Label className="cursor-pointer">Free tier</Label>
              <Switch checked={isFree} onCheckedChange={setIsFree} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Limits & features</Label>
            </div>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md border border-border p-2">
                  <div className="flex-1 grid grid-cols-[1fr_auto] gap-2">
                    <Input
                      value={r.key}
                      onChange={(e) => updateRow(i, { key: e.target.value })}
                      placeholder="feature_key"
                      className="font-mono text-xs"
                    />
                    <select
                      value={r.kind}
                      onChange={(e) => updateRow(i, { kind: e.target.value as FeatureKind })}
                      className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                    >
                      <option value="number-or-unlimited">Number / Unlimited</option>
                      <option value="boolean">On / Off</option>
                      <option value="text">Text</option>
                    </select>
                    <div className="col-span-2">
                      {r.kind === "number-or-unlimited" && (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            inputMode="numeric"
                            disabled={r.num === null}
                            value={r.num ?? ""}
                            onChange={(e) =>
                              updateRow(i, { num: e.target.value === "" ? 0 : Number(e.target.value) })
                            }
                            placeholder="e.g. 100"
                          />
                          <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                            <Switch
                              checked={r.num === null}
                              onCheckedChange={(checked) => updateRow(i, { num: checked ? null : 0 })}
                            />
                            Unlimited
                          </label>
                        </div>
                      )}
                      {r.kind === "boolean" && (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={r.bool}
                            onCheckedChange={(checked) => updateRow(i, { bool: checked })}
                          />
                          <span className="text-xs text-muted-foreground">{r.bool ? "Enabled" : "Disabled"}</span>
                        </div>
                      )}
                      {r.kind === "text" && (
                        <Input value={r.text} onChange={(e) => updateRow(i, { text: e.target.value })} />
                      )}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeRow(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {presetCandidatesByGroup.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Add features to this tier:</p>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={addAllRemaining}>
                    Add all remaining
                  </Button>
                </div>
                {presetCandidatesByGroup.map(([group, items]) => (
                  <div key={group} className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((p) => (
                        <Button
                          key={p.key}
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => addRow(p)}
                        >
                          <Plus className="h-3 w-3 mr-1" /> {p.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addRow()}>
                <Plus className="h-3 w-3 mr-1" /> Custom feature key
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Dodo price ID (test)</Label>
              <Input value={dodoTest} onChange={(e) => setDodoTest(e.target.value)} placeholder="optional" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dodo price ID (live)</Label>
              <Input value={dodoLive} onChange={(e) => setDodoLive(e.target.value)} placeholder="optional" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
