"use client";
import { useState } from "react";
import { Brain, Play, Pause, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { AdSet } from "@/services/api";

interface Props {
  adsets: AdSet[];
  onToggle: (adsetId: string) => Promise<void>;
  onAnalyze: (adsetId: string) => Promise<void>;
  analyzing: string | null;
}

const DecisionBadge = ({ decision }: { decision: string }) => {
  const cfg = {
    PAUSE: { bg: "bg-red-100 text-red-700", label: "PAUSE" },
    SCALE: { bg: "bg-green-100 text-green-700", label: "SCALE" },
    KEEP:  { bg: "bg-blue-100 text-blue-700",  label: "KEEP"  },
  }[decision] ?? { bg: "bg-gray-100 text-gray-500", label: "—" };

  return (
    <span className={clsx("px-2 py-0.5 rounded-full text-xs font-semibold", cfg.bg)}>
      {cfg.label}
    </span>
  );
};

const StatusBadge = ({ status }: { status: string }) => (
  <span
    className={clsx(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
      status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
    )}
  >
    <span className={clsx("w-1.5 h-1.5 rounded-full", status === "ACTIVE" ? "bg-emerald-500" : "bg-slate-400")} />
    {status}
  </span>
);

const TrendIcon = ({ values }: { values: number[] }) => {
  if (values.length < 2) return <Minus className="w-4 h-4 text-gray-400" />;
  const delta = values[values.length - 1] - values[0];
  if (delta > 0) return <TrendingUp className="w-4 h-4 text-red-500" />;
  if (delta < 0) return <TrendingDown className="w-4 h-4 text-green-500" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
};

function fmt(n: number | null | undefined, currency = false): string {
  if (n == null || n === 0) return "—";
  if (currency) return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

export default function AdSetTable({ adsets, onToggle, onAnalyze, analyzing }: Props) {
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [tooltipAdset, setTooltipAdset] = useState<string | null>(null);

  const handleToggle = async (adsetId: string) => {
    setToggleLoading(adsetId);
    try {
      await onToggle(adsetId);
    } finally {
      setToggleLoading(null);
    }
  };

  if (adsets.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No AdSets found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {["AdSet", "Status", "Spend", "CPA", "ROAS", "CTR", "AI Decision", "Actions"].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {adsets.map((adset) => {
            const ins = adset.latest_insight;
            const isAnalyzing = analyzing === adset.adset_id;
            const isToggling = toggleLoading === adset.adset_id;

            return (
              <tr
                key={adset.adset_id}
                className={clsx(
                  "hover:bg-gray-50 transition-colors",
                  adset.auto_paused && "bg-red-50/40"
                )}
              >
                {/* AdSet name */}
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 max-w-[220px] truncate" title={adset.name}>
                    {adset.name}
                  </div>
                  <div className="text-xs text-gray-400 truncate">{adset.campaign_name}</div>
                  {adset.auto_paused && (
                    <span className="text-xs text-red-500 font-medium">⚡ Auto-paused</span>
                  )}
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <StatusBadge status={adset.status} />
                </td>

                {/* Spend */}
                <td className="px-4 py-3 font-mono text-right">
                  {ins ? fmt(ins.spend, true) : "—"}
                </td>

                {/* CPA */}
                <td className="px-4 py-3 font-mono text-right">
                  <span className={clsx(ins && ins.cpa > 50000 ? "text-red-600 font-semibold" : "text-gray-700")}>
                    {ins ? fmt(ins.cpa, true) : "—"}
                  </span>
                </td>

                {/* ROAS */}
                <td className="px-4 py-3 font-mono text-right">
                  <span className={clsx(ins && ins.roas >= 2 ? "text-green-600 font-semibold" : ins && ins.roas > 0 ? "text-orange-500" : "text-gray-400")}>
                    {ins && ins.roas > 0 ? `${ins.roas.toFixed(2)}x` : "—"}
                  </span>
                </td>

                {/* CTR */}
                <td className="px-4 py-3 font-mono text-right text-gray-600">
                  {ins ? `${ins.ctr.toFixed(2)}%` : "—"}
                </td>

                {/* AI Decision */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <DecisionBadge decision={adset.ai_decision} />
                    {adset.ai_reasoning && (
                      <div
                        className="text-xs text-gray-400 max-w-[200px] truncate cursor-pointer hover:text-gray-600"
                        title={adset.ai_reasoning}
                        onMouseEnter={() => setTooltipAdset(adset.adset_id)}
                        onMouseLeave={() => setTooltipAdset(null)}
                      >
                        {adset.ai_reasoning}
                      </div>
                    )}
                  </div>
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {/* Toggle status */}
                    <button
                      onClick={() => handleToggle(adset.adset_id)}
                      disabled={isToggling}
                      className={clsx(
                        "p-1.5 rounded-lg transition-colors",
                        adset.status === "ACTIVE"
                          ? "bg-orange-100 hover:bg-orange-200 text-orange-600"
                          : "bg-green-100 hover:bg-green-200 text-green-600",
                        isToggling && "opacity-50 cursor-not-allowed"
                      )}
                      title={adset.status === "ACTIVE" ? "Pause AdSet" : "Activate AdSet"}
                    >
                      {isToggling ? (
                        <span className="w-4 h-4 block border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : adset.status === "ACTIVE" ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>

                    {/* AI Analyze */}
                    <button
                      onClick={() => onAnalyze(adset.adset_id)}
                      disabled={isAnalyzing}
                      className={clsx(
                        "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        "bg-violet-100 hover:bg-violet-200 text-violet-700",
                        isAnalyzing && "opacity-50 cursor-not-allowed"
                      )}
                      title="Run AI Analysis Now"
                    >
                      {isAnalyzing ? (
                        <span className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Brain className="w-3.5 h-3.5" />
                      )}
                      {isAnalyzing ? "Analyzing..." : "Analyze"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
