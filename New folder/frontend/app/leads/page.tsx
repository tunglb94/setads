"use client";
import { useState } from "react";
import {
  Phone, Mail, Flame, Thermometer, Snowflake, RefreshCw,
  Users, MessageCircle, MessageSquare, Settings, DownloadCloud,
  CheckCircle2, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useLeadStats, useConversations, useCommentLeads,
  useSetupPages, useSyncComments,
  LeadScore, Conversation, PageComment, LeadStats,
} from "@/hooks/queries/useLeads";
import { useQueryClient } from "@tanstack/react-query";

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtTime = (s?: string) =>
  s ? new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

function IntentBadge({ score }: { score: LeadScore }) {
  const cfg = {
    HOT:  { icon: Flame,       cls: "bg-red-100 text-red-700 border-red-200",          label: "HOT" },
    WARM: { icon: Thermometer, cls: "bg-orange-100 text-orange-700 border-orange-200", label: "WARM" },
    COLD: { icon: Snowflake,   cls: "bg-blue-100 text-blue-700 border-blue-200",       label: "COLD" },
  }[score.intent_level] ?? { icon: Snowflake, cls: "bg-gray-100 text-gray-500", label: "—" };
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 text-xs", cfg.cls)}>
      <Icon className="h-3 w-3" />{cfg.label}
      <span className="opacity-50 text-[10px]">({score.score})</span>
    </Badge>
  );
}

// ── Stat cards ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={cn("text-2xl font-bold mt-1 tabular-nums", color ?? "text-gray-900")}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── AdSet filter card ──────────────────────────────────────────────────────────
function AdSetCard({ s, selected, onClick }: { s: LeadStats; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "bg-white rounded-xl border p-4 text-left transition-all hover:shadow-sm w-full",
        selected ? "border-violet-400 ring-2 ring-violet-100" : "border-gray-200 hover:border-gray-300"
      )}
    >
      <p className="font-semibold text-gray-900 text-sm truncate mb-3" title={s.adset_name}>{s.adset_name}</p>
      <div className="grid grid-cols-4 gap-1 text-center">
        <div>
          <p className="text-base font-bold tabular-nums text-violet-700">{s.total_leads}</p>
          <p className="text-[10px] text-gray-400">Tổng</p>
        </div>
        <div>
          <p className="text-base font-bold tabular-nums text-blue-600">{s.inbox_leads}</p>
          <p className="text-[10px] text-gray-400">Inbox</p>
        </div>
        <div>
          <p className="text-base font-bold tabular-nums text-orange-500">{s.comment_leads}</p>
          <p className="text-[10px] text-gray-400">Comment</p>
        </div>
        <div>
          <p className="text-base font-bold tabular-nums text-red-500">{s.hot_leads}</p>
          <p className="text-[10px] text-gray-400">HOT 🔥</p>
        </div>
      </div>
      <div className="mt-2 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className="bg-violet-500 h-full rounded-full" style={{ width: `${Math.min(s.lead_rate, 100)}%` }} />
      </div>
      <p className="text-[10px] text-gray-400 mt-1">{s.lead_rate}% có SĐT</p>
    </button>
  );
}

// ── Inbox tab ─────────────────────────────────────────────────────────────────
function InboxTab({ adsetId }: { adsetId?: string }) {
  const { data: convos, isLoading } = useConversations(adsetId);
  const [expanded, setExpanded] = useState<number | null>(null);

  if (isLoading) return (
    <div className="divide-y">{Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex gap-4 px-4 py-3">
        {Array.from({ length: 5 }).map((_, j) => <Skeleton key={j} className="h-4 w-24" />)}
      </div>
    ))}</div>
  );

  if (!convos?.length) return (
    <div className="text-center py-16 text-gray-400">
      <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-20" />
      <p className="text-sm">Chưa có tin nhắn inbox nào được ghi nhận.</p>
      <p className="text-xs mt-1">Webhook đã setup — inbox mới sẽ hiển thị realtime.</p>
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b">
            {["Khách hàng", "SĐT / Email", "Intent AI", "Tóm tắt AI", "Tin nhắn", "Adset", "Thời gian"].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {convos.map((c: Conversation) => (
            <>
              <tr
                key={c.id}
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-900">{c.user_name || "Unknown"}</p>
                  {c.is_qualified && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600 font-medium">
                      <CheckCircle2 className="h-2.5 w-2.5" /> Qualified
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.phone_number ? (
                    <div className="flex items-center gap-1 text-green-700 font-mono text-xs font-semibold">
                      <Phone className="h-3 w-3" />{c.phone_number}
                    </div>
                  ) : null}
                  {c.email ? (
                    <div className="flex items-center gap-1 text-blue-600 text-xs mt-0.5">
                      <Mail className="h-3 w-3" />{c.email}
                    </div>
                  ) : null}
                  {!c.phone_number && !c.email && <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-4 py-3">
                  {c.lead_score ? <IntentBadge score={c.lead_score} /> : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-4 py-3 max-w-[200px]">
                  <p className="text-xs text-gray-600 line-clamp-2">
                    {c.lead_score?.ai_summary || <span className="text-gray-300">Chưa phân tích</span>}
                  </p>
                  {c.lead_score?.has_budget_signal && (
                    <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded mr-1">💰 Ngân sách</span>
                  )}
                  {c.lead_score?.has_urgency_signal && (
                    <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded">⚡ Gấp</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-sm font-bold tabular-nums">{c.message_count}</span>
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs text-gray-500 truncate max-w-[120px]">{c.referral_adset_id || "—"}</p>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                  {fmtTime(c.last_message_at)}
                </td>
              </tr>
              {expanded === c.id && c.messages && c.messages.length > 0 && (
                <tr key={`${c.id}-expand`} className="bg-violet-50/50">
                  <td colSpan={7} className="px-6 py-3">
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {c.messages.map((m: { message_id: string; direction: string; text: string; sent_at: string }) => (
                        <div
                          key={m.message_id}
                          className={cn(
                            "text-xs rounded-lg px-3 py-2 max-w-[80%]",
                            m.direction === "IN"
                              ? "bg-white border border-gray-200 text-gray-800 mr-auto"
                              : "bg-violet-100 text-violet-800 ml-auto text-right"
                          )}
                        >
                          <p>{m.text}</p>
                          <p className="text-[10px] opacity-50 mt-0.5">{fmtTime(m.sent_at)}</p>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Comments tab ───────────────────────────────────────────────────────────────
function CommentsTab({ adsetId }: { adsetId?: string }) {
  const { data: comments, isLoading } = useCommentLeads(adsetId);

  if (isLoading) return (
    <div className="divide-y">{Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex gap-4 px-4 py-3">
        {Array.from({ length: 5 }).map((_, j) => <Skeleton key={j} className="h-4 w-24" />)}
      </div>
    ))}</div>
  );

  if (!comments?.length) return (
    <div className="text-center py-16 text-gray-400">
      <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
      <p className="text-sm">Chưa có comment nào được sync.</p>
      <p className="text-xs mt-1">Nhấn <strong>Sync Comments</strong> để pull comments từ các Page.</p>
    </div>
  );

  const qualified = comments.filter((c: PageComment) => c.is_qualified).length;

  return (
    <div>
      <div className="px-4 py-2 bg-gray-50 border-b flex items-center gap-4 text-xs text-gray-500">
        <span>{comments.length} comments</span>
        <span className="text-green-600 font-semibold">{qualified} có SĐT ({Math.round(qualified / comments.length * 100)}%)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              {["Người comment", "Nội dung comment", "SĐT (extract)", "Adset nguồn", "Page", "Thời gian"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {comments.map((c: PageComment) => (
              <tr key={c.id} className={cn("hover:bg-gray-50 transition-colors", c.is_qualified && "bg-green-50/30")}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-900 text-sm">{c.user_name || "—"}</p>
                  {c.is_qualified && (
                    <span className="text-[10px] text-green-600 font-medium flex items-center gap-0.5">
                      <CheckCircle2 className="h-2.5 w-2.5" /> Có SĐT
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 max-w-[280px]">
                  <p className="text-xs text-gray-700 line-clamp-2 leading-relaxed" title={c.text}>
                    {c.text || <span className="text-gray-300">Trống</span>}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {c.phone_number ? (
                    <div className="flex items-center gap-1 text-green-700 font-mono text-xs font-bold">
                      <Phone className="h-3 w-3" />{c.phone_number}
                    </div>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.adset_id ? (
                    <a
                      href={`/adsets/${c.adset_id}`}
                      className="text-xs text-violet-600 hover:underline flex items-center gap-0.5"
                      onClick={e => e.stopPropagation()}
                    >
                      {c.adset_id.slice(0, 12)}… <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ) : (
                    <span className="text-gray-300 text-xs">Chưa link</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{c.page_name}</td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtTime(c.commented_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function LeadsPage() {
  const [tab, setTab] = useState<"inbox" | "comments">("inbox");
  const [selectedAdset, setSelectedAdset] = useState<string | undefined>();
  const [showQualifiedOnly, setShowQualifiedOnly] = useState(false);
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useLeadStats();
  const { mutate: setupPages, isPending: settingUp } = useSetupPages();
  const { mutate: syncComments, isPending: syncing } = useSyncComments();

  const totalLeads    = stats?.reduce((a: number, s: LeadStats) => a + s.total_leads, 0) ?? 0;
  const totalInbox    = stats?.reduce((a: number, s: LeadStats) => a + s.inbox_leads, 0) ?? 0;
  const totalComments = stats?.reduce((a: number, s: LeadStats) => a + s.comment_leads, 0) ?? 0;
  const totalHot      = stats?.reduce((a: number, s: LeadStats) => a + s.hot_leads, 0) ?? 0;
  const totalQual     = stats?.reduce((a: number, s: LeadStats) => a + s.qualified_leads, 0) ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Intelligence</h1>
          <p className="text-sm text-gray-400 mt-0.5">Inbox + Comments · Webhook realtime · Auto extract SĐT</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline" size="sm"
            className="gap-2 text-violet-700 border-violet-200 hover:bg-violet-50"
            onClick={() => setupPages()}
            disabled={settingUp}
          >
            {settingUp
              ? <span className="h-3.5 w-3.5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
              : <Settings className="h-3.5 w-3.5" />}
            {settingUp ? "Đang setup..." : "Setup Pages & Webhook"}
          </Button>
          <Button
            variant="outline" size="sm"
            className="gap-2 text-blue-700 border-blue-200 hover:bg-blue-50"
            onClick={() => syncComments(undefined)}
            disabled={syncing}
          >
            {syncing
              ? <span className="h-3.5 w-3.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              : <DownloadCloud className="h-3.5 w-3.5" />}
            {syncing ? "Đang sync..." : "Sync Comments"}
          </Button>
          <Button
            variant="outline" size="sm"
            className="gap-2"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["leads"] })}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Tổng leads" value={totalLeads} sub="Inbox + Comment" color="text-violet-700" />
        <StatCard label="Inbox" value={totalInbox} sub="Tin nhắn Messenger" color="text-blue-600" />
        <StatCard label="Comments" value={totalComments} sub="Bình luận bài viết" color="text-orange-500" />
        <StatCard label="HOT 🔥" value={totalHot} sub="Cần follow up ngay" color="text-red-600" />
        <StatCard
          label="Có SĐT"
          value={totalLeads ? `${Math.round(totalQual / totalLeads * 100)}%` : "—"}
          sub={`${totalQual} / ${totalLeads} leads`}
          color="text-green-600"
        />
      </div>

      {/* AdSet breakdown */}
      {!statsLoading && (stats?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Breakdown theo AdSet — click để lọc
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {(stats ?? []).map((s: LeadStats) => (
              <AdSetCard
                key={s.adset_id}
                s={s}
                selected={selectedAdset === s.adset_id}
                onClick={() => setSelectedAdset(selectedAdset === s.adset_id ? undefined : s.adset_id)}
              />
            ))}
          </div>
          {selectedAdset && (
            <button
              className="mt-2 text-xs text-violet-600 hover:underline"
              onClick={() => setSelectedAdset(undefined)}
            >
              Xem tất cả adsets →
            </button>
          )}
        </div>
      )}

      {statsLoading && (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      )}

      {/* Tabs + Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center border-b border-gray-100 px-4 gap-0">
          <button
            onClick={() => setTab("inbox")}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
              tab === "inbox"
                ? "border-violet-500 text-violet-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <MessageCircle className="h-4 w-4" />
            Inbox / Messenger
            {totalInbox > 0 && (
              <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {totalInbox}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("comments")}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
              tab === "comments"
                ? "border-violet-500 text-violet-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <MessageSquare className="h-4 w-4" />
            Comments
            {totalComments > 0 && (
              <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {totalComments}
              </span>
            )}
          </button>
          <div className="ml-auto flex items-center gap-2 pr-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showQualifiedOnly}
                onChange={e => setShowQualifiedOnly(e.target.checked)}
                className="rounded"
              />
              Chỉ có SĐT
            </label>
          </div>
        </div>

        {/* Tab content */}
        {tab === "inbox"
          ? <InboxTab adsetId={selectedAdset} />
          : <CommentsTab adsetId={selectedAdset} />
        }
      </div>
    </div>
  );
}
