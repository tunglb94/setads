"use client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TrendingUp, TrendingDown, Minus, Brain, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { AIAnalysisResult } from "@/services/api";

interface Props {
  result: AIAnalysisResult | null;
  adsetName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DECISION_CONFIG = {
  PAUSE: {
    label: "PAUSE AdSet",
    icon: TrendingDown,
    badgeClass: "bg-red-100 text-red-700 border-red-200",
    bgClass: "bg-red-50 border-red-200",
  },
  SCALE: {
    label: "SCALE Budget",
    icon: TrendingUp,
    badgeClass: "bg-green-100 text-green-700 border-green-200",
    bgClass: "bg-green-50 border-green-200",
  },
  KEEP: {
    label: "GIỮ NGUYÊN",
    icon: Minus,
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
    bgClass: "bg-blue-50 border-blue-200",
  },
  CREATIVE_REFRESH: {
    label: "ĐỔI CREATIVE",
    icon: Brain,
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    bgClass: "bg-amber-50 border-amber-200",
  },
} as const;

function ConfidenceMeter({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Độ tự tin</span>
        <span className="font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function AIAnalysisSheet({ result, adsetName, open, onOpenChange }: Props) {
  if (!result) return null;

  const cfg = DECISION_CONFIG[result.decision] ?? DECISION_CONFIG.KEEP;
  const Icon = cfg.icon;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-600" />
            <SheetTitle>Kết quả phân tích AI</SheetTitle>
          </div>
          {adsetName && (
            <SheetDescription className="truncate font-medium text-foreground/80">
              {adsetName}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="space-y-5">
          {/* Decision banner */}
          <div className={cn("rounded-xl border p-4 flex items-center gap-3", cfg.bgClass)}>
            <Icon className="h-8 w-8 shrink-0 opacity-70" />
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Quyết định
              </p>
              <Badge variant="outline" className={cn("mt-1 text-sm font-bold", cfg.badgeClass)}>
                {cfg.label}
              </Badge>
            </div>
          </div>

          {/* Confidence */}
          <ConfidenceMeter confidence={result.confidence} />

          <Separator />

          {/* Reasoning */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Lý do AI đưa ra</p>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {result.reasoning || "Không có lý do chi tiết"}
            </p>
          </div>

          {/* Recommended action */}
          {result.recommended_action && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm font-semibold">Hành động đề xuất</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {result.recommended_action}
                </p>
              </div>
            </>
          )}

          {/* Scale factor */}
          {result.decision === "SCALE" && result.scale_factor && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
              <p className="text-xs text-green-600 font-medium">Hệ số scale đề xuất</p>
              <p className="text-2xl font-bold text-green-700 tabular-nums mt-1">
                ×{result.scale_factor.toFixed(1)}
              </p>
            </div>
          )}

          {/* Raw details (collapsible) */}
          <Separator />
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none font-medium text-foreground/60 hover:text-foreground/80 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Raw output từ model
            </summary>
            <pre className="mt-2 p-3 bg-muted rounded-lg overflow-x-auto text-[10px] leading-relaxed">
              {JSON.stringify(result.raw, null, 2)}
            </pre>
          </details>
        </div>
      </SheetContent>
    </Sheet>
  );
}
