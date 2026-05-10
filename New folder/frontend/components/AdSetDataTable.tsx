"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain, ArrowUpDown, ArrowUp, ArrowDown,
  ChevronLeft, ChevronRight, Search, ExternalLink, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdSet } from "@/services/api";
import { useToggleAdSet, useTriggerAIAnalysis } from "@/hooks/queries/useAdSets";

// ── Formatters ────────────────────────────────────────────────────────────────

const n = (v: unknown) => (v == null ? 0 : Number(v));

const vnd = (v: unknown) =>
  n(v) > 0
    ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n(v))
    : "—";

const vndCompact = (v: unknown) =>
  n(v) > 0
    ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0, notation: "compact" }).format(n(v))
    : "—";

const pct = (v: unknown) => (n(v) > 0 ? `${n(v).toFixed(2)}%` : "—");
const ratio = (v: unknown) => (n(v) > 0 ? `${n(v).toFixed(2)}x` : "—");
const num = (v: unknown) => (n(v) > 0 ? n(v).toLocaleString("vi-VN") : "—");

// ── AI Decision badge ─────────────────────────────────────────────────────────

const AI_CFG: Record<string, { label: string; cls: string }> = {
  PAUSE:            { label: "PAUSE",   cls: "bg-red-100 text-red-700 border-red-200" },
  SCALE:            { label: "SCALE",   cls: "bg-green-100 text-green-700 border-green-200" },
  KEEP:             { label: "KEEP",    cls: "bg-blue-100 text-blue-700 border-blue-200" },
  CREATIVE_REFRESH: { label: "REFRESH", cls: "bg-amber-100 text-amber-700 border-amber-200" },
};

function AIBadge({ decision, confidence, analyzedAt }: {
  decision: string; confidence: number | null; analyzedAt: string | null;
}) {
  const cfg = AI_CFG[decision];
  if (!cfg) return <span className="text-gray-300 text-xs">Chưa phân tích</span>;
  return (
    <div className="space-y-1">
      <Badge variant="outline" className={cn("text-xs font-semibold", cfg.cls)}>{cfg.label}</Badge>
      {confidence != null && (
        <div className="text-[10px] text-gray-400">{Math.round(n(confidence) * 100)}% tin cậy</div>
      )}
      {analyzedAt && (
        <div className="text-[10px] text-gray-400">
          {new Date(analyzedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}
        </div>
      )}
    </div>
  );
}

function SortBtn({ label, column }: { label: string; column: any }) {
  const sorted = column.getIsSorted();
  return (
    <button
      className="flex items-center gap-0.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {label}
      {!sorted && <ArrowUpDown className="h-3 w-3 text-gray-400" />}
      {sorted === "asc" && <ArrowUp className="h-3 w-3" />}
      {sorted === "desc" && <ArrowDown className="h-3 w-3" />}
    </button>
  );
}

// ── Column definitions ────────────────────────────────────────────────────────

function buildColumns(
  analyzingId: string | null,
  onAnalyze: (id: string) => void,
  onDetail: (id: string) => void,
): ColumnDef<AdSet>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: "AdSet",
      enableSorting: false,
      cell: ({ row }) => {
        const a = row.original;
        return (
          <div className="min-w-[200px] max-w-[260px]">
            <p className="font-semibold text-sm text-gray-900 truncate" title={a.name}>{a.name}</p>
            <p className="text-xs text-gray-500 truncate">{a.campaign_name}</p>
            <p className="text-[11px] text-gray-400 truncate">{a.account_name}</p>
            {a.auto_paused && (
              <span className="text-[10px] text-red-500 font-medium flex items-center gap-0.5 mt-0.5">
                <AlertTriangle className="h-2.5 w-2.5" /> Auto-paused
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Trạng thái",
      enableSorting: false,
      cell: ({ row }) => {
        const { mutate: toggle, isPending } = useToggleAdSet();
        const a = row.original;
        return (
          <div className="flex flex-col items-center gap-1">
            <Switch
              checked={a.status === "ACTIVE"}
              disabled={isPending}
              onCheckedChange={() => toggle(a.adset_id)}
            />
            <span className={cn("text-[10px] font-medium", a.status === "ACTIVE" ? "text-green-600" : "text-gray-400")}>
              {a.status}
            </span>
          </div>
        );
      },
    },
    {
      id: "daily_budget",
      accessorFn: (r) => n(r.daily_budget),
      header: "Ngân sách/ngày",
      cell: ({ getValue }) => (
        <span className="text-xs font-mono tabular-nums text-gray-600">
          {vnd(getValue())}
        </span>
      ),
    },
    {
      id: "spend",
      accessorFn: (r) => n(r.latest_insight?.spend),
      header: ({ column }) => <SortBtn label="Chi tiêu" column={column} />,
      cell: ({ getValue }) => (
        <span className="text-sm font-mono tabular-nums font-semibold">{vndCompact(getValue())}</span>
      ),
    },
    {
      id: "impressions",
      accessorFn: (r) => n(r.latest_insight?.impressions),
      header: ({ column }) => <SortBtn label="Lượt hiển thị" column={column} />,
      cell: ({ getValue }) => (
        <span className="text-xs tabular-nums text-gray-700">{num(getValue())}</span>
      ),
    },
    {
      id: "clicks",
      accessorFn: (r) => n(r.latest_insight?.clicks),
      header: ({ column }) => <SortBtn label="Clicks" column={column} />,
      cell: ({ getValue }) => (
        <span className="text-xs tabular-nums text-gray-700">{num(getValue())}</span>
      ),
    },
    {
      id: "ctr",
      accessorFn: (r) => n(r.latest_insight?.ctr),
      header: ({ column }) => <SortBtn label="CTR" column={column} />,
      cell: ({ getValue }) => (
        <span className="text-xs tabular-nums text-gray-600">{pct(getValue())}</span>
      ),
    },
    {
      id: "cpc",
      accessorFn: (r) => n(r.latest_insight?.cpc),
      header: ({ column }) => <SortBtn label="CPC" column={column} />,
      cell: ({ getValue }) => (
        <span className="text-xs font-mono tabular-nums">{vnd(getValue())}</span>
      ),
    },
    {
      id: "conversions",
      accessorFn: (r) => n(r.latest_insight?.conversions),
      header: ({ column }) => <SortBtn label="Conv." column={column} />,
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return (
          <span className={cn("text-sm tabular-nums font-semibold", v > 0 ? "text-green-600" : "text-gray-400")}>
            {v > 0 ? v : "—"}
          </span>
        );
      },
    },
    {
      id: "cpa",
      accessorFn: (r) => n(r.latest_insight?.cpa),
      header: ({ column }) => <SortBtn label="CPA" column={column} />,
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return (
          <span className={cn("text-xs font-mono tabular-nums", v > 500_000 ? "text-red-600 font-bold" : "text-gray-700")}>
            {vnd(v)}
          </span>
        );
      },
    },
    {
      id: "roas",
      accessorFn: (r) => n(r.latest_insight?.roas),
      header: ({ column }) => <SortBtn label="ROAS" column={column} />,
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return (
          <span className={cn(
            "text-sm tabular-nums font-semibold",
            v >= 2 ? "text-green-600" : v > 0 ? "text-orange-500" : "text-gray-400"
          )}>
            {ratio(v)}
          </span>
        );
      },
    },
    {
      id: "frequency",
      accessorFn: (r) => n(r.latest_insight?.frequency),
      header: ({ column }) => <SortBtn label="Freq." column={column} />,
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return (
          <span className={cn("text-xs tabular-nums", v > 3 ? "text-orange-500 font-semibold" : "text-gray-600")}>
            {v > 0 ? n(v).toFixed(2) : "—"}
          </span>
        );
      },
    },
    {
      id: "ai_decision",
      accessorKey: "ai_decision",
      header: "AI Quyết định",
      enableSorting: false,
      cell: ({ row }) => {
        const a = row.original;
        return (
          <AIBadge
            decision={a.ai_decision}
            confidence={a.ai_confidence}
            analyzedAt={a.ai_analyzed_at}
          />
        );
      },
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const a = row.original;
        const isAnalyzing = analyzingId === a.adset_id;
        return (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-violet-700 border-violet-200 hover:bg-violet-50 h-7 px-2 text-xs"
              onClick={() => onAnalyze(a.adset_id)}
              disabled={isAnalyzing}
            >
              {isAnalyzing
                ? <span className="h-3 w-3 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                : <Brain className="h-3 w-3" />}
              {isAnalyzing ? "..." : "AI"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => onDetail(a.adset_id)}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        );
      },
    },
  ];
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  adsets: AdSet[];
  isLoading?: boolean;
  onAnalyzeSuccess?: (result: import("@/services/api").AIAnalysisResult) => void;
}

export default function AdSetDataTable({ adsets, isLoading, onAnalyzeSuccess }: Props) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([{ id: "spend", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

  const { mutate: triggerAnalysis, variables: analyzingId } = useTriggerAIAnalysis();

  const handleAnalyze = (adsetId: string) => {
    triggerAnalysis(adsetId, { onSuccess: (r) => onAnalyzeSuccess?.(r) });
  };

  const columns = useMemo(
    () => buildColumns(analyzingId ?? null, handleAnalyze, (id) => router.push(`/adsets/${id}`)),
    [analyzingId]
  );

  const table = useReactTable({
    data: adsets,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
  });

  if (isLoading && adsets.length === 0) {
    return (
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="p-4 border-b"><Skeleton className="h-9 w-64" /></div>
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3">
              {Array.from({ length: 6 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-24" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Tìm AdSet, campaign, tài khoản..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <span className="text-sm text-gray-500">
          {table.getFilteredRowModel().rows.length} / {adsets.length} adsets
        </span>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-gray-50 border-b">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-16 text-gray-400 text-sm">
                  Không tìm thấy AdSet nào
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-gray-100 hover:bg-gray-50 transition-colors",
                    row.original.auto_paused && "bg-red-50/40"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          Trang {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
          {" · "}{table.getFilteredRowModel().rows.length} records
        </span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
