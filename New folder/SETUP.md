# Super Admin Digital — Setup Guide

## Quick Start (Docker)

```bash
# 1. Copy env file và điền thông tin
cp backend/.env.example backend/.env

# 2. Khởi động toàn bộ stack
docker-compose up -d

# 3. Chạy migrations
docker-compose exec backend python manage.py migrate

# 4. Tạo superuser
docker-compose exec backend python manage.py createsuperuser

# 5. Mở browser
# Dashboard:  http://localhost:3000
# Django Admin: http://localhost:8000/admin
```

## Local Dev (không Docker)

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
cp .env.example .env           # điền META_ACCESS_TOKEN, LLM_BASE_URL, v.v.

python manage.py migrate
python manage.py createsuperuser
python manage.py runserver

# Terminal khác — Celery worker
celery -A core_project worker --loglevel=info

# Terminal khác — Celery beat
celery -A core_project beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

## Cấu hình Meta API

1. Vào [Meta Business Suite](https://business.facebook.com/) → Settings → Advanced → System Users
2. Tạo System User, cấp quyền `ads_management` + `ads_read`
3. Generate **Long-lived Access Token** (không expire)
4. Điền vào `.env`:
   ```
   META_APP_ID=...
   META_APP_SECRET=...
   META_ACCESS_TOKEN=...
   META_AD_ACCOUNT_ID=act_XXXXXXXXX
   ```

## Cấu hình Local LLM (Ollama)

```bash
# Cài Ollama: https://ollama.com
ollama pull deepseek-r1:7b      # hoặc qwen2.5:7b
ollama serve                    # chạy trên port 11434

# Trong .env:
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=deepseek-r1:7b
LLM_API_KEY=ollama
```

## Automation Rules

Vào Django Admin → Automation Rules → Add Rule. Ví dụ:
- **Tắt ads lỗ:** metric=`cpa`, operator=`gt`, threshold=`80000`, action=`PAUSE`  
- **Scale ads win:** metric=`roas`, operator=`gte`, threshold=`3.0`, action=`SCALE_BUDGET`

## Thresholds mặc định

| Setting | Default | Mô tả |
|---------|---------|-------|
| `MAX_CPA` | 50,000₫ | CPA tối đa trước khi AI cân nhắc PAUSE |
| `MIN_ROAS` | 2.0x | ROAS tối thiểu để AI cân nhắc KEEP |
| `ANOMALY_CPA_MULTIPLIER` | 3x | Trigger alert nếu CPA tăng gấp 3 lần baseline |
