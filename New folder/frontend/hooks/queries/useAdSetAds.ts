"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { toast } from "sonner";

export interface AdMetrics {
  ad_id: string;
  ad_name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  frequency: number;
  ai_decision: string;
  ai_reasoning: string;
  ai_confidence: number | null;
  ai_analyzed_at: string | null;
}

export interface AdAIResult {
  summary: string;
  ads: {
    ad_id: string;
    ad_name: string;
    decision: string;
    confidence: number;
    reasoning: string;
    cpa_vs_target: string;
    priority: number;
  }[];
  best_ad_id: string;
  worst_ad_id: string;
  overall_recommendation: string;
}

export function useAdSetAds(adsetId: string, days = 7) {
  return useQuery({
    queryKey: ["adsets", adsetId, "ads", days],
    queryFn: async () => {
      const { data } = await api.get<AdMetrics[]>(`/adsets/${adsetId}/ads/`, { params: { days } });
      return data;
    },
    enabled: !!adsetId,
    staleTime: 60_000,
  });
}

export function useAnalyzeAds(adsetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (days?: number) => {
      const { data } = await api.post<AdAIResult>(`/adsets/${adsetId}/ads/analyze/`, { days: days ?? 7 });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adsets", adsetId, "ads"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || "Phân tích thất bại");
    },
  });
}

export function useToggleAd(adsetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (adId: string) => {
      const { data } = await api.post(`/ads/${adId}/toggle/`);
      return data as { ad_id: string; status: string };
    },
    onSuccess: (data) => {
      toast.success(`Ad đã ${data.status === "ACTIVE" ? "bật" : "tắt"}`);
      queryClient.invalidateQueries({ queryKey: ["adsets", adsetId, "ads"] });
    },
    onError: () => toast.error("Không thể thay đổi trạng thái ad"),
  });
}
