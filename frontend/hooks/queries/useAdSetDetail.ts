"use client";
import { useQuery } from "@tanstack/react-query";
import { adsetApi, AdSet, Insight } from "@/services/api";

export function useAdSetDetail(adsetId: string) {
  return useQuery({
    queryKey: ["adsets", "detail", adsetId],
    queryFn: async () => {
      const { data } = await adsetApi.detail(adsetId);
      return data as AdSet & { insights: Insight[] };
    },
    enabled: !!adsetId,
    staleTime: 30_000,
  });
}
