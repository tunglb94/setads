"use client";
import { CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAutomationLogs } from "@/hooks/queries/useAutomationLogs";

const SOURCE_LABEL: Record<string, string> = {
  RULE: "📏 Rule",
  AI: "🤖 AI",
  ANOMALY: "⚠️ Anomaly",
  MANUAL: "👤 Manual",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "SUCCESS") return <CheckCircle className="w-4 h-4 text-green-500" />;
  if (status === "FAILED") return <XCircle className="w-4 h-4 text-red-500" />;
  return <Clock className="w-4 h-4 text-gray-400" />;
}

function DecisionBadge({ decision }: { decision: string }) {
  if (!decision) return null;
  const cls =
    decision === "PAUSE" ? "bg-red-100 text-red-700 border-red-200" :
    decision === "SCALE" ? "bg-green-100 text-green-700 border-green-200" :
    "bg-blue-100 text-blue-700 border-blue-200";
  return <Badge variant="outline" className={cls}>{decision}</Badge>;
}

export default function LogsPage() {
  const { data, isLoading, isFetching, refetch } = useAutomationLogs();
  const logs = data?.results ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Automation Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data?.count ?? 0} records · cập nhật mỗi 2 phút
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["AdSet", "Trigger", "Action", "AI Decision", "Metrics", "Status", "Thời gian"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    Chưa có automation log nào
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 max-w-[180px] truncate">{log.adset_name}</div>
                      <div className="text-xs text-gray-400 font-mono">{log.adset_id}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{SOURCE_LABEL[log.trigger_source] ?? log.trigger_source}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs font-mono">
                        {log.action_taken}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <DecisionBadge decision={log.ai_decision} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                      {log.metric_snapshot?.avg_cpa != null && (
                        <div>CPA: {Number(log.metric_snapshot.avg_cpa).toLocaleString("vi-VN")}₫</div>
                      )}
                      {log.metric_snapshot?.avg_roas != null && (
                        <div>ROAS: {Number(log.metric_snapshot.avg_roas || 0).toFixed(2)}x</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusIcon status={log.status} />
                        <span className="text-xs text-gray-600">{log.status}</span>
                      </div>
                      {log.error_message && (
                        <p className="text-xs text-red-500 mt-0.5 max-w-[120px] truncate" title={log.error_message}>
                          {log.error_message}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("vi-VN")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
