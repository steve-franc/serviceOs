import { useState, useMemo } from "react";
import Layout from "@/components/Layout";
import { useSuperUsers } from "@/hooks/useSuperadminData";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Search, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useRestaurantAndRole } from "@/hooks/useRestaurantAndRole";

const ROLES = ["manager", "ops", "counter", "server", "investor"] as const;

function MembershipRow({ userId, m, onChange }: { userId: string; m: any; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const change = async (role: string) => {
    setBusy(true);
    const { error } = await supabase.rpc("superadmin_change_role", {
      _user_id: userId,
      _restaurant_id: m.restaurant_id,
      _role: role,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Role updated");
    onChange();
  };
  const remove = async () => {
    if (!confirm(`Remove from ${m.restaurant_name}?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("superadmin_remove_staff", {
      _user_id: userId,
      _restaurant_id: m.restaurant_id,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Removed from restaurant");
    onChange();
  };
  return (
    <div className="flex items-center gap-2 text-xs bg-muted/40 rounded-md px-2 py-1.5">
      <span className="font-medium truncate flex-1">{m.restaurant_name || "—"}</span>
      <Select value={m.role || ""} onValueChange={change} disabled={busy}>
        <SelectTrigger className="w-28 h-7 text-xs">
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={remove} disabled={busy}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default function SuperUsers() {
  const { data, isLoading, refetch } = useSuperUsers();
  const { user } = useRestaurantAndRole();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data ?? [];
    return (data ?? []).filter(
      (u: any) =>
        (u.full_name || "").toLowerCase().includes(s) ||
        (u.user_id || "").toLowerCase().includes(s) ||
        (u.restaurants || []).some((r: any) => (r.restaurant_name || "").toLowerCase().includes(s)),
    );
  }, [data, q]);

  const refresh = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["super"] });
  };

  const deleteUser = async (uid: string, name: string) => {
    if (uid === user?.id) {
      toast.error("You cannot delete yourself");
      return;
    }
    if (!confirm(`Permanently delete ${name || "this user"}? This cannot be undone.`)) return;
    const { error } = await supabase.functions.invoke("superadmin-delete-user", { body: { user_id: uid } });
    if (error) return toast.error(error.message);
    toast.success("User deleted");
    refresh();
  };

  const toggleSuperadmin = async (uid: string, currentlySuper: boolean, name: string) => {
    if (uid === user?.id && currentlySuper) {
      toast.error("You cannot revoke your own God Mode");
      return;
    }
    const verb = currentlySuper ? "revoke God Mode from" : "grant God Mode to";
    if (!confirm(`${verb} ${name || "this user"}?`)) return;
    const { error } = await supabase.rpc("superadmin_set_superadmin", { _user_id: uid, _grant: !currentlySuper });
    if (error) return toast.error(error.message);
    toast.success(currentlySuper ? "God Mode revoked" : "God Mode granted");
    refresh();
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">All accounts on the platform</p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, restaurant, or ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-card border border-border shadow-sm overflow-hidden"
        >
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((u: any) => (
                <div key={u.user_id} className="p-4 flex flex-col md:flex-row md:items-start gap-4">
                  <div className="md:w-64 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{u.full_name || "Unnamed"}</p>
                      {u.is_superadmin && (
                        <Badge variant="outline" className="text-amber-600 border-amber-500/40 gap-1">
                          <Crown className="h-3 w-3" /> Super
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">{u.user_id}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Joined {new Date(u.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    {(u.restaurants || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No restaurant memberships</p>
                    ) : (
                      (u.restaurants || []).map((m: any) => (
                        <MembershipRow key={m.restaurant_id} userId={u.user_id} m={m} onChange={refresh} />
                      ))
                    )}
                  </div>

                  <div className="flex md:flex-col gap-2 md:justify-start">
                    <Button
                      size="sm"
                      variant="outline"
                      className={u.is_superadmin ? "text-amber-600 border-amber-500/40" : ""}
                      onClick={() => toggleSuperadmin(u.user_id, u.is_superadmin, u.full_name)}
                      disabled={u.user_id === user?.id && u.is_superadmin}
                    >
                      <Crown className="h-3.5 w-3.5 mr-1.5" />
                      {u.is_superadmin ? "Revoke God" : "Make God"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteUser(u.user_id, u.full_name)}
                      disabled={u.user_id === user?.id || u.is_superadmin}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                    </Button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">No users found</div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </Layout>
  );
}
