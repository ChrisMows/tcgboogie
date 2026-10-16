"""SQLite storage: watchlist cards, sold comps, alerts sent, candidates reviewed, API usage."""
import json
import sqlite3
from datetime import date, datetime, timezone

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,             -- e.g. "Charizard"
    set_name TEXT NOT NULL,         -- e.g. "Base Set"
    set_aliases TEXT DEFAULT '',    -- comma separated extra spellings seen in titles
    card_number TEXT NOT NULL,      -- e.g. "4/102", "SWSH050", "TG05/TG30"
    variants TEXT DEFAULT '',       -- comma separated: 1st edition, shadowless, reverse holo, ...
    language TEXT DEFAULT 'english',
    grader TEXT NOT NULL,           -- PSA, BGS, CGC, SGC, TAG, ...
    grade TEXT NOT NULL,            -- "10", "9.5", "10 PRISTINE", "10 BLACK LABEL"
    exclude_terms TEXT DEFAULT '',  -- comma separated words that rule a listing out for this card
    notes TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS comps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    sold_date TEXT NOT NULL,        -- YYYY-MM-DD
    price REAL NOT NULL,
    shipping REAL NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    excluded INTEGER DEFAULT 0,
    added_at TEXT
);
CREATE TABLE IF NOT EXISTS alerts (
    item_id TEXT PRIMARY KEY,       -- one alert per eBay listing, ever
    alerted_at TEXT,
    card_id INTEGER,
    card_label TEXT,
    title TEXT,
    url TEXT,
    price REAL,
    shipping REAL,
    total REAL,
    market_value REAL,
    discount_pct REAL,
    comps_used INTEGER,
    minutes_left REAL,
    seller TEXT,
    feedback_score INTEGER,
    feedback_pct REAL,
    bid_count INTEGER,
    flags TEXT,                     -- JSON list
    reason TEXT,                    -- JSON with the full qualification record
    delivered INTEGER DEFAULT 0,
    outcome TEXT DEFAULT ''         -- your notes later: "won", "real deal", "false positive", ...
);
CREATE TABLE IF NOT EXISTS candidates (
    item_id TEXT PRIMARY KEY,
    last_seen TEXT,
    card_id INTEGER,
    card_label TEXT,
    title TEXT,
    url TEXT,
    total REAL,
    market_value REAL,
    discount_pct REAL,
    minutes_left REAL,
    status TEXT,                    -- alerted / skipped
    reason TEXT
);
CREATE TABLE IF NOT EXISTS api_calls (
    day TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS members (
    discord_id TEXT PRIMARY KEY,
    display_name TEXT,
    tier TEXT,                      -- plan key from config.yaml (owner / premium / standard)
    active INTEGER DEFAULT 1,
    source TEXT DEFAULT 'role',     -- role (website-assigned role) / manual (/member add) / owner
    delivery_kind TEXT,             -- channel / thread / dm
    delivery_id TEXT,               -- channel or thread id
    joined_at TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    name TEXT NOT NULL,
    filters TEXT NOT NULL,          -- JSON, see members.FILTER_SPEC
    active INTEGER DEFAULT 1,
    created_at TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS deals (
    item_id TEXT PRIMARY KEY,       -- latest snapshot of every listing that passed the wide scan
    updated_at TEXT,
    end_time TEXT,
    rec TEXT,                       -- JSON
    card TEXT                       -- JSON
);
CREATE TABLE IF NOT EXISTS deliveries (
    discord_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    profile_id INTEGER,
    profile_name TEXT,
    queued_at TEXT,
    send_after TEXT,
    status TEXT,                    -- queued / sent / failed / expired
    sent_at TEXT,
    error TEXT,
    outcome TEXT DEFAULT '',
    PRIMARY KEY (discord_id, item_id)   -- each member hears about a listing once
);
CREATE TABLE IF NOT EXISTS ppt_cache (
    key TEXT PRIMARY KEY,           -- num:<lang>:<set>:<query>  or  price:<lang>:<tcgPlayerId>:<days>
    fetched_at TEXT,
    json TEXT
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,           -- paused, alert_channel_id, log_channel_id, dm_alerts, mention_me, last_check
    value TEXT
);
"""

MIGRATIONS = [
    ("cards", "muted_until", "ALTER TABLE cards ADD COLUMN muted_until TEXT"),
]


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path=DB_PATH):
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")  # lets the bot and the finder use the DB at the same time
    conn.executescript(SCHEMA)
    for table, col, sql in MIGRATIONS:
        if col not in {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}:
            conn.execute(sql)
    conn.commit()
    return conn


# ---- settings (runtime state controlled from Discord) ----
def get_setting(conn, key, default=None):
    r = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return r["value"] if r else default


def set_setting(conn, key, value):
    conn.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                 (key, None if value is None else str(value)))
    conn.commit()


def is_paused(conn):
    return get_setting(conn, "paused", "0") == "1"


# ---- cards ----
CARD_FIELDS = ["name", "set_name", "set_aliases", "card_number", "variants", "language",
               "grader", "grade", "exclude_terms", "notes", "active"]


def list_cards(conn, active_only=False):
    q = "SELECT * FROM cards"
    if active_only:
        q += " WHERE active = 1"
    return [dict(r) for r in conn.execute(q + " ORDER BY name, set_name, grader, grade")]


def get_card(conn, card_id):
    r = conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
    return dict(r) if r else None


def save_card(conn, data, card_id=None):
    vals = {k: data.get(k, "") for k in CARD_FIELDS}
    vals["active"] = 1 if str(vals["active"]) in ("1", "on", "True", "true") or vals["active"] is True else 0
    vals["grader"] = vals["grader"].strip().upper()
    vals["grade"] = vals["grade"].strip().upper()
    vals["language"] = (vals["language"] or "english").strip().lower()
    if card_id:
        sets = ", ".join(f"{k} = ?" for k in CARD_FIELDS)
        conn.execute(f"UPDATE cards SET {sets}, updated_at = ? WHERE id = ?",
                     [vals[k] for k in CARD_FIELDS] + [now_iso(), card_id])
    else:
        cols = ", ".join(CARD_FIELDS)
        cur = conn.execute(
            f"INSERT INTO cards ({cols}, created_at, updated_at) VALUES ({', '.join('?' * len(CARD_FIELDS))}, ?, ?)",
            [vals[k] for k in CARD_FIELDS] + [now_iso(), now_iso()])
        card_id = cur.lastrowid
    conn.commit()
    return card_id


def delete_card(conn, card_id):
    conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    conn.commit()


def set_card_active(conn, card_id, active):
    conn.execute("UPDATE cards SET active = ?, updated_at = ? WHERE id = ?", (1 if active else 0, now_iso(), card_id))
    conn.commit()


def mute_card(conn, card_id, until_iso):
    """Stop alerts for a card until the given UTC time (None to unmute)."""
    conn.execute("UPDATE cards SET muted_until = ? WHERE id = ?", (until_iso, card_id))
    conn.commit()


def is_muted(card, now=None):
    until = card.get("muted_until")
    if not until:
        return False
    return datetime.fromisoformat(until) > (now or datetime.now(timezone.utc))


# ---- comps ----
def list_comps(conn, card_id):
    return [dict(r) for r in conn.execute(
        "SELECT * FROM comps WHERE card_id = ? ORDER BY sold_date DESC, id DESC", (card_id,))]


def add_comp(conn, card_id, sold_date, price, shipping=0.0, note=""):
    conn.execute("INSERT INTO comps (card_id, sold_date, price, shipping, note, added_at) VALUES (?,?,?,?,?,?)",
                 (card_id, sold_date if isinstance(sold_date, str) else sold_date.isoformat(),
                  float(price), float(shipping or 0), note, now_iso()))
    conn.commit()


def toggle_comp(conn, comp_id):
    conn.execute("UPDATE comps SET excluded = 1 - excluded WHERE id = ?", (comp_id,))
    conn.commit()


def delete_comp(conn, comp_id):
    conn.execute("DELETE FROM comps WHERE id = ?", (comp_id,))
    conn.commit()


# ---- alerts / candidates ----
def already_alerted(conn, item_id):
    return conn.execute("SELECT 1 FROM alerts WHERE item_id = ?", (item_id,)).fetchone() is not None


def record_alert(conn, rec):
    """Insert the alert row. Returns False if this listing was already alerted (dedupe)."""
    try:
        conn.execute(
            """INSERT INTO alerts (item_id, alerted_at, card_id, card_label, title, url, price, shipping, total,
               market_value, discount_pct, comps_used, minutes_left, seller, feedback_score, feedback_pct,
               bid_count, flags, reason, delivered) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (rec["item_id"], now_iso(), rec["card_id"], rec["card_label"], rec["title"], rec["url"],
             rec["price"], rec["shipping"], rec["total"], rec["market_value"], rec["discount_pct"],
             rec["comps_used"], rec["minutes_left"], rec["seller"], rec["feedback_score"],
             rec["feedback_pct"], rec["bid_count"], json.dumps(rec["flags"]),
             json.dumps(rec["reason"], default=str), 0))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False


def mark_delivered(conn, item_id, ok):
    conn.execute("UPDATE alerts SET delivered = ? WHERE item_id = ?", (1 if ok else 0, item_id))
    conn.commit()


def set_outcome(conn, item_id, outcome):
    conn.execute("UPDATE alerts SET outcome = ? WHERE item_id = ?", (outcome, item_id))
    conn.commit()


def alerts_since(conn, since_iso):
    return conn.execute("SELECT COUNT(*) AS n FROM alerts WHERE alerted_at >= ?", (since_iso,)).fetchone()["n"]


def list_alerts(conn, limit=200):
    rows = [dict(r) for r in conn.execute("SELECT * FROM alerts ORDER BY alerted_at DESC LIMIT ?", (limit,))]
    for r in rows:
        r["flags"] = json.loads(r["flags"] or "[]")
    return rows


def upsert_candidate(conn, rec):
    conn.execute(
        """INSERT INTO candidates (item_id, last_seen, card_id, card_label, title, url, total, market_value,
           discount_pct, minutes_left, status, reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(item_id) DO UPDATE SET last_seen=excluded.last_seen, card_id=excluded.card_id,
           card_label=excluded.card_label, total=excluded.total, market_value=excluded.market_value,
           discount_pct=excluded.discount_pct, minutes_left=excluded.minutes_left,
           status=excluded.status, reason=excluded.reason""",
        (rec["item_id"], now_iso(), rec.get("card_id"), rec.get("card_label"), rec.get("title"),
         rec.get("url"), rec.get("total"), rec.get("market_value"), rec.get("discount_pct"),
         rec.get("minutes_left"), rec["status"], rec["reason"]))
    conn.commit()


def list_candidates(conn, limit=300):
    return [dict(r) for r in conn.execute("SELECT * FROM candidates ORDER BY last_seen DESC LIMIT ?", (limit,))]


# ---- members ----
def get_member(conn, discord_id):
    r = conn.execute("SELECT * FROM members WHERE discord_id = ?", (str(discord_id),)).fetchone()
    return dict(r) if r else None


def upsert_member(conn, discord_id, **fields):
    discord_id = str(discord_id)
    if get_member(conn, discord_id) is None:
        conn.execute("INSERT INTO members (discord_id, joined_at, updated_at) VALUES (?, ?, ?)",
                     (discord_id, now_iso(), now_iso()))
    if fields:
        sets = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE members SET {sets}, updated_at = ? WHERE discord_id = ?",
                     list(fields.values()) + [now_iso(), discord_id])
    conn.commit()
    return get_member(conn, discord_id)


def list_members(conn, active_only=False):
    q = "SELECT * FROM members" + (" WHERE active = 1" if active_only else "") + " ORDER BY joined_at"
    return [dict(r) for r in conn.execute(q)]


def count_deliveries_by_kind(conn, kind):
    return conn.execute("SELECT COUNT(*) AS n FROM members WHERE delivery_kind = ?", (kind,)).fetchone()["n"]


# ---- filter profiles ----
def list_profiles(conn, discord_id=None, active_only=False):
    q, args = "SELECT * FROM profiles WHERE 1=1", []
    if discord_id is not None:
        q += " AND discord_id = ?"
        args.append(str(discord_id))
    if active_only:
        q += " AND active = 1"
    rows = [dict(r) for r in conn.execute(q + " ORDER BY id", args)]
    for r in rows:
        r["filters"] = json.loads(r["filters"])
    return rows


def get_profile(conn, profile_id):
    r = conn.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,)).fetchone()
    if not r:
        return None
    r = dict(r)
    r["filters"] = json.loads(r["filters"])
    return r


def create_profile(conn, discord_id, name, filters):
    cur = conn.execute("INSERT INTO profiles (discord_id, name, filters, active, created_at, updated_at) VALUES (?,?,?,?,?,?)",
                       (str(discord_id), name, json.dumps(filters), 1, now_iso(), now_iso()))
    conn.commit()
    return cur.lastrowid


def update_profile(conn, profile_id, **fields):
    if "filters" in fields:
        fields["filters"] = json.dumps(fields["filters"])
    sets = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(f"UPDATE profiles SET {sets}, updated_at = ? WHERE id = ?", list(fields.values()) + [now_iso(), profile_id])
    conn.commit()


def delete_profile(conn, profile_id):
    conn.execute("DELETE FROM profiles WHERE id = ?", (profile_id,))
    conn.commit()


# ---- deals and the per-member delivery queue ----
def save_deal(conn, rec, card):
    conn.execute("INSERT INTO deals (item_id, updated_at, end_time, rec, card) VALUES (?,?,?,?,?) "
                 "ON CONFLICT(item_id) DO UPDATE SET updated_at=excluded.updated_at, end_time=excluded.end_time, "
                 "rec=excluded.rec, card=excluded.card",
                 (rec["item_id"], now_iso(), rec.get("end_time"), json.dumps(rec, default=str), json.dumps(card, default=str)))
    conn.commit()


def get_deal(conn, item_id):
    r = conn.execute("SELECT * FROM deals WHERE item_id = ?", (item_id,)).fetchone()
    return (json.loads(r["rec"]), json.loads(r["card"])) if r else None


def recent_deals(conn, since_iso):
    return [(json.loads(r["rec"]), json.loads(r["card"]))
            for r in conn.execute("SELECT * FROM deals WHERE updated_at >= ? ORDER BY updated_at DESC", (since_iso,))]


def queue_delivery(conn, discord_id, item_id, profile_id, profile_name, send_after_iso):
    """Returns True if newly queued (False if this member already got / is getting this listing)."""
    try:
        conn.execute("INSERT INTO deliveries (discord_id, item_id, profile_id, profile_name, queued_at, send_after, status) "
                     "VALUES (?,?,?,?,?,?, 'queued')",
                     (str(discord_id), item_id, profile_id, profile_name, now_iso(), send_after_iso))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False


def due_deliveries(conn, now_iso_str, limit=50):
    return [dict(r) for r in conn.execute(
        "SELECT * FROM deliveries WHERE status = 'queued' AND send_after <= ? ORDER BY send_after LIMIT ?",
        (now_iso_str, limit))]


def next_delivery_time(conn):
    r = conn.execute("SELECT MIN(send_after) AS t FROM deliveries WHERE status = 'queued'").fetchone()
    return r["t"]


def finish_delivery(conn, discord_id, item_id, status, error=None):
    conn.execute("UPDATE deliveries SET status = ?, sent_at = ?, error = ? WHERE discord_id = ? AND item_id = ?",
                 (status, now_iso(), error, str(discord_id), item_id))
    conn.commit()


def set_delivery_outcome(conn, discord_id, item_id, outcome):
    conn.execute("UPDATE deliveries SET outcome = ? WHERE discord_id = ? AND item_id = ?", (outcome, str(discord_id), item_id))
    conn.commit()


# ---- api usage ----
def count_api_call(conn, n=1):
    day = date.today().isoformat()
    conn.execute("INSERT INTO api_calls (day, count) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET count = count + ?",
                 (day, n, n))
    conn.commit()


def api_calls_today(conn):
    r = conn.execute("SELECT count FROM api_calls WHERE day = ?", (date.today().isoformat(),)).fetchone()
    return r["count"] if r else 0
