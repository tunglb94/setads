"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/services/api";
import type { DeepFunnelMetrics } from "@/types/deepFunnel";

export type { DeepFunnelMetrics };

export function useDeepFunnel(adsetId?: string) {
  return useQuery<DeepFunnelMetrics[]>({
    queryKey: ["deep-funnel", adsetId ?? "all"],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (adsetId) params.adset_id = adsetId;
      const { data } = await api.get<DeepFunnelMetrics[]>("/leads/deep-funnel/", { params });
      return Array.isArray(data) ? data : (data as any).results ?? [];
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useScoreAllLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ queued: number; message: string }>("/leads/score-all/");
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message ?? `Đã queue ${data.queued} cuộc hội thoại để AI phân loại`, {
        description: "Kết quả sẽ cập nhật trong 1–2 phút. Nhấn Refresh để xem.",
        duration: 6000,
      });
      // Invalidate after short delay to let worker start
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["deep-funnel"] }), 5000);
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error ?? "Score All thất bại", {
        description: "Kiểm tra kết nối Ollama tại localhost:11434",
      }),
  });
}
