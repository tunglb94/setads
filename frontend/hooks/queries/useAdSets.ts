"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adsetApi, taskApi, AdSet, AIAnalysisResult } from "@/services/api";
import { useFilterStore } from "@/store/useFilterStore";

// ── Query keys ────────────────────────────────────────────────────────────────

export const adsetKeys = {
  all: ["adsets"] as const,
  list: (filters: object) => [...adsetKeys.all, "list", filters] as const,
  detail: (id: string) => [...adsetKeys.all, "detail", id] as const,
  insights: (id: string, days: number) =>
    [...adsetKeys.all, "insights", id, days] as const,
};

// ── useAdSets — paginated list with global filters ────────────────────────────

export function useAdSets(page = 1) {
  const { dateRange, statusFilter, searchQuery } = useFilterStore();

  return useQuery({
    queryKey: adsetKeys.list({ dateRange, statusFilter, searchQuery, page }),
    queryFn: async () => {
      const { data } = await adsetApi.list({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        search: searchQuery || undefined,
        days: dateRange,
        page,
        page_size: 50,
      });
      return data;
    },
  });
}

// ── useAdSetInsights ──────────────────────────────────────────────────────────

export function useAdSetInsights(adsetId: string, days: number) {
  return useQuery({
    queryKey: adsetKeys.insights(adsetId, days),
    queryFn: async () => {
      const { data } = await adsetApi.insights(adsetId, days);
      return data;
    },
    enabled: !!adsetId,
  });
}

// ── useToggleAdSet ────────────────────────────────────────────────────────────

export function useToggleAdSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (adsetId: string) => adsetApi.toggle(adsetId),

    // Optimistic update: flip status immediately in UI
    onMutate: async (adsetId) => {
      await queryClient.cancelQueries({ queryKey: adsetKeys.all });
      const snapshot = queryClient.getQueriesData<{ results: AdSet[] }>({
        queryKey: adsetKeys.all,
      });

      queryClient.setQueriesData<{ results: AdSet[]; count: number }>(
        { queryKey: adsetKeys.all },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            results: old.results.map((a) =>
              a.adset_id === adsetId
                ? { ...a, status: a.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }
                : a
            ),
          };
        }
      );

      return { snapshot };
    },

    onSuccess: (data) => {
      const status = data.data.status;
      toast.success(`AdSet đã ${status === "ACTIVE" ? "bật" : "tắt"} thành công`);
    },

    onError: (_err, _adsetId, ctx) => {
      // Roll back optimistic update
      if (ctx?.snapshot) {
        ctx.snapshot.forEach(([key, value]) =>
          queryClient.setQueryData(key, value)
        );
      }
      toast.error("Không thể thay đổi trạng thái AdSet");
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adsetKeys.all });
    },
  });
}

// ── useTriggerAIAnalysis — dispatch task then poll for result ─────────────────

export function useTriggerAIAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (adsetId: string): Promise<AIAnalysisResult> => {
      // 1. Dispatch the Celery task
      const { data } = await adsetApi.analyzeNow(adsetId);
      const taskId = data.task_id;

      // 2. Poll until done (max 90s, interval 3s)
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3_000));
        const { data: poll } = await taskApi.poll(taskId);

        if (poll.state === "SUCCESS" && poll.result) return poll.result;
        if (poll.state === "FAILURE") {
          throw new Error(poll.error || "AI analysis failed");
        }
      }
      throw new Error("AI analysis timed out sau 90 giây");
    },

    onSuccess: (_result, adsetId) => {
      toast.success("Phân tích AI hoàn tất");
      // Refresh the row so AI decision badge updates immediately
      queryClient.invalidateQueries({ queryKey: adsetKeys.all });
      queryClient.invalidateQueries({ queryKey: adsetKeys.detail(adsetId) });
    },

    onError: (err: Error) => {
      const isLLM = err.message.toLowerCase().includes("llm") ||
                    err.message.toLowerCase().includes("timeout");
      toast.error(
        isLLM
          ? "Lỗi kết nối Local LLM — Kiểm tra Ollama đang chạy chưa?"
          : `Phân tích thất bại: ${err.message}`
      );
    },
  });
}
