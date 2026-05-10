"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { toast } from "sonner";

export interface LeadStats {
  adset_id: string;
  adset_name: string;
  inbox_leads: number;
  comment_leads: number;
  total_leads: number;
  qualified_leads: number;
  hot_leads: number;
  warm_leads: number;
  lead_rate: number;
}

export interface LeadScore {
  score: number;
  intent_level: "HOT" | "WARM" | "COLD";
  ai_summary: string;
  has_phone: boolean;
  has_budget_signal: boolean;
  has_urgency_signal: boolean;
  analyzed_at: string;
}

export interface Conversation {
  id: number;
  conversation_id: string;
  user_name: string;
  phone_number: string;
  email: string;
  is_qualified: boolean;
  message_count: number;
  first_message_at: string;
  last_message_at: string;
  referral_ad_id: string;
  referral_adset_id: string;
  referral_campaign_id: string;
  lead_score?: LeadScore;
  messages?: { message_id: string; direction: string; text: string; sent_at: string }[];
}

export interface PageComment {
  id: number;
  comment_id: string;
  post_id: string;
  adset_id: string;
  ad_id: string;
  user_name: string;
  text: string;
  phone_number: string;
  is_qualified: boolean;
  commented_at: string;
  page_name: string;
}

export interface PageSetupResult {
  pages_found: number;
  results: { page_id: string; name: string; page_created: boolean; webhook_subscribed: boolean }[];
  webhook_url: string;
  verify_token: string;
}

export function useLeadStats() {
  return useQuery({
    queryKey: ["leads", "stats"],
    queryFn: async () => {
      const { data } = await api.get<LeadStats[]>("/leads/stats/");
      return Array.isArray(data) ? data : (data as any).results ?? [];
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useConversations(adsetId?: string, qualified?: boolean) {
  return useQuery({
    queryKey: ["leads", "inbox", adsetId ?? "all", qualified],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (adsetId) params.adset_id = adsetId;
      if (qualified) params.qualified = "true";
      const { data } = await api.get<Conversation[]>("/leads/", { params });
      return Array.isArray(data) ? data : (data as any).results ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useCommentLeads(adsetId?: string, qualified?: boolean) {
  return useQuery({
    queryKey: ["leads", "comments", adsetId ?? "all", qualified],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (adsetId) params.adset_id = adsetId;
      if (qualified) params.qualified = "true";
      const { data } = await api.get<PageComment[]>("/leads/comments/", { params });
      return Array.isArray(data) ? data : (data as any).results ?? [];
    },
    staleTime: 30_000,
  });
}

export function useSetupPages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<PageSetupResult>("/messenger/setup/");
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Đã kết nối ${data.pages_found} pages, webhook subscribed`);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || "Setup thất bại"),
  });
}

export function useSyncComments() {
  return useMutation({
    mutationFn: async (days?: number) => {
      const { data } = await api.post("/messenger/sync-comments/", { days: days ?? 3 });
      return data;
    },
    onSuccess: (data) => toast.success(data.message ?? "Đang sync comments trong nền..."),
    onError: (err: any) => toast.error(err?.response?.data?.error || "Sync thất bại"),
  });
}
