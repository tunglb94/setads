export interface DeepFunnelMetrics {
  ad_id: string;
  ad_name: string;
  adset_id: string;
  adset_name: string;

  // Meta API spend data (7 days)
  total_spend: number;
  total_impressions: number;
  total_clicks: number;

  // Tách bạch inbox vs comment — không gộp chung (quality khác nhau hoàn toàn)
  total_inbox: number;      // Tin nhắn Messenger thực (webhook attributed hoặc Meta message_count)
  total_comments: number;   // Bình luận bài viết (Meta comment_count)

  // Meta API raw values (populated after ad-level sync)
  meta_message_count: number;
  meta_comment_count: number;

  // Internal conversation quality (AI-scored)
  total_conversations: number;  // = total_inbox (kept for backward compat)
  qualified_leads: number;   // has phone number
  hot_leads: number;         // HOT intent (appointment/call)
  warm_leads: number;
  spam_count: number;
  appointment_count: number;
  scored_count: number;

  // Computed metrics — True CPL
  cost_per_message: number;
  cost_per_qualified_lead: number;  // North Star: spend / phone leads
  cost_per_hot_lead: number;
  qualified_rate: number;   // %
  spam_rate: number;        // %

  // AI decision on this ad
  ai_decision: string;      // PAUSE | KEEP | SCALE | ""
  ai_reasoning: string;
  ai_confidence: number | null;
  ai_analyzed_at: string | null;
}
