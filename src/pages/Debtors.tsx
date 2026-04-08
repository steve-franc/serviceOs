import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Check, X, Users, AlertCircle } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { Separator } from "@/components/ui/separator";

interface Debtor {
  id: string;
  restaurant_id: string;
  customer_name: string;
  amount_owed: number;
  currency: string;
  notes: string | null;
  staff_id: string;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

const Debtors = () => {
  const { restaurantId, loading: restaurantLoading } = useRestaurantContext();
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    if (restaurantId) fetchDebtors();
  }, [restaurantId]);

  const fetchDebtors = async () => {
    if (!restaurantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("debtors")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("is_resolved", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) toast.error("Failed to load debtors");
    setDebtors(data || []);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!restaurantId || !name.trim() || !amount) return;
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("debtors").insert({
        restaurant_id: restaurantId,
        customer_name: name.trim(),
        amount_owed: parseFloat(amount),
        notes: notes.trim() || null,
        staff_id: user.id,
      });
      if (error) throw error;
      toast.success("Debtor added");
      setDialogOpen(false);
      setName("");
      setAmount("");
      setNotes("");
      fetchDebtors();
    } catch (err: any) {
      toast.error(err.message || "Failed to add debtor");
    } finally {
      setCreating(false);
    }
  };

  const toggleResolved = async (debtor: Debtor) => {
    const newResolved = !debtor.is_resolved;
    const { error } = await supabase
      .from("debtors")
      .update({
        is_resolved: newResolved,
        resolved_at: newResolved ? new Date().toISOString() : null,
      })
      .eq("id", debtor.id);
    if (error) {
      toast.error("Failed to update");
      return;
    }
    toast.success(newResolved ? "Marked as paid" : "Marked as unpaid");
    fetchDebtors();
  };

  const deleteDebtor = async (id: string) => {
    const { error } = await supabase.from("debtors").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    toast.success("Debtor removed");
    fetchDebtors();
  };

  const unresolvedDebtors = debtors.filter(d => !d.is_resolved);
  const resolvedDebtors = debtors.filter(d => d.is_resolved);
  const totalOwed = unresolvedDebtors.reduce((s, d) => s + Number(d.amount_owed), 0);

  if (restaurantLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Debtors</h2>
            <p className="text-muted-foreground">Track customers with outstanding payments</p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Debtor
          </Button>
        </div>

        {totalOwed > 0 && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-amber-700">
                <AlertCircle className="h-5 w-5" />
                Total Outstanding
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatPrice(totalOwed)}</p>
              <p className="text-sm text-muted-foreground">{unresolvedDebtors.length} unpaid</p>
            </CardContent>
          </Card>
        )}

        {unresolvedDebtors.length === 0 && resolvedDebtors.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No debtors recorded</p>
              <Button onClick={() => setDialogOpen(true)} variant="outline" className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Add a debtor
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {unresolvedDebtors.map(debtor => (
              <Card key={debtor.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-semibold">{debtor.customer_name}</p>
                      {debtor.notes && (
                        <p className="text-sm text-muted-foreground mt-1">{debtor.notes}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Added {new Date(debtor.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-base px-3 py-1">
                        {formatPrice(debtor.amount_owed, debtor.currency)}
                      </Badge>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => toggleResolved(debtor)} title="Mark as paid">
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteDebtor(debtor.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {resolvedDebtors.length > 0 && (
              <>
                <Separator />
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => setShowResolved(!showResolved)}
                >
                  {showResolved ? "Hide" : "Show"} {resolvedDebtors.length} resolved debtor(s)
                </Button>
                {showResolved && resolvedDebtors.map(debtor => (
                  <Card key={debtor.id} className="opacity-60">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="font-semibold line-through">{debtor.customer_name}</p>
                          {debtor.notes && (
                            <p className="text-sm text-muted-foreground mt-1">{debtor.notes}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            Resolved {debtor.resolved_at ? new Date(debtor.resolved_at).toLocaleDateString() : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-base px-3 py-1">
                            {formatPrice(debtor.amount_owed, debtor.currency)}
                          </Badge>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => toggleResolved(debtor)} title="Mark as unpaid">
                            <X className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteDebtor(debtor.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>
        )}

        {/* Add debtor dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Debtor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="debtor-name">Customer Name *</Label>
                <Input
                  id="debtor-name"
                  value={name}
                  onChange={e => setName(e.target.value.slice(0, 100))}
                  placeholder="John Doe"
                  className="mt-2"
                  maxLength={100}
                />
              </div>
              <div>
                <Label htmlFor="debtor-amount">Amount Owed (₺) *</Label>
                <Input
                  id="debtor-amount"
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-2"
                  min={0}
                  step="0.01"
                />
              </div>
              <div>
                <Label htmlFor="debtor-notes">Notes (optional)</Label>
                <Textarea
                  id="debtor-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value.slice(0, 1000))}
                  placeholder="e.g. Paid half, owes rest from last visit..."
                  className="mt-2"
                  rows={3}
                  maxLength={1000}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !name.trim() || !amount}>
                {creating ? "Adding..." : "Add Debtor"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Debtors;
