"use client";
import { useQuery } from "@tanstack/react-query";
import { automationApi } from "@/services/api";

export const logKeys = {
  all: ["automation-logs"] as const,
  list: (filters: object) => [...logKeys.all, filters] as const,
};

export function useAutomationLogs(params?: { adset_id?: string; page?: number }) {
  return useQuery({
    queryKey: logKeys.list(params ?? {}),
    queryFn: async () => {
      const { data } = await automationApi.logs(params);
      return data;
    },
    // Logs don't change as frequently — longer stale time
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
