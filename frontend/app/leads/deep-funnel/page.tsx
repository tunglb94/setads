"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Brain, RefreshCw, Sparkles, Phone, Calendar, TrendingUp, AlertTriangle, Filter,
} from "lucide-react";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { useFilterStore } from "@/store/useFilterStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDeepFunnel, useScoreAllLeads, type DeepFunnelMetrics } from "@/hooks/queries/useDeepFunnel";
import { DeepFunnelTable } from "@/components/deep-funnel/DeepFunnelTable";
import { LiveAnalyzerPanel } from "@/components/deep-funnel/LiveAnalyzerPanel";

// ── Summary KPI cards ──────────────────────────────────────────────────────────
interface KpiProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Brain;
  iconCls?: string;
  valueCls?: string;
  alert?: boolean;
}

function KpiCard({ label, value, sub, icon: Icon, iconCls, valueCls, alert }: KpiProps) {
  return (
    <div className={cn(
      "bg-white rounded-xl border p-4 shadow-sm flex gap-4 items-start",
      alert ? "border-red-200 bg-red-50/30" : "border-gray-200"
    )}>
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", iconCls ?? "bg-violet-100")}>
        <Icon className={cn("h-5 w-5", alert ? "text-red-600" : "text-violet-600")} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className={cn("text-2xl font-bold mt-0.5 tabular-nums", valueCls ?? "text-gray-900")}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Filter bar ─────────────────────────────────────────────────────────────────
type FilterMode = "all" | "scale" | "pause" | "no_data";

const FILTER_OPTIONS: { key: FilterMode; label: string; cls: string }[] = [
  { key: "all",     label: "Tất cả",        cls: "border-gray-300 text-gray-700 hover:bg-gray-50" },
  { key: "scale",   label: "SCALE",         cls: "border-emerald-300 text-emerald-700 hover:bg-emerald-50" },
  { key: "pause",   label: "PAUSE",         cls: "border-red-300 text-red-700 hover:bg-red-50" },
  { key: "no_data", label: "Chưa phân tích", cls: "border-amber-300 text-amber-700 hover:bg-amber-50" },
];

function filterData(data: DeepFunnelMetrics[], mode: FilterMode): DeepFunnelMetrics[] {
  if (mode === "scale")   return data.filter(d => d.ai_decision === "SCALE");
  if (mode === "pause")   return data.filter(d => d.ai_decision === "PAUSE");
  if (mode === "no_data") return data.filter(d => !d.ai_decision || d.total_conversations === 0);
  return data;
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DeepFunnelPage() {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [activeAd, setActiveAd] = useState<DeepFunnelMetrics | null>(null);
  const queryClient = useQueryClient();

  const { leadsDateRange, leadsCustomStart, leadsCustomEnd, setLeadsDateRange, setLeadsCustomDates } = useFilterStore();
  const { data: raw = [], isLoading } = useDeepFunnel();
  const { mutate: scoreAll, isPending: scoring } = useScoreAllLeads();

  const data = filterData(raw, filter);

  // Aggregate KPIs from all ads
  const totalSpend   = raw.reduce((a, d) => a + d.total_spend, 0);
  const totalConvs   = raw.reduce((a, d) => a + d.total_conversations, 0);
  const totalPhones  = raw.reduce((a, d) => a + d.qualified_leads, 0);
  const totalAppts   = raw.reduce((a, d) => a + d.appointment_count, 0);
  const totalSpam    = raw.reduce((a, d) => a + d.spam_count, 0);
  const totalScored  = raw.reduce((a, d) => a + d.scored_count, 0);
  const trueCpl      = totalPhones > 0 ? Math.round(totalSpend / totalPhones) : 0;
  const spamPct      = totalScored > 0 ? Math.round(totalSpam / totalScored * 100) : 0;
  const pauseCount   = raw.filter(d => d.ai_decision === "PAUSE").length;
  const scaleCount   = raw.filter(d => d.ai_decision === "SCALE").length;

  const fmtVnd = (n: number) =>
    n === 0 ? "—" : new Intl.NumberFormat("vi-VN").format(n) + "₫";

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-sm">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Deep Funnel AI Optimization</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              North Star: <span className="font-semibold text-violet-600">True CPL</span> = Chi tiêu thực ÷ Số SĐT thu được
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
            onClick={() => scoreAll()}
            disabled={scoring}
          >
            {scoring ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Đang chấm điểm AI...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Chấm điểm AI (Score All Unscored)
              </>
            )}
          </Button>
          <Button
            variant="outline" size="sm" className="gap-2"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["deep-funnel"] })}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Date filter ── */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
        <DateRangeFilter
          value={leadsDateRange}
          customStart={leadsCustomStart}
          customEnd={leadsCustomEnd}
          onChange={setLeadsDateRange}
          onCustomChange={setLeadsCustomDates}
        />
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="True CPL (Toàn tài khoản)"
          value={fmtVnd(trueCpl)}
          sub={`${fmtVnd(Math.round(totalSpend))} ÷ ${totalPhones} SĐT`}
          icon={Phone}
          iconCls="bg-green-100"
          valueCls={trueCpl === 0 ? "text-gray-400 text-base" : trueCpl <= 1_000_000 ? "text-emerald-700" : trueCpl <= 2_000_000 ? "text-amber-700" : trueCpl <= 3_000_000 ? "text-orange-600" : "text-red-700"}
        />
        <KpiCard
          label="Lịch hẹn (Appointment)"
          value={totalAppts}
          sub={`từ ${totalConvs} hội thoại`}
          icon={Calendar}
          iconCls="bg-purple-100"
          valueCls="text-purple-700"
        />
        <KpiCard
          label="Spam Rate"
          value={`${spamPct}%`}
          sub={`${totalSpam} / ${totalScored} đã phân loại`}
          icon={AlertTriangle}
          iconCls={spamPct > 30 ? "bg-red-100" : "bg-orange-100"}
          valueCls={spamPct > 50 ? "text-red-700" : spamPct > 30 ? "text-orange-600" : "text-gray-700"}
          alert={spamPct > 50}
        />
        <KpiCard
          label="AI Actions"
          value={`${scaleCount} SCALE · ${pauseCount} PAUSE`}
          sub={`${raw.length} ads đang chạy`}
          icon={TrendingUp}
          iconCls="bg-sky-100"
          valueCls="text-gray-800 text-lg"
        />
      </div>

      {/* ── Decision summary pills ── */}
      {!isLoading && raw.length > 0 && (pauseCount > 0 || scaleCount > 0) && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">AI gợi ý:</span>
          {scaleCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full">
              <TrendingUp className="h-3 w-3" />
              Scale {scaleCount} ad{scaleCount > 1 ? "s" : ""}
            </span>
          )}
          {pauseCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold bg-red-100 text-red-800 border border-red-200 px-3 py-1 rounded-full">
              <AlertTriangle className="h-3 w-3" />
              Dừng {pauseCount} ad{pauseCount > 1 ? "s" : ""} đang đốt tiền
            </span>
          )}
        </div>
      )}

      {/* ── Data table ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Table header bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">Lọc theo quyết định AI:</span>
          </div>
          <div className="flex gap-1.5">
            {FILTER_OPTIONS.map(({ key, label, cls }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  "text-xs font-medium px-3 py-1.5 rounded-lg border transition-all",
                  filter === key
                    ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                    : cls
                )}
              >
                {label}
                {key !== "all" && !isLoading && (
                  <span className="ml-1.5 opacity-60">
                    ({key === "scale" ? scaleCount : key === "pause" ? pauseCount : raw.filter(d => !d.ai_decision || d.total_conversations === 0).length})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Row count indicator */}
        {!isLoading && (
          <div className="px-5 py-2 bg-gray-50/50 border-b border-gray-100 text-xs text-gray-400 flex items-center gap-2">
            <span>Hiển thị <span className="font-semibold text-gray-600">{data.length}</span> / {raw.length} ads</span>
            {totalConvs > 0 && (
              <>
                <span>·</span>
                <span><span className="font-semibold text-violet-600">{totalPhones}</span> SĐT thu được</span>
                <span>·</span>
                <span><span className="font-semibold text-green-600">{fmtVnd(trueCpl)}</span> / SĐT</span>
              </>
            )}
          </div>
        )}

        <DeepFunnelTable
          data={data}
          isLoading={isLoading}
          onAnalyze={(ad) => setActiveAd(ad)}
          analyzingAdId={activeAd?.ad_id}
        />
      </div>

      {/* ── Live Streaming Analyst panel ── */}
      {activeAd && (
        <LiveAnalyzerPanel
          adId={activeAd.ad_id}
          adName={activeAd.ad_name}
          onClose={() => setActiveAd(null)}
        />
      )}

      {/* ── Methodology note ── */}
      <div className="rounded-xl bg-violet-50 border border-violet-100 p-4 flex gap-3">
        <Brain className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
        <div className="text-xs text-violet-700 space-y-1">
          <p className="font-semibold">Hai chỉ số — hai ngưỡng khác nhau</p>
          <div className="space-y-1 text-violet-600">
            <p>
              <span className="font-semibold text-violet-700">CPA (cost/inbox)</span> = chi tiêu ÷ inbox — Meta báo riêng inbox &amp; comment.
              Ngưỡng: <span className="text-emerald-600 font-semibold">≤500k tốt</span> ·
              <span className="text-amber-600 font-semibold"> ≤600k chấp nhận</span> ·
              <span className="text-orange-600 font-semibold"> ≤700k khá cao</span> ·
              <span className="text-red-600 font-semibold"> &gt;700k đắt</span>
            </p>
            <p>
              <span className="font-semibold text-violet-700">True CPL (cost/SĐT)</span> = chi tiêu ÷ số điện thoại thật — AI đọc từng hội thoại.
              Ngưỡng: <span className="text-emerald-600 font-semibold">≤1tr tốt</span> ·
              <span className="text-amber-600 font-semibold"> ≤2tr chấp nhận</span> ·
              <span className="text-orange-600 font-semibold"> ≤3tr khá cao</span> ·
              <span className="text-red-600 font-semibold"> &gt;3tr đắt</span>
            </p>
            <p className="text-violet-500 mt-0.5">
              <span className="font-semibold">~ Cột SĐT | Lịch</span> hiện dùng tỷ lệ ước tính từ toàn inbox (chưa có webhook attribution per-ad).
              Số liệu sẽ chính xác hơn khi webhook referral được kích hoạt cho quảng cáo Click-to-Messenger.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
