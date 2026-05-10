"""
Prompt templates — tuned for Vietnam beauty clinic (thẩm mỹ viện) Meta Ads.

Industry context baked into every prompt:
  - Lead = comment + inbox message (khách hỏi thông tin, đặt lịch)
  - ROAS from Meta ≈ 0 always (thanh toán tại clinic, offline — không track pixel)
  - CPA target: ≤ 500,000 VND/lead
  - Decision must account for minimum spend threshold — not enough data = don't pause
  - Frequency 3–5 is acceptable (service industry needs repeated exposure)
"""

# ──────────────────────────────────────────────────────────────────────────────
# System prompt — always included
# ──────────────────────────────────────────────────────────────────────────────

SYSTEM_ADS_ANALYST = """Bạn là chuyên gia phân tích Meta Ads cho ngành thẩm mỹ viện tại Việt Nam.

NGÀNH ĐẶC THÙ — ĐỌC KỸ TRƯỚC KHI PHÂN TÍCH:
- Đây là dịch vụ thẩm mỹ (làm đẹp, phẫu thuật thẩm mỹ, chăm sóc da) — khách hàng thanh toán tại clinic, KHÔNG online.
- ROAS từ Meta luôn = 0 hoặc rất thấp vì không có pixel ecommerce → TUYỆT ĐỐI KHÔNG dùng ROAS để ra quyết định dừng quảng cáo.
- Có 2 chỉ số riêng biệt — KHÔNG được nhầm lẫn:
    • CPA (Cost per Action) = chi tiêu ÷ (comment + inbox) — Meta báo, ~500k hiện tại
    • True CPL (Cost per SĐT) = chi tiêu ÷ số điện thoại thu được — nội bộ, ~1,300,000 hiện tại
- Prompt này dùng CPA (Meta) — True CPL được tính riêng trong Deep Funnel.
- Ngưỡng CPA thực tế ngành thẩm mỹ Việt Nam (đã xác nhận):
    Tốt      : ≤ 500,000 VND/action → Hiệu quả, nên giữ hoặc scale
    Chấp nhận: 500,001 – 600,000 VND/action → Ổn, theo dõi
    Khá cao  : 600,001 – 700,000 VND/action → Cần tối ưu
    Đắt      : > 700,000 VND/action VÀ đã chi > 1,000,000 VND → Xem xét dừng
- KHÔNG đưa ra quyết định PAUSE nếu tổng chi phí < 500,000 VND (chưa đủ dữ liệu).
- CTR 0.5%–3% là bình thường cho ngành dịch vụ thẩm mỹ.
- Frequency 3–5 là bình thường — khách cần xem nhiều lần trước khi liên hệ.

Trả về JSON hợp lệ duy nhất — không markdown, không giải thích ngoài JSON."""

# ──────────────────────────────────────────────────────────────────────────────
# Step 1 — Chẩn đoán hiệu suất
# ──────────────────────────────────────────────────────────────────────────────

STEP1_DIAGNOSE = """Chẩn đoán hiệu suất nhóm quảng cáo thẩm mỹ viện.

Nhóm quảng cáo: {adset_name}
Dữ liệu {days} ngày gần nhất (cũ nhất → mới nhất):
{insights_json}

Tổng hợp:
- Tổng chi phí: {total_spend:,.0f} VND
- Số leads (bình luận + tin nhắn + SĐT): {total_conversions} leads
- CPA trung bình: {avg_cpa:,.0f} VND/action (mục tiêu tốt: ≤ 500,000 VND | tối đa chấp nhận: ≤ {max_cpa:,.0f} VND)
- Xu hướng CTR: {ctr_trend}
- Frequency trung bình: {avg_frequency:.1f}
- Tín hiệu mệt mỏi (ad fatigue): {fatigue_severity}

LƯU Ý: ROAS = 0 là BÌNH THƯỜNG cho ngành thẩm mỹ viện — bỏ qua hoàn toàn.

Trả về JSON:
{{
  "health_status": "HEALTHY" | "AT_RISK" | "CRITICAL",
  "primary_issue": "FATIGUE" | "HIGH_CPA" | "NO_LEADS" | "LOW_SPEND" | "NONE",
  "trend_assessment": "improving" | "stable" | "declining",
  "data_sufficient": true | false,
  "key_observations": ["nhận xét 1", "nhận xét 2", "nhận xét 3"]
}}"""

# ──────────────────────────────────────────────────────────────────────────────
# Step 2 — Quyết định hành động
# ──────────────────────────────────────────────────────────────────────────────

STEP2_DECIDE = """Quyết định hành động cho nhóm quảng cáo thẩm mỹ viện.

Chẩn đoán từ Bước 1:
{diagnosis_json}

Thông tin quyết định:
- Tên nhóm: {adset_name}
- Tổng chi phí: {total_spend:,.0f} VND
- CPA hiện tại: {avg_cpa:,.0f} VND/lead
- Mục tiêu CPA: ≤ {max_cpa:,.0f} VND/lead
- Frequency: {avg_frequency:.1f}
- Xu hướng CTR: {ctr_trend}
- Ad Fatigue: {fatigue_severity}

QUY TẮC QUYẾT ĐỊNH (ưu tiên từ trên xuống — dùng CPA = cost per action):
1. Nếu tổng chi phí < 500,000 VND → KEEP (chưa đủ dữ liệu, không được dừng)
2. Nếu CPA ≤ 500,000 VND VÀ có ít nhất 3 actions → SCALE
3. Nếu CPA ≤ 600,000 VND VÀ xu hướng ổn định/tốt → KEEP
4. Nếu CPA 600,001–700,000 VND → KEEP hoặc CREATIVE_REFRESH (khá cao, theo dõi)
5. Nếu Fatigue SEVERE (CTR giảm ≥ 50%) VÀ CPA > 600,000 → CREATIVE_REFRESH
6. Nếu CPA > 700,000 VND VÀ chi phí > 1,000,000 VND VÀ xu hướng xấu → PAUSE
7. Nếu không có actions VÀ chi phí > 1,000,000 VND VÀ đã chạy > 3 ngày → PAUSE
8. Mọi trường hợp còn lại → KEEP

NHẮC LẠI: ROAS = 0 là bình thường — KHÔNG dùng ROAS để quyết định PAUSE.

Trả về JSON:
{{
  "decision": "PAUSE" | "SCALE" | "CREATIVE_REFRESH" | "KEEP",
  "confidence": 0.0-1.0,
  "reasoning": "Lý do 2-3 câu tiếng Việt, dẫn số liệu cụ thể, phù hợp ngành thẩm mỹ",
  "recommended_action": "Hành động cụ thể cần làm",
  "scale_factor": 1.0-2.0,
  "key_metrics": {{
    "avg_cpa": {avg_cpa},
    "total_spend": {total_spend},
    "avg_frequency": {avg_frequency},
    "ctr_trend": "{ctr_trend}"
  }}
}}"""

# ──────────────────────────────────────────────────────────────────────────────
# Ad-level comparison
# ──────────────────────────────────────────────────────────────────────────────

AD_COMPARISON = """So sánh hiệu suất từng quảng cáo trong nhóm thẩm mỹ viện.

Nhóm quảng cáo: {adset_name}
Ngưỡng CPA mục tiêu: ≤ {max_cpa:,.0f} VND/lead
Phân tích {days} ngày gần nhất

Dữ liệu từng quảng cáo:
{ads_json}

NGUYÊN TẮC ĐÁNH GIÁ:
- CPA = chi tiêu ÷ (comment + inbox) — đây là cost per action từ Meta
- ROAS = 0 là BÌNH THƯỜNG — bỏ qua hoàn toàn
- Không đủ dữ liệu (chi phí < 500,000 VND hoặc 0 actions) → KEEP, không PAUSE
- CPA tốt ≤ 500k VND | Chấp nhận ≤ 600k VND | Khá cao ≤ 700k VND | Đắt > 700k VND
- So sánh tương đối giữa các ads trong cùng nhóm
- Ưu tiên ad nào có CPA thấp nhất và có nhiều actions thực tế

Nhiệm vụ:
1. Đánh giá từng ad: PAUSE / KEEP / SCALE
2. Xác định ad hiệu quả nhất và kém nhất trong nhóm
3. Gợi ý cụ thể bằng tiếng Việt

Trả về JSON:
{{
  "summary": "Tóm tắt 1-2 câu tổng thể nhóm",
  "ads": [
    {{
      "ad_id": "...",
      "ad_name": "...",
      "decision": "PAUSE|KEEP|SCALE",
      "confidence": 0.0-1.0,
      "reasoning": "Lý do ngắn, dẫn số liệu CPA và leads cụ thể",
      "cpa_vs_target": "Xuất sắc/Tốt/Chấp nhận/Kém/Chưa đủ data",
      "priority": 1
    }}
  ],
  "best_ad_id": "ad_id hiệu quả nhất",
  "worst_ad_id": "ad_id kém nhất (hoặc null nếu chỉ có 1 ad)",
  "overall_recommendation": "Khuyến nghị tổng thể 1-2 câu"
}}"""

# ──────────────────────────────────────────────────────────────────────────────
# Anomaly triage
# ──────────────────────────────────────────────────────────────────────────────

ANOMALY_ANALYSIS = """Phát hiện bất thường trong nhóm quảng cáo thẩm mỹ viện.

Nhóm: {adset_name} (ID: {adset_id})
Bất thường: {anomaly_description}

CPA hiện tại: {current_cpa:,.0f} VND/lead
CPA baseline (7 ngày): {baseline_cpa:,.0f} VND/lead
Chênh lệch: {multiplier:.1f}× baseline

Trả về JSON:
{{
  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "root_cause_hypothesis": "Giả thuyết nguyên nhân tiếng Việt",
  "immediate_action": "PAUSE" | "MONITOR" | "INVESTIGATE",
  "reasoning": "Phân tích tiếng Việt",
  "estimated_loss_per_hour_vnd": 0,
  "recovery_steps": ["bước 1", "bước 2"]
}}"""

# ──────────────────────────────────────────────────────────────────────────────
# Creative scoring
# ──────────────────────────────────────────────────────────────────────────────

CREATIVE_SCORING = """Phân tích hiệu suất creative quảng cáo thẩm mỹ viện.

Dữ liệu quảng cáo (7 ngày gần nhất):
{ads_json}

Đây là ngành thẩm mỹ viện — chỉ số quan trọng là leads (bình luận + inbox), không phải ROAS.

Trả về JSON:
{{
  "ranked_ads": [
    {{
      "ad_id": "...",
      "ad_name": "...",
      "score": 0-100,
      "strengths": ["..."],
      "weaknesses": ["..."]
    }}
  ],
  "winning_patterns": {{
    "copy_elements": ["yếu tố 1", "yếu tố 2"],
    "cta_style": "...",
    "tone": "..."
  }},
  "next_test_suggestions": ["gợi ý 1", "gợi ý 2", "gợi ý 3"]
}}"""

# ──────────────────────────────────────────────────────────────────────────────
# Lead scoring
# ──────────────────────────────────────────────────────────────────────────────

LEAD_SCORING = """Phân tích cuộc hội thoại Messenger giữa khách hàng và tư vấn viên thẩm mỹ viện.

TOÀN BỘ NỘI DUNG CUỘC HỘI THOẠI:
{messages}

Thông tin bổ sung:
- Có SĐT: {has_phone}
- Số tin nhắn: {message_count}
- Nhóm quảng cáo nguồn: {adset_name}

DẤU HIỆU PHÂN LOẠI:
HOT  = Để lại SĐT / Đặt lịch hẹn rõ ràng / Gọi trực tiếp qua Messenger / Hỏi giá cụ thể dịch vụ / Muốn tư vấn ngay
WARM = Quan tâm dịch vụ, đang cân nhắc, chưa sẵn sàng đặt lịch
COLD = Xem qua, chưa có nhu cầu rõ ràng
SPAM = Chỉ 1 tin nhắn rồi không phản hồi / Chỉ gửi emoji hoặc ký tự vô nghĩa / Nội dung không liên quan thẩm mỹ

Trả về JSON:
{{
  "score": 0-100,
  "intent_level": "HOT" | "WARM" | "COLD",
  "has_appointment": true/false,
  "is_spam": true/false,
  "has_budget_signal": true/false,
  "has_urgency_signal": true/false,
  "ai_summary": "Tóm tắt ý định khách hàng bằng tiếng Việt (1-2 câu)",
  "suggested_reply": "Câu trả lời gợi ý cho sales"
}}"""

# ──────────────────────────────────────────────────────────────────────────────
# Creative analyst system prompt
# ──────────────────────────────────────────────────────────────────────────────

SYSTEM_CREATIVE_ANALYST = """Bạn là chuyên gia phân tích creative quảng cáo ngành thẩm mỹ viện Việt Nam.
Đánh giá hiệu quả của từng creative dựa trên CTR, leads (bình luận + inbox), không dùng ROAS.
Trả về JSON hợp lệ duy nhất — không markdown, không giải thích ngoài JSON."""

# ──────────────────────────────────────────────────────────────────────────────
# Deep Funnel AI — True CPL analysis (spend + conversation quality)
# ──────────────────────────────────────────────────────────────────────────────

DEEP_FUNNEL_ANALYST = """Phân tích chiều sâu phễu quảng cáo thẩm mỹ viện.

Đây là dữ liệu kết hợp từ Meta API (chi tiêu) và database nội bộ (AI đọc từng hội thoại).
North Star Metric = Chi phí trên mỗi số điện thoại (Cost per Phone Lead).

Quảng cáo: {ad_name} (ID: {ad_id})
Dữ liệu 7 ngày gần nhất:

CHI TIÊU META:
- Tổng chi phí: {total_spend:,.0f} VND
- Lượt hiển thị: {total_impressions:,}
- Lượt click: {total_clicks:,}

PHỄU HỘI THOẠI (AI đọc từng tin nhắn):
- Tổng hội thoại: {total_conversations}
- Lead có SĐT: {qualified_leads} → Chi phí/SĐT: {cost_per_qualified_lead:,.0f} VND
- HOT leads (đặt lịch/gọi trực tiếp): {hot_leads} → Chi phí/HOT: {cost_per_hot_lead:,.0f} VND
- WARM leads (đang cân nhắc): {warm_leads}
- Spam/Bounce: {spam_count} ({spam_rate:.0f}% tổng đã phân loại)
- Đã đặt lịch hẹn: {appointment_count}
- Chi phí mỗi hội thoại: {cost_per_message:,.0f} VND

Ngưỡng CPL thực tế (đã xác nhận):
- Tốt: ≤ 1,000,000 VND/SĐT | Chấp nhận: ≤ 2,000,000 | Khá cao: ≤ 3,000,000 | Đắt: > 3,000,000
- Mục tiêu tối đa: {max_cpa:,.0f} VND/SĐT

QUY TẮC QUYẾT ĐỊNH:
1. Chi tiêu < 1,000,000 VND → KEEP (chưa đủ dữ liệu)
2. Spam rate > 80% VÀ chi tiêu > 2,000,000 VND → PAUSE (traffic rác)
3. Chi phí/SĐT ≤ 1,000,000 VND VÀ có ≥ 2 SĐT → SCALE
4. Chi phí/SĐT > 3,000,000 VND VÀ chi tiêu > 2,000,000 VND → PAUSE
5. Mọi trường hợp còn lại → KEEP

Trả về JSON:
{{
  "decision": "PAUSE" | "KEEP" | "SCALE",
  "confidence": 0.0-1.0,
  "funnel_quality": "EXCELLENT" | "GOOD" | "POOR" | "SPAM",
  "reasoning": "Lý do 2-3 câu tiếng Việt, dẫn số liệu cụ thể",
  "recommended_action": "Hành động cụ thể cần làm"
}}"""

# ──────────────────────────────────────────────────────────────────────────────
# Live Streaming Analyst — chain-of-thought, no JSON constraint
# Prefix "Reasoning: high" triggers gpt-oss max reasoning effort.
# ──────────────────────────────────────────────────────────────────────────────

STREAM_SYSTEM = """Reasoning: high

Bạn là chuyên gia phân tích phễu quảng cáo sâu (Deep Funnel Analyst) cho ngành thẩm mỹ viện Việt Nam.

BỐI CẢNH NGÀNH:
- Khách hàng thanh toán offline tại clinic → ROAS Meta luôn = 0, bỏ qua hoàn toàn.
- 1 lead thật = 1 số điện thoại để lại qua Messenger/comment.
- CPA (cost per action = comment+inbox): tốt ≤500k, chấp nhận ≤600k, đắt >700k.
- True CPL (cost per SĐT): tốt ≤1,000,000₫, chấp nhận ≤2,000,000₫, đắt >3,000,000₫.
- Spam rate >30% = traffic kém chất lượng, cần điều tra nhắm mục tiêu.

HÃY PHÂN TÍCH theo từng bước, suy luận rõ ràng, dẫn số liệu cụ thể.
Trả lời bằng tiếng Việt. Được phép suy luận dài trước khi kết luận."""

STREAM_USER = """Phân tích chuyên sâu quảng cáo sau và đưa ra quyết định có lập luận cụ thể:

📌 QUẢNG CÁO: {ad_name}
🆔 Ad ID: {ad_id}
📦 AdSet: {adset_name}

━━━ CHI TIÊU META (7 ngày) ━━━
• Tổng chi phí  : {total_spend:,.0f}₫
• Lượt hiển thị : {total_impressions:,}
• Lượt click    : {total_clicks:,}
• CPM ước tính  : {cpm:,.0f}₫

━━━ PHỄU HỘI THOẠI (AI đọc từng tin nhắn) ━━━
• Tổng tin nhắn vào : {total_conversations}
• Chi phí/tin nhắn  : {cost_per_message:,.0f}₫  ← CPA thực
• Lead có SĐT       : {qualified_leads} ({qualified_rate:.0f}% tổng tin nhắn)
• True CPL          : {cost_per_qualified_lead:,.0f}₫/SĐT  ← North Star
• HOT leads         : {hot_leads} (đặt lịch hẹn/gọi trực tiếp)
• Cost/HOT lead     : {cost_per_hot_lead:,.0f}₫
• WARM leads        : {warm_leads}
• Spam/Bounce       : {spam_count} ({spam_rate:.0f}% đã phân loại)
• Đã đặt lịch hẹn  : {appointment_count}
• Tổng đã AI-score  : {scored_count}/{total_conversations} hội thoại

━━━ QUYẾT ĐỊNH AI TRƯỚC ━━━
• Quyết định cũ: {prev_decision}
• Lý do cũ    : {prev_reasoning}

Hãy phân tích theo trình tự:
1. Đánh giá chất lượng traffic (spam, CPA/tin nhắn)
2. Đánh giá hiệu quả chuyển đổi (SĐT, lịch hẹn, True CPL)
3. Phát hiện vấn đề cụ thể nếu có
4. Ra quyết định: SCALE / KEEP / PAUSE
5. Hành động cụ thể cần làm ngay hôm nay"""

# ──────────────────────────────────────────────────────────────────────────────
# Weekly strategy report
# ──────────────────────────────────────────────────────────────────────────────

WEEKLY_STRATEGY = """Báo cáo chiến lược tuần cho tài khoản quảng cáo thẩm mỹ viện.

Tổng quan tài khoản (7 ngày qua):
{account_summary_json}

Top/Bottom performers:
{performers_json}

Lead stats theo nhóm quảng cáo:
{lead_stats_json}

Đây là ngành thẩm mỹ viện — đánh giá theo CPA/lead (bình luận + inbox), không theo ROAS.

Trả về JSON:
{{
  "executive_summary": "Tóm tắt 3-4 câu hiệu quả tuần",
  "total_spend": 0,
  "total_leads": 0,
  "avg_cpl": 0,
  "top_wins": ["điểm mạnh 1", "điểm mạnh 2"],
  "top_issues": ["vấn đề 1", "vấn đề 2"],
  "recommended_budget_shifts": [
    {{"from_adset": "...", "to_adset": "...", "amount_vnd": 0, "reason": "..."}}
  ],
  "next_week_priorities": ["ưu tiên 1", "ưu tiên 2", "ưu tiên 3"]
}}"""
