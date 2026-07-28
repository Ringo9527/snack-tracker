from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
import sqlite3
import json
import os

DB_PATH = os.environ.get("DB_PATH", "/data/snacks.db")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_CLAIMS_EMAIL = os.environ.get("VAPID_CLAIMS_EMAIL", "mailto:user@example.com")

os.makedirs(os.path.dirname(DB_PATH) if os.path.dirname(DB_PATH) else ".", exist_ok=True)


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS snacks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            barcode TEXT DEFAULT '',
            name TEXT NOT NULL,
            brand TEXT DEFAULT '',
            prod_date TEXT NOT NULL,
            shelf_days INTEGER NOT NULL,
            expire_date TEXT NOT NULL,
            remaining INTEGER DEFAULT 0,
            status TEXT DEFAULT 'safe',
            status_text TEXT DEFAULT '安全',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT UNIQUE NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notification_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sent_at TEXT DEFAULT (datetime('now','localtime')),
            snack_count INTEGER DEFAULT 0,
            details TEXT DEFAULT ''
        )
    """)
    conn.commit()
    conn.close()


def refresh_all_snacks():
    conn = get_db()
    today = date.today()
    rows = conn.execute("SELECT id, prod_date, shelf_days FROM snacks").fetchall()
    for row in rows:
        expire_date = date.fromisoformat(row["prod_date"]) + timedelta(days=row["shelf_days"])
        remaining = (expire_date - today).days
        status = "safe" if remaining > 30 else ("warn" if remaining > 0 else "expired")
        status_text = "安全" if remaining > 30 else ("即将过期" if remaining > 0 else "已过期")
        conn.execute(
            "UPDATE snacks SET expire_date=?, remaining=?, status=?, status_text=? WHERE id=?",
            (expire_date.isoformat(), remaining, status, status_text, row["id"])
        )
    conn.commit()
    conn.close()


def send_push_notifications(warn_count, expired_count, detail_lines):
    """Send web push notifications to all subscribed browsers."""
    if not VAPID_PRIVATE_KEY:
        print(f"[PUSH] 未配置VAPID密钥，跳过推送。即将过期:{warn_count}款 已过期:{expired_count}款")
        return

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        print(f"[PUSH] pywebpush未安装，跳过推送。即将过期:{warn_count}款 已过期:{expired_count}款")
        return

    conn = get_db()
    subs = conn.execute("SELECT endpoint, p256dh, auth FROM push_subscriptions").fetchall()
    conn.close()

    if not subs:
        print("[PUSH] 无订阅用户")
        return

    body_parts = []
    if expired_count > 0:
        body_parts.append(f"⚠️ {expired_count}款零食已过期")
    if warn_count > 0:
        body_parts.append(f"⏰ {warn_count}款零食即将过期")

    payload = json.dumps({
        "title": "🍿 零食保质期提醒",
        "body": "，".join(body_parts),
        "icon": "/icon.png",
        "badge": "/icon.png",
        "data": {"url": "/"},
        "actions": [{"action": "open", "title": "查看详情"}]
    })

    success = 0
    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_CLAIMS_EMAIL}
            )
            success += 1
        except WebPushException as e:
            if e.response and e.response.status_code in (404, 410):
                conn2 = get_db()
                conn2.execute("DELETE FROM push_subscriptions WHERE endpoint=?", (sub["endpoint"],))
                conn2.commit()
                conn2.close()

    conn3 = get_db()
    conn3.execute("INSERT INTO notification_log (snack_count, details) VALUES (?,?)",
                  (warn_count + expired_count, "\n".join(detail_lines)))
    conn3.commit()
    conn3.close()
    print(f"[PUSH] 发送完成: {success}/{len(subs)} 成功")


def check_and_notify():
    """Check for expiring/expired snacks and send push if needed."""
    refresh_all_snacks()
    conn = get_db()
    today = date.today().isoformat()
    expiring = conn.execute(
        "SELECT name, brand, expire_date, remaining, status FROM snacks WHERE status IN ('warn','expired') ORDER BY remaining"
    ).fetchall()
    conn.close()

    warn_count = sum(1 for r in expiring if r["status"] == "warn")
    expired_count = sum(1 for r in expiring if r["status"] == "expired")
    detail_lines = [f"{r['name']}({r['brand']}) 到期:{r['expire_date']} 剩余:{r['remaining']}天" for r in expiring]

    if warn_count + expired_count > 0:
        send_push_notifications(warn_count, expired_count, detail_lines)

    return expiring


# -------- App --------
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # Run first check on startup
    try:
        check_and_notify()
    except Exception as e:
        print(f"[STARTUP] 检查失败: {e}")

    # Setup daily scheduler
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        scheduler = BackgroundScheduler()
        scheduler.add_job(check_and_notify, 'cron', hour=9, minute=0)
        scheduler.start()
        print("[SCHEDULER] 每日9:00自动检查已启动")
    except ImportError:
        print("[SCHEDULER] apscheduler未安装，跳过定时任务")

    yield


app = FastAPI(title="零食保质期管理", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------- API Models --------
class SnackCreate(BaseModel):
    barcode: str = ""
    name: str
    brand: str = ""
    prod_date: str
    shelf_days: int


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict


class BatchImport(BaseModel):
    items: list[SnackCreate]


# -------- API Routes --------
@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.now().isoformat()}


@app.get("/api/snacks")
def list_snacks():
    refresh_all_snacks()
    conn = get_db()
    rows = conn.execute("SELECT * FROM snacks ORDER BY remaining").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/snacks")
def create_snack(snack: SnackCreate):
    today = date.today()
    prod_date = date.fromisoformat(snack.prod_date)
    expire_date = prod_date + timedelta(days=snack.shelf_days)
    remaining = (expire_date - today).days
    status = "safe" if remaining > 30 else ("warn" if remaining > 0 else "expired")
    status_text = "安全" if remaining > 30 else ("即将过期" if remaining > 0 else "已过期")

    conn = get_db()
    conn.execute(
        "INSERT INTO snacks (barcode,name,brand,prod_date,shelf_days,expire_date,remaining,status,status_text) VALUES (?,?,?,?,?,?,?,?,?)",
        (snack.barcode, snack.name, snack.brand, snack.prod_date, snack.shelf_days, expire_date.isoformat(), remaining, status, status_text)
    )
    conn.commit()
    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return {"id": new_id, "status": status, "expire_date": expire_date.isoformat(), "remaining": remaining}


@app.post("/api/snacks/batch")
def batch_import(data: BatchImport):
    results = []
    for snack in data.items:
        r = create_snack(snack)
        results.append(r)
    return {"count": len(results), "results": results}


@app.delete("/api/snacks/{snack_id}")
def delete_snack(snack_id: int):
    conn = get_db()
    conn.execute("DELETE FROM snacks WHERE id=?", (snack_id,))
    conn.commit()
    conn.close()
    return {"deleted": True}


@app.delete("/api/snacks")
def clear_all():
    conn = get_db()
    conn.execute("DELETE FROM snacks")
    conn.commit()
    conn.close()
    return {"cleared": True}


@app.post("/api/subscribe")
def subscribe(sub: PushSubscription):
    conn = get_db()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?,?,?)",
            (sub.endpoint, sub.keys.get("p256dh", ""), sub.keys.get("auth", ""))
        )
        conn.commit()
    except Exception as e:
        raise HTTPException(400, str(e))
    finally:
        conn.close()
    return {"subscribed": True}


@app.get("/api/check-now")
def manual_check():
    expiring = check_and_notify()
    return {
        "checked_at": datetime.now().isoformat(),
        "expiring_count": len(expiring),
        "items": [dict(r) for r in expiring]
    }


@app.get("/api/vapid-public-key")
def get_vapid_public_key():
    return {"public_key": os.environ.get("VAPID_PUBLIC_KEY", "")}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8001)))
