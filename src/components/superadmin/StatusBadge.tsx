import { Badge } from "@/components/ui/badge";

const styles: Record<string, string> = {
  active: "bg-green-500/15 text-green-700 dark:text-green-400 border-0",
  confirmed: "bg-green-500/15 text-green-700 dark:text-green-400 border-0",
  paid: "bg-green-500/15 text-green-700 dark:text-green-400 border-0",
  on_hold: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0",
  unpaid: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0",
  archived: "bg-muted text-muted-foreground border-0",
  inactive: "bg-muted text-muted-foreground border-0",
  cancelled: "bg-red-500/15 text-red-700 dark:text-red-400 border-0",
};

export function StatusBadge({ status }: { status?: string | null }) {
  const key = (status || "").toLowerCase();
  const cls = styles[key] || "bg-muted text-muted-foreground border-0";
  const label = key === "on_hold" ? "On hold" : key || "—";
  return <Badge className={`capitalize ${cls}`}>{label}</Badge>;
}
