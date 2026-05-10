// @ts-nocheck — legacy component, superseded by AIAnalysisSheet
"use client";
import { X, Brain, TrendingUp, TrendingDown, Minus } from "lucide-react";
import clsx from "clsx";
import { AIAnalysisResult } from "@/services/api";

interface Props {
  result: AIAnalysisResult;
  onClose: () => void;
}

type DecisionCfg = { bg: string; badge: string; icon: string; label: string };
const decisionConfig: Record<string, DecisionCfg> = {
  PAUSE:            { bg: "bg-red-50 border-red-200",    badge: "bg-red-600 text-white",    icon: "🔴", label: "TẮT QUẢNG CÁO" },
  SCALE:            { bg: "bg-green-50 border-green-200", badge: "bg-green-600 text-white",  icon: "🟢", label: "TĂNG NGÂN SÁCH" },
  KEEP:             { bg: "bg-blue-50 border-blue-200",   badge: "bg-blue-600 text-white",   icon: "🔵", label: "GIỮ NGUYÊN" },
  CREATIVE_REFRESH: { bg: "bg-amber-50 border-amber-200", badge: "bg-amber-600 text-white",  icon: "🎨", label: "ĐỔI CREATIVE" },
};

export default function AIResultModal({ result, onClose }: Props) {
  const cfg = decisionConfig[result.decision] ?? decisionConfig.KEEP;
  const km = result.raw?.key_metrics as Record<string, string | number> | undefined;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={clsx("bg-white rounded-2xl shadow-2xl w-full max-w-lg border-2", cfg.bg)}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 rounded-lg">
              <Brain className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">AI Analysis Result</h2>
              <p className="text-xs text-gray-400">AdSet: {result.adset_id}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Decision */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{cfg.icon}</span>
              <div>
                <div className="text-sm text-gray-500">Quyết định</div>
                <span className={clsx("px-3 py-1 rounded-full text-sm font-bold", cfg.badge)}>
                  {cfg.label}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Độ tin cậy</div>
              <div className="text-2xl font-bold text-gray-900">
                {(result.confidence * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Key metrics */}
          {km && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "CPA TB", value: km.avg_cpa ? `${Number(km.avg_cpa).toLocaleString("vi-VN")}₫` : "—" },
                { label: "ROAS TB", value: km.avg_roas ? `${Number(km.avg_roas).toFixed(2)}x` : "—" },
                { label: "CTR Trend", value: String(km.ctr_trend || "—") },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="font-semibold text-gray-800 text-sm mt-0.5">{value}</div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Phân tích chi tiết</div>
            <p className="text-sm text-gray-700 leading-relaxed">{result.reasoning}</p>
          </div>

          {/* Recommended action */}
          {result.raw?.recommended_action && (
            <div className="mt-3 p-3 bg-violet-50 rounded-xl border border-violet-100">
              <div className="text-xs font-semibold text-violet-500 mb-1">💡 Gợi ý hành động</div>
              <p className="text-sm text-violet-800">{result.raw.recommended_action as string}</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
