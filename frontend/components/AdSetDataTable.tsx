"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Brain, ExternalLink, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AdSet, AdData, adsetApi } from "@/services/api";
import { useToggleAdSet, useTriggerAIAnalysis } from "@/hooks/queries/useAdSets";
import { useFilterStore, resolveDateParams } from "@/store/useFilterStore";

// ── Formatters ────────────────────────────────────────────────────────────────

const n = (v: unknown) => (v == null ? 0 : Number(v));

const vnd = (v: unknown) =>
  n(v) > 0
    ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n(v))
    : "—";

const num = (v: unknown) => (n(v) > 0 ? n(v).toLocaleString("vi-VN") : "—");
const pct = (v: unknown) => (n(v) > 0 ? `${n(v).toFixed(2)}%` : "—");

// ── AI Badge ──────────────────────────────────────────────────────────────────

function AIBadge({ decision }: { decision?: string }) {
  if (!decision) return <span className="text-gray-300 text-xs">—</span>;
  const cfg: Record<string, { cls: string }> = {
    SCALE: { cls: "bg-green-100 text-green-700 border-green-200" },
    PAUSE: { cls: "bg-red-100 text-red-700 border-red-200" },
    KEEP:  { cls: "bg-gray-100 text-gray-600 border-gray-200" },
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0.5", cfg[decision]?.cls ?? "bg-gray-100 text-gray-500")}>
      {decision}
    </Badge>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-block w-1.5 h-1.5 rounded-full mr-1.5",
      status === "ACTIVE" ? "bg-green-500" : "bg-gray-300"
    )} />
  );
}

// ── Column header ─────────────────────────────────────────────────────────────

const COL_HEADERS = [
  { label: "Tên",            width: "w-[260px] min-w-[200px]" },
  { label: "Trạng thái",     width: "w-[90px]" },
  { label: "Ngân sách/ngày", width: "w-[120px]" },
  { label: "Chi tiêu",       width: "w-[120px]" },
  { label: "Hiển thị",       width: "w-[90px]" },
  { label: "Clicks",         width: "w-[70px]" },
  { label: "CTR",            width: "w-[65px]" },
  { label: "CPC",            width: "w-[100px]" },
  { label: "Mess",           width: "w-[60px]" },
  { label: "Chi phí mess",   width: "w-[110px]" },
  { label: "AI",             width: "w-[80px]" },
  { label: "",               width: "w-[60px]" },
];

// ── Ad row (level 3) ──────────────────────────────────────────────────────────

function AdRow({ ad }: { ad: AdData }) {
  return (
    <tr className="border-b border-gray-50 hover:bg-blue-50/20 transition-colors">
      <td className="px-3 py-2 align-middle">
        <div className="flex items-center gap-1 pl-14">
          <StatusDot status={ad.status} />
          <span className="text-xs text-gray-600 truncate max-w-[200px]" title={ad.ad_name}>
            {ad.ad_name || "—"}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 text-[11px] text-gray-400">{ad.status === "ACTIVE" ? "Đang chạy" : "Dừng"}</td>
      <td className="px-3 py-2 text-xs text-gray-300">—</td>
      <td className="px-3 py-2">
        <span className="text-xs font-mono tabular-nums text-gray-700">{vnd(ad.spend)}</span>
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-gray-500">{num(ad.impressions)}</td>
      <td className="px-3 py-2 text-xs tabular-nums text-gray-500">{num(ad.clicks)}</td>
      <td className="px-3 py-2 text-xs tabular-nums text-gray-500">{pct(ad.ctr)}</td>
      <td className="px-3 py-2 text-xs font-mono tabular-nums text-gray-600">{vnd(ad.cpc)}</td>
      <td className="px-3 py-2">
        <span className={cn("text-xs tabular-nums font-semibold", n(ad.message_count) > 0 ? "text-blue-600" : "text-gray-300")}>
          {n(ad.message_count) > 0 ? ad.message_count : "—"}
        </span>
      </td>
      <td className="px-3 py-2 text-xs font-mono tabular-nums text-gray-600">{vnd(ad.cost_per_message)}</td>
      <td className="px-3 py-2"><AIBadge decision={ad.ai_decision} /></td>
      <td className="px-3 py-2" />
    </tr>
  );
}

// ── AdSet row (level 2) ───────────────────────────────────────────────────────

function AdSetRow({
  adset,
  dateParams,
  onAnalyze,
  analyzingId,
}: {
  adset: AdSet;
  dateParams: { days?: number; date_from?: string; date_to?: string };
  onAnalyze: (id: string) => void;
  analyzingId: string | null | undefined;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const { mutate: toggle } = useToggleAdSet();

  const { data: ads, isLoading: adsLoading } = useQuery({
    queryKey: ["adset-ads", adset.adset_id, dateParams],
    queryFn: async () => {
      const { data } = await adsetApi.ads(adset.adset_id, dateParams);
      return data;
    },
    enabled: expanded,
    staleTime: 60_000,
  });

  const ins = adset.latest_insight;
  const isAnalyzing = analyzingId === adset.adset_id;

  return (
    <>
      <tr
        className={cn(
          "border-b border-gray-100 hover:bg-gray-50/70 transition-colors",
          adset.auto_paused && "bg-red-50/30"
        )}
      >
        {/* Name + expand */}
        <td className="px-3 py-2.5 align-middle">
          <div className="flex items-center gap-1 pl-6">
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-0.5 rounded hover:bg-gray-200 transition-colors shrink-0"
            >
              {expanded
                ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
            </button>
            <StatusDot status={adset.status} />
            <span className="text-sm text-gray-800 truncate max-w-[200px]" title={adset.name}>
              {adset.name}
            </span>
            {adset.auto_paused && (
              <span className="ml-1 text-[9px] bg-red-100 text-red-600 px-1 rounded font-bold">AUTO-PAUSED</span>
            )}
          </div>
        </td>
        {/* Status toggle */}
        <td className="px-3 py-2.5 align-middle">
          <div className="flex items-center gap-1.5">
            <Switch
              checked={adset.status === "ACTIVE"}
              onCheckedChange={() => toggle(adset.adset_id)}
              className="scale-75"
            />
            <span className={cn("text-[11px]", adset.status === "ACTIVE" ? "text-green-600" : "text-gray-400")}>
              {adset.status === "ACTIVE" ? "Đang chạy" : "Dừng"}
            </span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs text-gray-400 tabular-nums">—</td>
        <td className="px-3 py-2.5">
          <span className="text-sm font-mono tabular-nums font-semibold">{vnd(ins?.spend)}</span>
        </td>
        <td className="px-3 py-2.5 text-xs tabular-nums text-gray-600">{num(ins?.impressions)}</td>
        <td className="px-3 py-2.5 text-xs tabular-nums text-gray-600">{num(ins?.clicks)}</td>
        <td className="px-3 py-2.5 text-xs tabular-nums text-gray-600">{pct(ins?.ctr)}</td>
        <td className="px-3 py-2.5 text-xs font-mono tabular-nums">{vnd(ins?.cpc)}</td>
        <td className="px-3 py-2.5">
          <span className={cn("text-sm tabular-nums font-semibold", n(ins?.message_count) > 0 ? "text-blue-600" : "text-gray-300")}>
            {n(ins?.message_count) > 0 ? ins!.message_count : "—"}
          </span>
        </td>
        <td className="px-3 py-2.5 text-xs font-mono tabular-nums">{vnd(ins?.cost_per_message)}</td>
        <td className="px-3 py-2.5"><AIBadge decision={adset.ai_decision} /></td>
        <td className="px-3 py-2.5">
          <div className="flex gap-1">
            <Button
              size="sm" variant="outline"
              className="gap-1 text-violet-700 border-violet-200 hover:bg-violet-50 h-7 px-2 text-xs"
              onClick={() => onAnalyze(adset.adset_id)}
              disabled={isAnalyzing}
            >
              {isAnalyzing
                ? <span className="h-3 w-3 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                : <Brain className="h-3 w-3" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => router.push(`/adsets/${adset.adset_id}`)}>
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>

      {/* Ad rows */}
      {expanded && adsLoading && (
        <tr className="border-b border-gray-50">
          <td colSpan={COL_HEADERS.length} className="px-3 py-2 pl-16">
            <div className="flex gap-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-3 w-20" />)}
            </div>
          </td>
        </tr>
      )}
      {expanded && ads?.map(ad => <AdRow key={ad.ad_id} ad={ad} />)}
      {expanded && !adsLoading && ads?.length === 0 && (
        <tr className="border-b border-gray-50">
          <td colSpan={COL_HEADERS.length} className="px-3 py-2 pl-16 text-xs text-gray-400">
            Không có dữ liệu quảng cáo trong khoảng thời gian này
          </td>
        </tr>
      )}
    </>
  );
}

// ── Campaign row (level 1) ────────────────────────────────────────────────────

function CampaignRow({
  campaignName,
  campaignStatus,
  adsets,
  dateParams,
  onAnalyze,
  analyzingId,
}: {
  campaignName: string;
  campaignStatus: string;
  adsets: AdSet[];
  dateParams: { days?: number; date_from?: string; date_to?: string };
  onAnalyze: (id: string) => void;
  analyzingId: string | null | undefined;
}) {
  const [expanded, setExpanded] = useState(true);
  const isPaused = campaignStatus === "PAUSED";

  // Aggregate campaign stats from adset insights
  const totalSpend = adsets.reduce((s, a) => s + n(a.latest_insight?.spend), 0);
  const totalImpressions = adsets.reduce((s, a) => s + n(a.latest_insight?.impressions), 0);
  const totalClicks = adsets.reduce((s, a) => s + n(a.latest_insight?.clicks), 0);
  const totalMess = adsets.reduce((s, a) => s + n(a.latest_insight?.message_count), 0);
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions * 100 : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const costPerMess = totalMess > 0 ? Math.round(totalSpend / totalMess) : 0;
  const budget = adsets[0]?.campaign_daily_budget ?? null;

  return (
    <>
      {/* Campaign header row */}
      <tr
        className={cn(
          "border-b border-gray-200 cursor-pointer transition-colors",
          isPaused
            ? "bg-gray-50 hover:bg-gray-100/80 opacity-70"
            : "bg-gray-100 hover:bg-gray-200/60"
        )}
        onClick={() => setExpanded(v => !v)}
      >
        <td className="px-3 py-2.5 align-middle">
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
              : <ChevronRight className="h-4 w-4 text-gray-500 shrink-0" />}
            <span className={cn(
              "text-sm font-bold truncate max-w-[200px]",
              isPaused ? "text-gray-400" : "text-gray-900"
            )} title={campaignName}>
              {campaignName}
            </span>
            {isPaused
              ? <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-semibold shrink-0">TẠM DỪNG</span>
              : <span className="text-[10px] text-gray-400 shrink-0">{adsets.length} nhóm QC</span>}
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span className={cn(
            "text-[11px] font-semibold",
            isPaused ? "text-gray-400" : "text-green-600"
          )}>
            {isPaused ? "Tạm dừng" : "Đang chạy"}
          </span>
        </td>
        <td className="px-3 py-2.5">
          {budget ? (
            <span className="text-xs font-mono tabular-nums font-semibold text-gray-700">{vnd(budget)}</span>
          ) : <span className="text-gray-300 text-xs">—</span>}
        </td>
        <td className="px-3 py-2.5">
          <span className="text-sm font-mono tabular-nums font-bold text-gray-900">{vnd(totalSpend)}</span>
        </td>
        <td className="px-3 py-2.5 text-xs tabular-nums text-gray-700 font-semibold">{num(totalImpressions)}</td>
        <td className="px-3 py-2.5 text-xs tabular-nums text-gray-700 font-semibold">{num(totalClicks)}</td>
        <td className="px-3 py-2.5 text-xs tabular-nums text-gray-700">{pct(avgCtr)}</td>
        <td className="px-3 py-2.5 text-xs font-mono tabular-nums text-gray-700">{vnd(avgCpc)}</td>
        <td className="px-3 py-2.5">
          <span className={cn("text-sm tabular-nums font-bold", totalMess > 0 ? "text-blue-700" : "text-gray-300")}>
            {totalMess > 0 ? totalMess : "—"}
          </span>
        </td>
        <td className="px-3 py-2.5">
          {costPerMess > 0
            ? <span className="text-xs font-mono tabular-nums font-semibold text-gray-700">{vnd(costPerMess)}</span>
            : <span className="text-gray-300 text-xs">—</span>}
        </td>
        <td className="px-3 py-2.5" />
        <td className="px-3 py-2.5" />
      </tr>

      {/* AdSet rows */}
      {expanded && adsets.map(adset => (
        <AdSetRow
          key={adset.adset_id}
          adset={adset}
          dateParams={dateParams}
          onAnalyze={onAnalyze}
          analyzingId={analyzingId}
        />
      ))}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  adsets: AdSet[];
  isLoading?: boolean;
  onAnalyzeSuccess?: (result: import("@/services/api").AIAnalysisResult) => void;
}

export default function AdSetDataTable({ adsets, isLoading, onAnalyzeSuccess }: Props) {
  const [search, setSearch] = useState("");
  const { dateRange, customStart, customEnd } = useFilterStore();
  const dateParams = resolveDateParams(dateRange, customStart, customEnd);

  const { mutate: triggerAnalysis, variables: analyzingId } = useTriggerAIAnalysis();
  const handleAnalyze = (adsetId: string) => {
    triggerAnalysis(adsetId, { onSuccess: (r) => onAnalyzeSuccess?.(r) });
  };

  // Group adsets by campaign
  const filtered = search
    ? adsets.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.campaign_name?.toLowerCase().includes(search.toLowerCase())
      )
    : adsets;

  const grouped = filtered.reduce<Record<string, AdSet[]>>((acc, a) => {
    const key = a.campaign_name || "Không có chiến dịch";
    (acc[key] ??= []).push(a);
    return acc;
  }, {});

  if (isLoading && adsets.length === 0) {
    return (
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="p-4 border-b"><Skeleton className="h-9 w-64" /></div>
        <div className="divide-y">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3">
              {[...Array(6)].map((_, j) => <Skeleton key={j} className="h-4 w-24" />)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Tìm chiến dịch, nhóm quảng cáo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <span className="text-sm text-gray-500">
          {Object.keys(grouped).length} chiến dịch · {filtered.length} nhóm QC
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {COL_HEADERS.map(({ label, width }) => (
                <th
                  key={label}
                  className={cn(
                    "px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap",
                    width
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.keys(grouped).length === 0 ? (
              <tr>
                <td colSpan={COL_HEADERS.length} className="text-center py-16 text-gray-400 text-sm">
                  Không có dữ liệu
                </td>
              </tr>
            ) : (
              Object.entries(grouped).map(([campaignName, campAdsets]) => (
                <CampaignRow
                  key={campaignName}
                  campaignName={campaignName}
                  campaignStatus={campAdsets[0]?.campaign_status ?? "ACTIVE"}
                  adsets={campAdsets}
                  dateParams={dateParams}
                  onAnalyze={handleAnalyze}
                  analyzingId={analyzingId}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
