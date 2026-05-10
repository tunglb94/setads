"use client";
import { useQuery } from "@tanstack/react-query";
import { statsApi, AccountSummary } from "@/services/api";

export function useAccountSummary(days = 3) {
  return useQuery({
    queryKey: ["stats", "summary", days],
    queryFn: async () => {
      const { data } = await statsApi.summary(days);
      return data as AccountSummary;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
