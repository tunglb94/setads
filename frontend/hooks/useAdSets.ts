"use client";
import { useState, useEffect, useCallback } from "react";
import { adsetApi, taskApi, AdSet, AIAnalysisResult } from "@/services/api";

export function useAdSets(filters?: { status?: string; search?: string }) {
  const [adsets, setAdsets] = useState<AdSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adsetApi.list(filters);
      setAdsets(res.data.results);
      setTotal(res.data.count);
    } catch (e: unknown) {
      setError("Failed to load AdSets");
    } finally {
      setLoading(false);
    }
  }, [filters?.status, filters?.search]);

  useEffect(() => {
    fetch();
    // Auto-refresh every 2 minutes
    const interval = setInterval(fetch, 120_000);
    return () => clearInterval(interval);
  }, [fetch]);

  const toggleStatus = async (adsetId: string) => {
    try {
      const res = await adsetApi.toggle(adsetId);
      setAdsets((prev) =>
        prev.map((a) =>
          a.adset_id === adsetId ? { ...a, status: res.data.status as AdSet["status"] } : a
        )
      );
    } catch {
      throw new Error("Failed to toggle AdSet status");
    }
  };

  return { adsets, loading, error, total, refetch: fetch, toggleStatus };
}

export function useAnalyzeAdSet() {
  const [analyzing, setAnalyzing] = useState<string | null>(null); // adset_id being analyzed
  const [result, setResult] = useState<AIAnalysisResult | null>(null);

  const analyze = async (adsetId: string): Promise<AIAnalysisResult> => {
    setAnalyzing(adsetId);
    setResult(null);

    try {
      const { data } = await adsetApi.analyzeNow(adsetId);
      const taskId = data.task_id;

      // Poll for result (max 60s)
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await taskApi.poll(taskId);

        if (poll.data.state === "SUCCESS" && poll.data.result) {
          setResult(poll.data.result);
          return poll.data.result;
        }
        if (poll.data.state === "FAILURE") {
          throw new Error(poll.data.error || "AI analysis failed");
        }
      }
      throw new Error("AI analysis timed out");
    } finally {
      setAnalyzing(null);
    }
  };

  return { analyze, analyzing, result };
}
