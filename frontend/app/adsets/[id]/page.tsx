"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Brain, BarChart2, RefreshCw, Zap, Eye, MousePointerClick,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAdSetDetail } from "@/hooks/queries/useAdSetDetail";
import { useTriggerAIAnalysis } from "@/hooks/queries/useAdSets";
import { useAdSetAds, useAnalyzeAds, useToggleAd, AdAIResult } from "@/hooks/queries/useAdSetAds";
import AIAnalysisSheet from "@/components/AIAnalysisSheet";
import SpendChart from "@/components/SpendChart";
import { AIAnalysisResult } from "@/services/api";
import { toast } from "sonner";

// ── Formatters ─────────────────────────────────────────────────────────────────
const num = (v: unknown) => (v == null ? 0 : Number(v));
const vnd = (v: unknown) =>
  num(v) > 0
    ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(num(v))
    : "—";
const vndC = (v: unknown) =>
  num(v) > 0
    ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0, notation: "compact" }).format(num(v))
    : "—";
const pct = (v: unknown) => (num(v) > 0 ? `${num(v).toFixed(2)}%` : "—");
const ratio = (v: unknown) => (num(v) > 0 ? `${num(v).toFixed(2)}x` : "—");

// ── AI Decision styles ─────────────────────────────────────────────────────────
const AI_STYLE: Record<string, string> = {
  PAUSE:            "bg-red-50 border-red-200 text-red-800",
  SCALE:            "bg-green-50 border-green-200 text-green-800",
  KEEP:             "bg-blue-50 border-blue-200 text-blue-800",
  CREATIVE_REFRESH: "bg-amber-50 border-amber-200 text-amber-800",
};
const AD_DECISION_CLS: Record<string, string> = {
  PAUSE: "bg-red-100 text-red-700 border-red-200",
  SCALE: "bg-green-100 text-green-700 border-green-200",
  KEEP:  "bg-blue-100 text-blue-700 border-blue-200",
};

// ── Metric card ────────────────────────────────────────────────────────────────
function Metric({ label, value, warn, good }: { label: string; value: string; warn?: boolean; good?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={cn("text-xl font-bold mt-1 tabular-nums",
        warn ? "text-red-600" : good ? "text-green-600" : "text-gray-900"
      )}>
        {value}
      </p>
    </div>
  );
}

// ── Ad AI result panel ─────────────────────────────────────────────────────────
function AdAIPanel({ result }: { result: AdAIResult }) {
  return (
    <div className="space-y-3">
      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Brain className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-violet-800 mb-1">Tổng quan AI</p>
            <p className="text-sm text-violet-700">{result.summary}</p>
            <p className="text-xs text-violet-600 mt-2 font-medium">{result.overall_recommendation}</p>
          </div>
        </div>
      </div>

      {result.ads.sort((a, b) => a.priority - b.priority).map((ad) => (
        <div
          key={ad.ad_id}
          className={cn(
            "rounded-xl border p-4",
            ad.ad_id === result.worst_ad_id ? "border-red-200 bg-red-50" :
            ad.ad_id === result.best_ad_id  ? "border-green-200 bg-green-50" :
            "border-gray-200 bg-white"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-900 truncate">{ad.ad_name}</p>
                {ad.ad_id === result.best_ad_id && (
                  <span className="text-[10px] bg-green-600 text-white px-1.5 py-0.5 rounded font-bold">BEST</span>
                )}
                {ad.ad_id === result.worst_ad_id && (
                  <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold">WORST</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{ad.cpa_vs_target}</p>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">{ad.reasoning}</p>
            </div>
            <div className="shrink-0 text-right">
              <Badge variant="outline" className={cn("text-xs", AD_DECISION_CLS[ad.decision])}>
                {ad.decision}
              </Badge>
              <p className="text-[10px] text-gray-400 mt-1">{Math.round(ad.confidence * 100)}%</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AdSetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [days, setDays] = useState(7);
  const [adSetAiResult, setAdSetAiResult] = useState<AIAnalysisResult | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [adAiResult, setAdAiResult] = useState<AdAIResult | null>(null);

  const { data: adset, isLoading, refetch } = useAdSetDetail(id);
  const { data: ads, isLoading: adsLoading, refetch: refetchAds } = useAdSetAds(id, days);
  const { mutate: triggerAdSetAI, isPending: analyzingAdSet } = useTriggerAIAnalysis();
  const { mutate: analyzeAds, isPending: analyzingAds } = useAnalyzeAds(id);
  const { mutate: toggleAd, variables: togglingAdId } = useToggleAd(id);

  const handleAdSetAnalyze = () => {
    triggerAdSetAI(id, {
      onSuccess: (result) => { setAdSetAiResult(result); setSheetOpen(true); refetch(); },
    });
  };

  const handleAdsAnalyze = () => {
    analyzeAds(undefined, {
      onSuccess: (result) => {
        setAdAiResult(result);
        toast.success("Phân tích ads hoàn tất");
      },
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4 p-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!adset) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <p className="text-lg font-medium">Không tìm thấy AdSet</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Quay lại
        </Button>
      </div>
    );
  }

  const ins = adset.latest_insight;
  const chartData = (adset.insights ?? []).slice(0, days).reverse();

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">{adset.name}</h1>
          <p className="text-sm text-gray-500">{adset.campaign_name} · {adset.account_name}</p>
        </div>
        <Badge variant={adset.status === "ACTIVE" ? "default" : "secondary"}>{adset.status}</Badge>
        <Button
          variant="outline" size="sm"
          className="gap-2 text-violet-700 border-violet-200 hover:bg-violet-50"
          onClick={handleAdSetAnalyze}
          disabled={analyzingAdSet}
        >
          {analyzingAdSet
            ? <span className="h-3.5 w-3.5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
            : <Brain className="h-3.5 w-3.5" />}
          {analyzingAdSet ? "Đang phân tích..." : "Phân tích AdSet"}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => { refetch(); refetchAds(); }}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* AdSet metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Chi tiêu" value={vnd(ins?.spend)} />
        <Metric label="CPA / lead" value={vnd(ins?.cpa)} warn={num(ins?.cpa) > 500_000} />
        <Metric label="ROAS" value={ratio(ins?.roas)} good={num(ins?.roas) >= 2} />
        <Metric label="CTR" value={pct(ins?.ctr)} />
        <Metric label="Impressions" value={num(ins?.impressions) > 0 ? num(ins?.impressions).toLocaleString("vi-VN") : "—"} />
        <Metric label="Clicks" value={num(ins?.clicks) > 0 ? num(ins?.clicks).toLocaleString("vi-VN") : "—"} />
        <Metric label="Chuyển đổi" value={num(ins?.conversions) > 0 ? String(num(ins?.conversions)) : "—"} good={num(ins?.conversions) > 0} />
        <Metric label="Frequency" value={num(ins?.frequency) > 0 ? num(ins?.frequency).toFixed(2) : "—"} warn={num(ins?.frequency) > 3} />
      </div>

      {/* AdSet AI Decision */}
      {adset.ai_decision && (
        <div className={cn("rounded-xl border p-4", AI_STYLE[adset.ai_decision] ?? "bg-gray-50 border-gray-200")}>
          <div className="flex items-start gap-3">
            <Brain className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-sm font-semibold">Quyết định AdSet: {adset.ai_decision}</span>
                {adset.ai_confidence != null && (
                  <span className="text-xs opacity-60">({Math.round(num(adset.ai_confidence) * 100)}% tin cậy)</span>
                )}
                {adset.ai_analyzed_at && (
                  <span className="text-xs opacity-50 ml-auto">
                    {new Date(adset.ai_analyzed_at).toLocaleString("vi-VN")}
                  </span>
                )}
              </div>
              <p className="text-sm opacity-80 leading-relaxed">{adset.ai_reasoning}</p>
            </div>
          </div>
        </div>
      )}

      {/* Spend chart */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-gray-400" />
            <span className="font-semibold text-gray-700 text-sm">Xu hướng hiệu suất</span>
          </div>
          <div className="flex gap-1">
            {[7, 14].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                  days === d ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <SpendChart insights={chartData} />
      </div>

      {/* ── Ads Section ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Quảng cáo trong nhóm</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {ads?.length ?? 0} ads · {days} ngày · CPA = chi tiêu ÷ (comment + inbox)
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-2 text-violet-700 border-violet-200 hover:bg-violet-50"
            onClick={handleAdsAnalyze}
            disabled={analyzingAds || !ads?.length}
          >
            {analyzingAds
              ? <span className="h-3.5 w-3.5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
              : <Brain className="h-3.5 w-3.5" />}
            {analyzingAds ? "Đang phân tích..." : "AI phân tích Ads"}
          </Button>
        </div>

        {adsLoading ? (
          <div className="divide-y">{Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-5 py-3">
              {Array.from({ length: 7 }).map((_, j) => <Skeleton key={j} className="h-4 w-20" />)}
            </div>
          ))}</div>
        ) : !ads?.length ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            <p>Chưa có dữ liệu ad-level.</p>
            <p className="mt-1">Nhấn <strong>Đồng bộ Meta</strong> trên trang chủ để pull dữ liệu từ Meta API.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  {["Quảng cáo", "Trạng thái", "Chi tiêu", "Impressions", "Clicks", "CTR", "CPC", "Conv.", "CPA/lead", "ROAS", "Freq."].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ads.map((ad) => (
                  <tr
                    key={ad.ad_id}
                    className={cn(
                      "border-b border-gray-100 hover:bg-gray-50 transition-colors",
                      (adAiResult?.worst_ad_id === ad.ad_id || (!adAiResult && ad.ai_decision === "PAUSE")) && "bg-red-50/50",
                      (adAiResult?.best_ad_id === ad.ad_id || (!adAiResult && ad.ai_decision === "SCALE")) && "bg-green-50/50",
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <div className="min-w-[180px] max-w-[240px]">
                        <p className="font-medium text-gray-900 text-xs truncate" title={ad.ad_name}>{ad.ad_name}</p>
                        <p className="text-[10px] text-gray-400 font-mono">{ad.ad_id}</p>
                        {(() => {
                          const dec = adAiResult?.ads.find(a => a.ad_id === ad.ad_id)?.decision ?? ad.ai_decision;
                          return dec ? (
                            <Badge variant="outline" className={cn("text-[10px] mt-0.5", AD_DECISION_CLS[dec])}>
                              AI: {dec}
                            </Badge>
                          ) : null;
                        })()}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Switch
                        checked={ad.status === "ACTIVE"}
                        disabled={togglingAdId === ad.ad_id}
                        onCheckedChange={() => toggleAd(ad.ad_id)}
                        className="scale-75"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs font-semibold">{vndC(ad.spend)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <Eye className="h-3 w-3 text-gray-400" />
                        {ad.impressions > 0 ? ad.impressions.toLocaleString("vi-VN") : "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <MousePointerClick className="h-3 w-3 text-gray-400" />
                        {ad.clicks > 0 ? ad.clicks.toLocaleString("vi-VN") : "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs tabular-nums">{pct(ad.ctr)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-mono tabular-nums">{vnd(ad.cpc)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn("text-sm font-bold tabular-nums", ad.conversions > 0 ? "text-green-600" : "text-gray-300")}>
                        {ad.conversions > 0 ? ad.conversions : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("text-xs font-mono tabular-nums font-semibold", num(ad.cpa) > 500_000 ? "text-red-600" : num(ad.cpa) > 0 ? "text-gray-800" : "text-gray-400")}>
                        {vnd(ad.cpa)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("text-xs tabular-nums font-semibold", num(ad.roas) >= 2 ? "text-green-600" : num(ad.roas) > 0 ? "text-orange-500" : "text-gray-300")}>
                        {ratio(ad.roas)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("text-xs tabular-nums", num(ad.frequency) > 3 ? "text-orange-500 font-semibold" : "text-gray-500")}>
                        {num(ad.frequency) > 0 ? num(ad.frequency).toFixed(2) : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI Ads Analysis Result */}
      {adAiResult && (
        <div className="space-y-2">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-600" />
            Kết quả AI phân tích từng Ad
          </h3>
          <AdAIPanel result={adAiResult} />
        </div>
      )}

      {/* AdSet AI Sheet */}
      <AIAnalysisSheet
        result={adSetAiResult}
        adsetName={adset.name}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
