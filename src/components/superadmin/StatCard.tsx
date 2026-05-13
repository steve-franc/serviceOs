import { motion } from "framer-motion";
import { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
}

export function StatCard({ label, value, sub, icon }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl bg-card p-4 sm:p-5 border border-border shadow-sm min-w-0 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">{label}</p>
        {icon && <div className="text-muted-foreground shrink-0">{icon}</div>}
      </div>
      <p className="mt-2 text-xl sm:text-2xl font-semibold tracking-tight text-card-foreground font-mono break-all">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground truncate">{sub}</p>}
    </motion.div>
  );
}
