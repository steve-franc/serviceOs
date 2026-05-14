import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/superadmin/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ToggleGroup, ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { motion } from "framer-motion";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, AreaChart, Area,
} from "recharts";
import {
  Users, Store, CalendarCheck, TrendingDown, TrendingUp,
  RefreshCw, AlertTriangle, ArrowUpRight, ArrowDownRight, Star, ArrowUpDown,
} from "lucide-react";

type Filters = {
  days: number;
  businessTypes: string[];
  status: "all" | "active" | "inactive";
};

const BUSINESS_TYPE_OPTIONS = [
  "restaurant", "cafe", "bar", "bakery", "salon", "gym", "services", "retail",
];

function pctDelta(curr: number, prev: number): { value: number; up: boolean } | null {
  if (!prev || prev === 0) return null;
  const v = ((curr - prev) / prev) * 100;
  return { value: Math.abs(v), up: v >= 0 };
}

function TrendPill({ delta }: { delta: ReturnType<typeof pctDelta> }) {
  if (!delta) return <span className="text-xs text-muted-foreground">—</span>;
  const Icon = delta.up ? ArrowUpRight : ArrowDownRight;
  const color = delta.up ? "text-emerald-500" : "text-red-500";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
      <Icon className="h-3 w-3" />{delta.value.toFixed(1)}%
    </span>
  );
}

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
} as const;

type SortDir = "asc" | "desc";
type SortState<K extends string> = { key: K; dir: SortDir };

function sortBy<T>(rows: T[], key: keyof T, dir: SortDir) {
  const arr = [...rows];
  arr.sort((a: any, b: any) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return dir === "asc" ? av - bv : bv - av;
    return dir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });
  return arr;
}

function SortHead({
  label, active, dir, onClick, align = "left",
}: { label: string; active: boolean; dir: SortDir; onClick: () => void; align?: "left" | "right" }) {
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-foreground" : ""}`}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`} />
        {active && <span className="text-[10px]">{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </TableHead>
  );
}

export default function SuperAnalytics() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>({
    days: 30, businessTypes: [], status: "all",
  });
  const [topSort, setTopSort] = useState<SortState<"name" | "business_type" | "bookings_period" | "bookings_prev" | "status">>({ key: "bookings_period", dir: "desc" });
  const [decSort, setDecSort] = useState<SortState<"name" | "business_type" | "bookings_prev" | "bookings_period" | "pct_change" | "last_activity">>({ key: "pct_change", dir: "asc" });
  const [belowSort, setBelowSort] = useState<SortState<"name" | "business_type" | "bookings_period" | "bookings_prev" | "status">>({ key: "bookings_period", dir: "asc" });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["super", "platform-analytics", filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_platform_analytics", {
        _days: filters.days,
        _business_types: filters.businessTypes.length ? filters.businessTypes : null,
        _status: filters.status === "all" ? null : filters.status,
      } as any);
      if (error) throw error;
      return data as any;
    },
  });

  const kpi = data?.kpi ?? {};
  const trend: any[] = data?.trend ?? [];
  const industry: any[] = data?.industry ?? [];
  const top: any[] = data?.top_businesses ?? [];
  const declining: any[] = data?.declining ?? [];
  const svc = data?.service_stats ?? {};

  const avgBookings = useMemo(() => {
    if (!top.length) return 0;
    const total = top.reduce((s, b: any) => s + Number(b.bookings_period ?? 0), 0);
    return total / top.length;
  }, [top]);

  const belowAverage = useMemo(
    () => top.filter((b: any) => Number(b.bookings_period ?? 0) < avgBookings),
    [top, avgBookings],
  );

  const sortedTop = useMemo(() => sortBy(top, topSort.key, topSort.dir).slice(0, 25), [top, topSort]);
  const sortedDeclining = useMemo(() => sortBy(declining, decSort.key, decSort.dir), [declining, decSort]);
  const sortedBelow = useMemo(() => sortBy(belowAverage, belowSort.key, belowSort.dir), [belowAverage, belowSort]);

  const goToBusiness = (id: string) => navigate(`/superadmin/restaurants/${id}`);
  const cycleSort = <K extends string>(s: SortState<K>, k: K, set: (n: SortState<K>) => void) =>
    set({ key: k, dir: s.key === k && s.dir === "desc" ? "asc" : "desc" });

  const cancellationRate = useMemo(() => {
    const total = Number(svc.total ?? 0);
    if (!total) return null;
    return (Number(svc.cancelled ?? 0) / total) * 100;
  }, [svc]);

  const noShowRate = useMemo(() => {
    const total = Number(svc.total ?? 0);
    if (!total) return null;
    return (Number(svc.no_show ?? 0) / total) * 100;
  }, [svc]);

  const activePct = useMemo(() => {
    const t = Number(kpi.total_businesses ?? 0);
    if (!t) return 0;
    return (Number(kpi.active_businesses ?? 0) / t) * 100;
  }, [kpi]);

  const bookingsDelta = pctDelta(Number(kpi.bookings_period ?? 0), Number(kpi.bookings_prev_period ?? 0));
  const customersDelta = pctDelta(Number(kpi.new_customers_period ?? 0), Number(kpi.new_customers_prev ?? 0));

  const toggleType = (t: string) => {
    setFilters((f) => ({
      ...f,
      businessTypes: f.businessTypes.includes(t)
        ? f.businessTypes.filter((x) => x !== t)
        : [...f.businessTypes, t],
    }));
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Platform Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cross-business activity, customers, and churn signals
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <Select
          value={String(filters.days)}
          onValueChange={(v) => setFilters((f) => ({ ...f, days: Number(v) }))}
        >
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 180 days</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.status}
          onValueChange={(v: any) => setFilters((f) => ({ ...f, status: v }))}
        >
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All businesses</SelectItem>
            <SelectItem value="active">Active only (30d)</SelectItem>
            <SelectItem value="inactive">Inactive only</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1 min-w-[260px]">
          <ToggleGroup
            type="multiple"
            value={filters.businessTypes}
            onValueChange={(v) => setFilters((f) => ({ ...f, businessTypes: v }))}
            className="flex-wrap justify-start"
          >
            {BUSINESS_TYPE_OPTIONS.map((t) => (
              <ToggleGroupItem key={t} value={t} size="sm" className="capitalize text-xs h-8">
                {t}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard
              label="Active Businesses"
              value={String(kpi.active_businesses ?? 0)}
              sub={`${activePct.toFixed(0)}% of ${kpi.total_businesses ?? 0} total`}
              icon={<Store className="h-4 w-4" />}
            />
            <StatCard
              label="Total Customers"
              value={Number(kpi.total_customers ?? 0).toLocaleString()}
              sub={<><TrendPill delta={customersDelta} /> new this period</>}
              icon={<Users className="h-4 w-4" />}
            />
            <StatCard
              label="Bookings (period)"
              value={Number(kpi.bookings_period ?? 0).toLocaleString()}
              sub={<><TrendPill delta={bookingsDelta} /> vs previous</>}
              icon={<CalendarCheck className="h-4 w-4" />}
            />
            <StatCard
              label="Avg Platform Rating"
              value={<span className="text-muted-foreground text-base">N/A</span>}
              sub="Ratings not tracked yet"
              icon={<Star className="h-4 w-4" />}
            />
          </>
        )}
      </div>

      {/* Charts: 2/3 + 1/3 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold mb-4">Booking Trend</h2>
            {isLoading ? <Skeleton className="h-[260px]" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="bGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }}
                    tickFormatter={(v) => new Date(v).getDate().toString()}
                    stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle}
                    labelFormatter={(l) => new Date(l).toLocaleDateString()} />
                  <Area type="monotone" dataKey="bookings" stroke="hsl(var(--primary))"
                    fill="url(#bGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold mb-4">Bookings by Industry</h2>
            {isLoading ? <Skeleton className="h-[240px]" /> : industry.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">No bookings in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={industry}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="business_type" tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="bookings" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }} className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold mb-2">New Customers Trend</h2>
            <p className="text-xs text-muted-foreground mb-3">Daily unique customers</p>
            {isLoading ? <Skeleton className="h-[160px]" /> : (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }}
                    tickFormatter={(v) => new Date(v).getDate().toString()}
                    stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle}
                    labelFormatter={(l) => new Date(l).toLocaleDateString()} />
                  <Line type="monotone" dataKey="customers" stroke="hsl(var(--primary))"
                    strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold">Key Metrics</h2>
            <div className="space-y-3">
              <MetricRow label="Active businesses %" value={`${activePct.toFixed(1)}%`}
                tone={activePct >= 60 ? "good" : activePct >= 30 ? "warn" : "bad"} />
              <MetricRow label="Cancellation rate (services)"
                value={cancellationRate == null ? "—" : `${cancellationRate.toFixed(1)}%`}
                tone={cancellationRate == null ? "neutral" : cancellationRate < 10 ? "good" : cancellationRate < 25 ? "warn" : "bad"} />
              <MetricRow label="No-show rate (services)"
                value={noShowRate == null ? "—" : `${noShowRate.toFixed(1)}%`}
                tone={noShowRate == null ? "neutral" : noShowRate < 5 ? "good" : noShowRate < 15 ? "warn" : "bad"} />
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Rating Distribution</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Customer ratings aren't tracked in your data model yet. Once a reviews
              table is added, this widget will populate automatically.
            </p>
          </Card>
        </motion.div>
      </div>

      {/* Top Businesses */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold mb-4">Top Businesses by Bookings</h2>
        {isLoading ? <Skeleton className="h-40" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead label="Business" active={topSort.key === "name"} dir={topSort.dir} onClick={() => cycleSort(topSort, "name", setTopSort)} />
                <SortHead label="Type" active={topSort.key === "business_type"} dir={topSort.dir} onClick={() => cycleSort(topSort, "business_type", setTopSort)} />
                <SortHead label="Bookings (period)" align="right" active={topSort.key === "bookings_period"} dir={topSort.dir} onClick={() => cycleSort(topSort, "bookings_period", setTopSort)} />
                <TableHead className="text-right">vs Prev</TableHead>
                <SortHead label="Status" active={topSort.key === "status"} dir={topSort.dir} onClick={() => cycleSort(topSort, "status", setTopSort)} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTop.map((b: any) => {
                const d = pctDelta(b.bookings_period, b.bookings_prev);
                return (
                  <TableRow key={b.id} onClick={() => goToBusiness(b.id)} className="cursor-pointer">
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{b.business_type}</TableCell>
                    <TableCell className="text-right font-mono">{b.bookings_period}</TableCell>
                    <TableCell className="text-right"><TrendPill delta={d} /></TableCell>
                    <TableCell>
                      <Badge variant={b.status === "active" ? "default" : "secondary"} className="capitalize">
                        {b.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {sortedTop.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  No data
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Highest Rated (placeholder until ratings tracked) */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <Star className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold">Highest Rated Businesses</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Customer ratings aren't tracked in the data model yet. Once a reviews
          table is added, this table will populate and become sortable.
        </p>
      </Card>

      {/* Declining */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <h2 className="text-sm font-semibold">Businesses with Declining Activity</h2>
          <span className="text-xs text-muted-foreground">(&gt;20% drop vs previous period)</span>
        </div>
        {isLoading ? <Skeleton className="h-32" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead label="Business" active={decSort.key === "name"} dir={decSort.dir} onClick={() => cycleSort(decSort, "name", setDecSort)} />
                <SortHead label="Type" active={decSort.key === "business_type"} dir={decSort.dir} onClick={() => cycleSort(decSort, "business_type", setDecSort)} />
                <SortHead label="Prev" align="right" active={decSort.key === "bookings_prev"} dir={decSort.dir} onClick={() => cycleSort(decSort, "bookings_prev", setDecSort)} />
                <SortHead label="Current" align="right" active={decSort.key === "bookings_period"} dir={decSort.dir} onClick={() => cycleSort(decSort, "bookings_period", setDecSort)} />
                <SortHead label="% Change" align="right" active={decSort.key === "pct_change"} dir={decSort.dir} onClick={() => cycleSort(decSort, "pct_change", setDecSort)} />
                <SortHead label="Last Activity" active={decSort.key === "last_activity"} dir={decSort.dir} onClick={() => cycleSort(decSort, "last_activity", setDecSort)} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedDeclining.map((b: any) => (
                <TableRow key={b.id} onClick={() => goToBusiness(b.id)} className="bg-red-500/5 cursor-pointer">
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{b.business_type}</TableCell>
                  <TableCell className="text-right font-mono">{b.bookings_prev}</TableCell>
                  <TableCell className="text-right font-mono">{b.bookings_period}</TableCell>
                  <TableCell className="text-right font-medium text-red-500">
                    {Number(b.pct_change).toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {b.last_activity ? new Date(b.last_activity).toLocaleDateString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {sortedDeclining.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  No businesses showing significant decline 🎉
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Below Average */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingDown className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold">Businesses Below Average</h2>
          <span className="text-xs text-muted-foreground">
            (under platform avg of {avgBookings.toFixed(1)} bookings)
          </span>
        </div>
        {isLoading ? <Skeleton className="h-32" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead label="Business" active={belowSort.key === "name"} dir={belowSort.dir} onClick={() => cycleSort(belowSort, "name", setBelowSort)} />
                <SortHead label="Type" active={belowSort.key === "business_type"} dir={belowSort.dir} onClick={() => cycleSort(belowSort, "business_type", setBelowSort)} />
                <SortHead label="Bookings" align="right" active={belowSort.key === "bookings_period"} dir={belowSort.dir} onClick={() => cycleSort(belowSort, "bookings_period", setBelowSort)} />
                <SortHead label="Prev" align="right" active={belowSort.key === "bookings_prev"} dir={belowSort.dir} onClick={() => cycleSort(belowSort, "bookings_prev", setBelowSort)} />
                <SortHead label="Status" active={belowSort.key === "status"} dir={belowSort.dir} onClick={() => cycleSort(belowSort, "status", setBelowSort)} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedBelow.map((b: any) => (
                <TableRow key={b.id} onClick={() => goToBusiness(b.id)} className="cursor-pointer">
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{b.business_type}</TableCell>
                  <TableCell className="text-right font-mono">{b.bookings_period}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{b.bookings_prev}</TableCell>
                  <TableCell>
                    <Badge variant={b.status === "active" ? "default" : "secondary"} className="capitalize">
                      {b.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {sortedBelow.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  All businesses at or above average
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function MetricRow({
  label, value, tone,
}: { label: string; value: string; tone: "good" | "warn" | "bad" | "neutral" }) {
  const color =
    tone === "good" ? "text-emerald-500"
    : tone === "warn" ? "text-amber-500"
    : tone === "bad" ? "text-red-500"
    : "text-muted-foreground";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold font-mono ${color}`}>{value}</span>
    </div>
  );
}
