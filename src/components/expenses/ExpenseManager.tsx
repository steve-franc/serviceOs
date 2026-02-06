import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, Receipt } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string | null;
  created_at: string;
}

const EXPENSE_CATEGORIES = [
  "Supplies",
  "Utilities", 
  "Staff",
  "Maintenance",
  "Ingredients",
  "Transport",
  "Other"
];

interface ExpenseManagerProps {
  onExpensesChange?: (totalExpenses: number) => void;
}

const ExpenseManager = ({ onExpensesChange }: ExpenseManagerProps) => {
  const { restaurantId } = useRestaurantContext();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    category: ""
  });

  useEffect(() => {
    if (restaurantId) {
      fetchExpenses();
    }
  }, [restaurantId]);

  const fetchExpenses = async () => {
    if (!restaurantId) return;
    
    try {
      // Get last daily report to find cutoff using created_at timestamp
      const { data: lastReport } = await supabase
        .from("daily_reports")
        .select("created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      // Use the exact timestamp of the last report as cutoff
      const cutoffDate = lastReport ? new Date(lastReport.created_at) : new Date(0);

      const { data, error } = await supabase
        .from("daily_expenses")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", cutoffDate.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
      
      const total = (data || []).reduce((sum, exp) => sum + Number(exp.amount), 0);
      onExpensesChange?.(total);
    } catch (error: any) {
      toast.error("Failed to load expenses");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!restaurantId) {
      toast.error("Restaurant not selected");
      return;
    }

    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (!formData.description.trim()) {
      toast.error("Please enter a description");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("daily_expenses").insert([{
        restaurant_id: restaurantId,
        staff_id: user.id,
        description: formData.description.trim(),
        amount: amount,
        category: formData.category || null
      }]);

      if (error) throw error;
      
      toast.success("Expense added");
      setDialogOpen(false);
      setFormData({ description: "", amount: "", category: "" });
      fetchExpenses();
    } catch (error: any) {
      toast.error(error.message || "Failed to add expense");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("daily_expenses")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Expense deleted");
      fetchExpenses();
    } catch (error: any) {
      toast.error("Failed to delete expense");
    }
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Today's Expenses
            </CardTitle>
            <CardDescription>
              {expenses.length} expense{expenses.length !== 1 ? 's' : ''} • {formatPrice(totalExpenses)} total
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Expense</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value.slice(0, 200) })}
                    placeholder="e.g., Paper towels"
                    maxLength={200}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (₺) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">Add Expense</Button>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      {expenses.length > 0 && (
        <CardContent className="pt-0">
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {expenses.map((expense) => (
              <div key={expense.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{expense.description}</p>
                  {expense.category && (
                    <p className="text-xs text-muted-foreground">{expense.category}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-sm font-semibold text-destructive">
                    -{formatPrice(expense.amount)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleDelete(expense.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default ExpenseManager;
