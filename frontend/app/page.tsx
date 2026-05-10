"use client";
import { useState } from "react";
import { RefreshCw, Filter, TrendingUp, TrendingDown, DollarSign, Target, Zap, Users, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdSets } from "@/hooks/queries/useAdSets";
import { useAccountSummary } from "@/hooks/queries/useAccountSummary";
import { useFilterStore, DateRangeOption } from "@/store/useFilterStore";
import { useQueryClient } from "@tanstack/react-query";
import AdSetDataTable from "@/components/AdSetDataTable";
import AIAnalysisSheet from "@/components/AIAnalysisSheet";
import { AIAnalysisResult, statsApi } from "@/services/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DATE_OPTIONS: { label: string; value: DateRangeOption }[] = [
  { label: "Hôm qua", value: 1 },
  { label: "3 ngày", value: 3 },
  { label: "7 ngày", value: 7 },
  { label: "30 ngày", value: 30 },
];

const STATUS_OPTIONS = ["ALL", "ACTIVE", "PAUSED"] as const;

// ── Formatters ─────────────────────────────────────────────────────────────────

const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency", currency: "VND", maximumFractionDigits: 0,
    notation: n >= 1_000_000 ? "compact" : "standard",
  }).format(n);

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color = "gray", loading,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color?: "gray" | "green" | "red" | "blue" | "violet";
  loading?: boolean;
}) {
  const iconCls = {
    gray:   "bg-gray-100 text-gray-600",
    green:  "bg-green-100 text-green-600",
    red:    "bg-red-100 text-red-600",
    blue:   "bg-blue-100 text-blue-600",
    violet: "bg-violet-100 text-violet-600",
  }[color];

  const valCls = {
    gray: "text-gray-900", green: "text-green-700", red: "text-red-600",
    blue: "text-blue-700", violet: "text-violet-700",
  }[color];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide truncate">{label}</p>
          {loading ? (
            <Skeleton className="h-7 w-24 mt-1" />
          ) : (
            <p className={cn("text-2xl font-bold tabular-nums mt-1 truncate", valCls)}>{value}</p>
          )}
          {sub && !loading && (
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          )}
        </div>
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", iconCls)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { dateRange, statusFilter, setDateRange, setStatusFilter } = useFilterStore();
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [aiSheetOpen, setAiSheetOpen] = useState(false);
  const [analyzingAdsetName, setAnalyzingAdsetName] = useState<string>();

  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const { data, isLoading, isFetching, refetch } = useAdSets();
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useAccountSummary(dateRange);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const { data: r } = await statsApi.syncNow();
      toast.success(`Đồng bộ xong — ${r.synced_rows} bản ghi từ ${r.accounts} tài khoản`);
      await queryClient.invalidateQueries();
    } catch {
      toast.error("Đồng bộ thất bại — kiểm tra Meta access token");
    } finally {
      setSyncing(false);
    }
  };

  const adsets = data?.results ?? [];
  const total = data?.count ?? 0;

  const handleAnalyzeSuccess = (result: AIAnalysisResult) => {
    setAiResult(result);
    setAiSheetOpen(true);
    setAnalyzingAdsetName(adsets.find((a) => a.adset_id === result.adset_id)?.name);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AdSet Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} AdSets · {dateRange} ngày gần nhất
          </p>
        </div>
        <div className="flex gap-2 self-start">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleSyncNow} disabled={syncing} className="gap-2 text-blue-700 border-blue-200 hover:bg-blue-50">
            <RotateCcw className={cn("h-4 w-4", syncing && "animate-spin")} />
            {syncing ? "Đang đồng bộ..." : "Đồng bộ Meta"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">Thời gian:</span>
          {DATE_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setDateRange(value)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold transition-colors",
                dateRange === value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="w-px h-5 bg-gray-200 hidden sm:block" />
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-gray-400" />
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold transition-colors",
                statusFilter === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Stats cards — từ API /stats/summary/ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="Tổng chi tiêu"
          value={summary ? vnd(summary.total_spend) : "—"}
          sub={`${dateRange} ngày`}
          icon={DollarSign}
          color="blue"
          loading={summaryLoading}
        />
        <StatCard
          label="Chuyển đổi"
          value={summary ? String(summary.total_conversions) : "—"}
          sub="tổng toàn bộ"
          icon={Zap}
          color={summary && summary.total_conversions > 0 ? "green" : "gray"}
          loading={summaryLoading}
        />
        <StatCard
          label="CPA trung bình"
          value={summary ? vnd(summary.avg_cpa) : "—"}
          sub={summary && summary.avg_cpa > 500_000 ? "⚠ Vượt 500k" : "Trong ngưỡng"}
          icon={Target}
          color={summary && summary.avg_cpa > 500_000 ? "red" : "green"}
          loading={summaryLoading}
        />
        <StatCard
          label="ROAS trung bình"
          value={summary ? `${Number(summary.avg_roas || 0).toFixed(2)}x` : "—"}
          sub={summary && summary.avg_roas >= 2 ? "Tốt (≥2x)" : "Cần cải thiện"}
          icon={TrendingUp}
          color={summary && summary.avg_roas >= 2 ? "green" : "red"}
          loading={summaryLoading}
        />
        <StatCard
          label="Đang chạy"
          value={summary ? String(summary.active_adsets) : "—"}
          sub={`/ ${total} adsets`}
          icon={Users}
          color="violet"
          loading={summaryLoading}
        />
        <StatCard
          label="Đã dừng"
          value={summary ? String(summary.paused_adsets) : "—"}
          sub="paused adsets"
          icon={TrendingDown}
          color={summary && summary.paused_adsets > 0 ? "red" : "gray"}
          loading={summaryLoading}
        />
      </div>

      {/* Main table */}
      <AdSetDataTable
        adsets={adsets}
        isLoading={isLoading}
        onAnalyzeSuccess={handleAnalyzeSuccess}
      />

      <AIAnalysisSheet
        result={aiResult}
        adsetName={analyzingAdsetName}
        open={aiSheetOpen}
        onOpenChange={setAiSheetOpen}
      />
    </div>
  );
}
