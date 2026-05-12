import axios, { AxiosError } from "axios";
import { toast } from "sonner";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// ── Cookie helpers — readable by JS and Next.js middleware ────────────────────

export function getAuthToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function setAuthToken(token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  document.cookie = `auth_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secure}`;
}

export function clearAuthToken() {
  document.cookie = "auth_token=; Path=/; Max-Age=0";
}

// ── Axios instance ────────────────────────────────────────────────────────────

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 20_000,
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) config.headers.Authorization = `Token ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      clearAuthToken();
      if (typeof window !== "undefined") window.location.href = "/login";
    }
    if (!error.response) {
      toast.error("Mất kết nối server. Kiểm tra Django backend.");
    }
    return Promise.reject(error);
  }
);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Insight {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  frequency?: number;
  message_count?: number;
  comment_count?: number;
  cost_per_message?: number | null;
}

export interface AdSet {
  id: number;
  adset_id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";
  campaign_name: string;
  campaign_status: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";
  account_name: string;
  daily_budget: number | null;
  ai_decision: "PAUSE" | "KEEP" | "SCALE" | "CREATIVE_REFRESH" | "";
  ai_reasoning: string;
  ai_confidence: number | null;
  ai_analyzed_at: string | null;
  auto_paused: boolean;
  latest_insight: Insight | null;
  campaign_daily_budget?: number | null;
}

export interface AdData {
  ad_id: string;
  ad_name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  message_count: number;
  comment_count: number;
  cost_per_message: number | null;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  frequency: number;
  ai_decision: string;
  ai_confidence: number | null;
}

export interface PaginatedResponse<T> {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
}

export interface AIAnalysisResult {
  adset_id: string;
  decision: "PAUSE" | "KEEP" | "SCALE" | "CREATIVE_REFRESH";
  confidence: number;
  reasoning: string;
  recommended_action: string;
  scale_factor?: number;
  raw: Record<string, unknown>;
}

export interface TaskPollResult {
  state: "PENDING" | "STARTED" | "SUCCESS" | "FAILURE" | "RETRY";
  result?: AIAnalysisResult;
  error?: string;
}

export interface AutomationLog {
  id: number;
  adset_id: string;
  adset_name: string;
  trigger_source: "RULE" | "AI" | "ANOMALY" | "MANUAL";
  action_taken: string;
  ai_decision: string;
  ai_reasoning: string;
  metric_snapshot: Record<string, number>;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  created_at: string;
  error_message?: string;
}

export interface AutomationRule {
  id: number;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  action: string;
  is_active: boolean;
}

// ── API methods ───────────────────────────────────────────────────────────────

export const adsetApi = {
  list: (params?: {
    status?: string;
    search?: string;
    days?: number;
    date_from?: string;
    date_to?: string;
    page?: number;
    page_size?: number;
  }) => api.get<PaginatedResponse<AdSet>>("/adsets/", { params }),

  detail: (adsetId: string) =>
    api.get<AdSet & { insights: Insight[] }>(`/adsets/${adsetId}/`),

  toggle: (adsetId: string) =>
    api.post<{ adset_id: string; status: string }>(`/adsets/${adsetId}/toggle/`),

  insights: (adsetId: string, days = 7) =>
    api.get<Insight[]>(`/adsets/${adsetId}/insights/`, { params: { days } }),

  analyzeNow: (adsetId: string) =>
    api.post<{ task_id: string; adset_id: string }>(`/adsets/${adsetId}/analyze/`),

  ads: (adsetId: string, params?: { days?: number; date_from?: string; date_to?: string }) =>
    api.get<AdData[]>(`/adsets/${adsetId}/ads/`, { params }),
};

export const taskApi = {
  poll: (taskId: string) => api.get<TaskPollResult>(`/tasks/${taskId}/`),
};

export const automationApi = {
  logs: (params?: { adset_id?: string; page?: number }) =>
    api.get<PaginatedResponse<AutomationLog>>("/automation/logs/", { params }),

  rules: () => api.get<AutomationRule[]>("/automation/rules/"),

  toggleRule: (ruleId: number, isActive: boolean) =>
    api.patch(`/automation/rules/${ruleId}/`, { is_active: isActive }),
};

export interface AccountSummary {
  total_spend: number;
  total_conversions: number;
  avg_roas: number;
  avg_cpa: number;
  active_adsets: number;
  paused_adsets: number;
}

export const statsApi = {
  summary: (params: { days?: number; date_from?: string; date_to?: string } = { days: 3 }) =>
    api.get<AccountSummary>("/stats/summary/", { params }),
  syncNow: () =>
    api.post<{ synced_rows: number; accounts: number }>("/sync/"),
};

export interface Appointment {
  id: number;
  page_name: string;
  ad_id: string;
  adset_id: string;
  patient_name: string;
  patient_name_display: string;
  phone: string;
  appointment_date: string | null;
  appointment_time: string;
  service: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  detected_at: string;
}

export interface AppointmentAdStat {
  ad_id: string;
  adset_id: string;
  total_conversations: number;
  phone_numbers: number;
  appointments: number;
  scheduled: number;
  completed: number;
}

export const appointmentApi = {
  list: (params?: { date_from?: string; date_to?: string; days?: number; adset_id?: string; ad_id?: string; page_size?: number }) =>
    api.get<PaginatedResponse<Appointment>>("/appointments/", { params }),

  scan: () =>
    api.post<{ scanned: number; appointments_created: number }>("/appointments/scan/", {}, { timeout: 15_000 }),

  updateStatus: (id: number, status: Appointment["status"]) =>
    api.patch(`/appointments/${id}/`, { status }),

  adStats: (params?: { date_from?: string; date_to?: string; days?: number }) =>
    api.get<AppointmentAdStat[]>("/appointments/ad-stats/", { params }),
};

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string; user: { username: string } }>(
      "/auth/login/",
      { username, password }
    ),
};
