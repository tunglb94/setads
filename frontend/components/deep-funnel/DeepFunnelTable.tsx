"use client";
import { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Phone, Calendar, TrendingUp, TrendingDown, Minus,
  Brain, ChevronUp, ChevronDown, ChevronsUpDown, MessageSquare,
  AlertTriangle, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeepFunnelMetrics } from "@/types/deepFunnel";

// ── Formatting helpers ─────────────────────────────────────────────────────────
const vnd = (n: number) =>
  n === 0
    ? <span className="text-gray-300 text-xs">—</span>
    : <span>{new Intl.NumberFormat("vi-VN").format(n)}₫</span>;

const fmtNum = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

// ── CPL color badge ────────────────────────────────────────────────────────────
// Thresholds xác nhận thực tế: ~1tr3/SĐT hiện tại, mục tiêu ≤1tr
function CplBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-gray-300 text-xs font-mono">—</span>;
  const [cls, label] =
    value <= 1_000_000
      ? ["bg-emerald-100 text-emerald-800 border-emerald-200", "Tốt"]
      : value <= 2_000_000
      ? ["bg-amber-100 text-amber-800 border-amber-200", "Chấp nhận"]
      : value <= 3_000_000
      ? ["bg-orange-100 text-orange-800 border-orange-200", "Khá cao"]
      : ["bg-red-100 text-red-800 border-red-200", "Đắt"];
  return (
    <div className="space-y-0.5">
      <p className={cn("text-xs font-bold tabular-nums px-2 py-0.5 rounded-full border inline-block", cls)}>
        {fmtNum(value)}₫
      </p>
      <p className="text-[10px] text-gray-400">{label}</p>
    </div>
  );
}

// ── AI Decision badge ──────────────────────────────────────────────────────────
function DecisionBadge({ decision }: { decision: string }) {
  if (!decision) return <span className="text-gray-300 text-xs">—</span>;
  const cfg: Record<string, { cls: string; icon: typeof TrendingUp; label: string }> = {
    SCALE: { cls: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: TrendingUp,   label: "SCALE" },
    KEEP:  { cls: "bg-sky-100 text-sky-800 border-sky-200",             icon: Minus,        label: "KEEP"  },
    PAUSE: { cls: "bg-red-100 text-red-800 border-red-200",             icon: TrendingDown, label: "PAUSE" },
  };
  const c = cfg[decision] ?? cfg.KEEP;
  const Icon = c.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border", c.cls)}>
      <Icon className="h-3 w-3" />{c.label}
    </span>
  );
}

// ── Sort icon ──────────────────────────────────────────────────────────────────
function SortIcon({ state }: { state: false | "asc" | "desc" }) {
  if (state === "asc")  return <ChevronUp className="h-3 w-3 ml-1 inline text-violet-500" />;
  if (state === "desc") return <ChevronDown className="h-3 w-3 ml-1 inline text-violet-500" />;
  return <ChevronsUpDown className="h-3 w-3 ml-1 inline text-gray-300" />;
}

// ── Column definitions ─────────────────────────────────────────────────────────
const col = createColumnHelper<DeepFunnelMetrics>();

const COLUMNS = [
  col.accessor("ad_name", {
    header: "Quảng cáo",
    cell: (info) => {
      const row = info.row.original;
      return (
        <div className="min-w-[160px] max-w-[220px]">
          <p className="font-semibold text-gray-900 text-sm truncate" title={row.ad_name}>{row.ad_name}</p>
          <p className="text-[10px] text-gray-400 truncate">{row.adset_name}</p>
        </div>
      );
    },
  }),

  col.accessor("total_spend", {
    header: "Chi tiêu 7 ngày",
    cell: (info) => (
      <div>
        <p className="font-semibold tabular-nums text-gray-800">{vnd(info.getValue())}</p>
        <p className="text-[10px] text-gray-400">{fmtNum(info.row.original.total_impressions)} lượt hiển thị</p>
      </div>
    ),
  }),

  col.display({
    id: "funnel_msgs",
    header: "📩 Inbox | 💬 Comment",
    cell: ({ row }) => {
      const { total_inbox, total_comments, total_conversations, qualified_leads, appointment_count, spam_count, spam_rate, scored_count, cost_per_message, qualified_rate } = row.original;
      const inbox = total_inbox ?? total_conversations ?? 0;
      const comments = total_comments ?? 0;
      const spamHigh = spam_rate > 30;
      const cpmCls =
        cost_per_message === 0 ? "" :
        cost_per_message <= 500_000 ? "text-emerald-600" :
        cost_per_message <= 600_000 ? "text-amber-600" :
        cost_per_message <= 700_000 ? "text-orange-600" :
        "text-red-600";
      return (
        <div className="min-w-[200px] space-y-1">
          {/* Row 1: 📩 Inbox | 💬 Comment → 📞 SĐT → 📅 Lịch */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="flex items-center gap-0.5 bg-violet-100 text-violet-800 text-xs font-bold px-1.5 py-0.5 rounded">
              📩{inbox}
            </span>
            <span className="text-gray-300 text-xs">|</span>
            <span className="flex items-center gap-0.5 bg-blue-100 text-blue-800 text-xs font-bold px-1.5 py-0.5 rounded">
              💬{comments}
            </span>
            <span className="text-gray-300 text-xs">➡️</span>
            <span className="flex items-center gap-0.5 bg-green-100 text-green-800 text-xs font-bold px-1.5 py-0.5 rounded">
              <Phone className="h-3 w-3" />{qualified_leads}
            </span>
            <span className="text-gray-300 text-xs">➡️</span>
            <span className="flex items-center gap-0.5 bg-purple-100 text-purple-800 text-xs font-bold px-1.5 py-0.5 rounded">
              <Calendar className="h-3 w-3" />{appointment_count}
            </span>
          </div>
          {/* Row 2: CPL inbox + tỷ lệ SĐT */}
          <div className="flex items-center gap-2">
            {cost_per_message > 0 && (
              <p className={cn("text-[10px] font-semibold tabular-nums", cpmCls)}>
                {fmtNum(cost_per_message)}₫/inbox
              </p>
            )}
            {qualified_rate > 0 && (
              <p className="text-[10px] text-gray-400">{qualified_rate.toFixed(0)}% có SĐT</p>
            )}
          </div>
          {/* Row 3: Spam warning */}
          {scored_count > 0 && (
            <div className={cn("flex items-center gap-1 text-[10px]", spamHigh ? "text-red-600 font-semibold" : "text-gray-400")}>
              {spamHigh && <AlertTriangle className="h-3 w-3" />}
              Spam: {spam_rate.toFixed(0)}%
            </div>
          )}
        </div>
      );
    },
  }),

  col.accessor("cost_per_qualified_lead", {
    header: "True CPL (SĐT)",
    cell: (info) => <CplBadge value={info.getValue()} />,
    sortingFn: "basic",
  }),

  col.accessor("cost_per_hot_lead", {
    header: "Cost / HOT",
    cell: (info) => {
      const v = info.getValue();
      return v === 0
        ? <span className="text-gray-300 text-xs">—</span>
        : <p className="text-sm tabular-nums text-gray-700">{fmtNum(v)}₫</p>;
    },
    sortingFn: "basic",
  }),

  col.accessor("ai_decision", {
    header: "AI Decision",
    cell: (info) => <DecisionBadge decision={info.getValue()} />,
  }),

  col.display({
    id: "reasoning",
    header: "Lý do AI",
    cell: ({ row }) => {
      const { ai_reasoning, ai_confidence, ai_analyzed_at } = row.original;
      if (!ai_reasoning) return <span className="text-gray-300 text-xs">Chưa phân tích</span>;
      const confidence = ai_confidence != null ? `${Math.round(ai_confidence * 100)}%` : "";
      const analyzedAt = ai_analyzed_at
        ? new Date(ai_analyzed_at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "";
      return (
        <Dialog>
          <DialogTrigger
            render={
              <Button variant="ghost" size="sm" className="text-xs text-violet-600 hover:text-violet-700 px-2 h-7" />
            }
          >
            Xem lý do
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-violet-600" />
                AI Reasoning — {row.original.ad_name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="flex gap-2">
                <DecisionBadge decision={row.original.ai_decision} />
                {confidence && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {confidence} tin cậy
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3 border">
                {ai_reasoning}
              </p>
              {analyzedAt && (
                <p className="text-[10px] text-gray-400">Phân tích lúc: {analyzedAt}</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      );
    },
  }),
];

// ── Skeleton rows ──────────────────────────────────────────────────────────────
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i} className="hover:bg-transparent">
          <TableCell><Skeleton className="h-9 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-8 w-28" /></TableCell>
          <TableCell><Skeleton className="h-8 w-32" /></TableCell>
          <TableCell><Skeleton className="h-8 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-7 w-20 rounded" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={8}>
        <div className="py-20 text-center space-y-3">
          <Brain className="h-12 w-12 mx-auto text-gray-200" />
          <p className="text-gray-500 font-medium">Chưa có dữ liệu Deep Funnel</p>
          <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
            AI cần đọc và phân loại các hội thoại Messenger trước. Nhấn nút
            <span className="font-semibold text-violet-600"> "Chấm điểm AI (Score All)"</span> để bắt đầu.
          </p>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ── Main table component ───────────────────────────────────────────────────────
interface DeepFunnelTableProps {
  data: DeepFunnelMetrics[];
  isLoading: boolean;
  onAnalyze?: (ad: DeepFunnelMetrics) => void;
  analyzingAdId?: string;
}

export function DeepFunnelTable({ data, isLoading, onAnalyze, analyzingAdId }: DeepFunnelTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "total_spend", desc: true },
  ]);

  const actionColumn = col.display({
    id: "live_analyze",
    header: "",
    cell: ({ row }) => {
      const ad = row.original;
      const active = analyzingAdId === ad.ad_id;
      return (
        <Button
          size="sm"
          variant={active ? "default" : "outline"}
          className={cn(
            "h-7 px-2 text-xs gap-1",
            active
              ? "bg-violet-600 hover:bg-violet-700 text-white border-violet-600"
              : "border-violet-200 text-violet-600 hover:bg-violet-50"
          )}
          onClick={() => onAnalyze?.(ad)}
        >
          <Zap className={cn("h-3 w-3", active && "animate-pulse")} />
          {active ? "Đang xem" : "Live AI"}
        </Button>
      );
    },
  });

  const table = useReactTable({
    data,
    columns: onAnalyze ? [...COLUMNS, actionColumn] : COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id} className="bg-gray-50 hover:bg-gray-50">
            {hg.headers.map((header) => {
              const canSort = header.column.getCanSort();
              return (
                <TableHead
                  key={header.id}
                  className={cn(
                    "text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3",
                    canSort && "cursor-pointer select-none hover:text-gray-800 transition-colors"
                  )}
                  onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {canSort && (
                    <SortIcon state={header.column.getIsSorted()} />
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <SkeletonRows />
        ) : table.getRowModel().rows.length === 0 ? (
          <EmptyState />
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn(
                "transition-colors",
                row.original.ai_decision === "PAUSE" && "bg-red-50/40 hover:bg-red-50/60",
                row.original.ai_decision === "SCALE" && "bg-emerald-50/40 hover:bg-emerald-50/60",
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="px-4 py-3">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
