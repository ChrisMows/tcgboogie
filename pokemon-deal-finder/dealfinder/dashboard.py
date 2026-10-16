"""Local dark-mode dashboard: watchlist, sold comps, alert log, near misses, settings."""
from datetime import date, datetime

from flask import Flask, abort, flash, redirect, render_template, request, url_for

from . import db
from .alerts import build_discord_payload, card_label, sample_alert, send_discord, sold_search_url
from .compinput import GRADERS, LANGUAGES, VARIANT_CHOICES, parse_comp_lines
from .comps import market_value
from .config import EDITABLE, coerce_setting, load_config, update_config_values

app = Flask(__name__)
app.secret_key = "local-dashboard"
conn = db.connect()


@app.template_filter("money")
def money(v):
    return "-" if v is None else f"${v:,.2f}"


@app.template_filter("when")
def when(iso):
    if not iso:
        return ""
    try:
        dt = datetime.fromisoformat(iso).astimezone()
        return dt.strftime("%b %d %I:%M %p")
    except ValueError:
        return iso


def card_status(card, cfg):
    comps = db.list_comps(conn, card["id"])
    mv = market_value(comps, cfg["deal"])
    latest = max((c["sold_date"] for c in comps if not c["excluded"]), default=None)
    refresh_due = True
    if latest:
        refresh_due = (date.today() - date.fromisoformat(latest)).days >= cfg["deal"]["comp_refresh_days"]
    return {"mv": mv, "comp_count": len(comps), "latest": latest, "refresh_due": refresh_due}


@app.route("/")
def alerts_page():
    cfg = load_config()
    return render_template("alerts.html", alerts=db.list_alerts(conn), cfg=cfg,
                           calls=db.api_calls_today(conn), cards=len(db.list_cards(conn, True)))


@app.post("/alert/<item_id>/outcome")
def alert_outcome(item_id):
    db.set_outcome(conn, item_id, request.form.get("outcome", ""))
    return redirect(url_for("alerts_page"))


@app.route("/candidates")
def candidates_page():
    return render_template("candidates.html", rows=db.list_candidates(conn))


@app.route("/watchlist")
def watchlist_page():
    cfg = load_config()
    cards = db.list_cards(conn)
    rows = [{**c, "label": card_label(c), **card_status(c, cfg), "sold_url": sold_search_url(c)} for c in cards]
    return render_template("watchlist.html", rows=rows, cfg=cfg)


@app.route("/card/new", methods=["GET", "POST"])
@app.route("/card/<int:card_id>/edit", methods=["GET", "POST"])
def card_edit(card_id=None):
    card = db.get_card(conn, card_id) if card_id else {"language": "english", "grader": "PSA", "active": 1}
    if card_id and not card:
        abort(404)
    if request.method == "POST":
        f = request.form
        data = {k: f.get(k, "").strip() for k in db.CARD_FIELDS}
        data["variants"] = ", ".join(f.getlist("variants"))
        data["active"] = "1" if f.get("active") else "0"
        missing = [k for k in ("name", "set_name", "card_number", "grader", "grade") if not data[k]]
        if missing:
            flash("Please fill in: " + ", ".join(missing))
            return render_template("card_edit.html", card={**card, **data}, graders=GRADERS,
                                   variants=VARIANT_CHOICES, languages=LANGUAGES)
        new_id = db.save_card(conn, data, card_id)
        return redirect(url_for("card_page", card_id=new_id))
    return render_template("card_edit.html", card=card, graders=GRADERS, variants=VARIANT_CHOICES,
                           languages=LANGUAGES)


@app.post("/card/<int:card_id>/delete")
def card_delete(card_id):
    db.delete_card(conn, card_id)
    return redirect(url_for("watchlist_page"))


@app.route("/card/<int:card_id>", methods=["GET", "POST"])
def card_page(card_id):
    card = db.get_card(conn, card_id)
    if not card:
        abort(404)
    cfg = load_config()
    if request.method == "POST":
        rows, errors = parse_comp_lines(request.form.get("comps", ""))
        for d, p, s, n in rows:
            db.add_comp(conn, card_id, d, p, s, n)
        if rows:
            flash(f"Added {len(rows)} comp(s).")
        for e in errors:
            flash("Skipped " + e)
        return redirect(url_for("card_page", card_id=card_id))
    comps = db.list_comps(conn, card_id)
    st = card_status(card, cfg)
    cutoff = date.fromordinal(date.today().toordinal() - cfg["deal"]["comp_lookback_days"]).isoformat()
    return render_template("card.html", card=card, label=card_label(card), comps=comps, st=st, cfg=cfg,
                           cutoff=cutoff, sold_url=sold_search_url(card))


@app.post("/comp/<int:comp_id>/toggle")
def comp_toggle(comp_id):
    db.toggle_comp(conn, comp_id)
    return redirect(request.referrer or url_for("watchlist_page"))


@app.post("/comp/<int:comp_id>/delete")
def comp_delete(comp_id):
    db.delete_comp(conn, comp_id)
    return redirect(request.referrer or url_for("watchlist_page"))


@app.route("/settings", methods=["GET", "POST"])
def settings_page():
    if request.method == "POST":
        updates = {}
        try:
            for section, key, *_ in EDITABLE:
                raw = request.form.get(f"{section}.{key}", "").strip()
                if raw != "":
                    k, v = coerce_setting(key, raw)
                    updates[k] = v
        except ValueError as e:
            flash(f"Not saved: {e}")
            return redirect(url_for("settings_page"))
        update_config_values(updates)
        flash("Settings saved. The finder picks them up on its next check.")
        return redirect(url_for("settings_page"))
    cfg = load_config()
    fields = [{"section": s, "key": k, "value": cfg[s][k]} for s, k, *_ in EDITABLE]
    return render_template("settings.html", fields=fields, cfg=cfg,
                           webhook_set=bool(cfg["secrets"]["discord_webhook_url"]),
                           ebay_set=bool(cfg["secrets"]["ebay_client_id"]))


@app.post("/settings/test-alert")
def test_alert():
    cfg = load_config()
    rec, card = sample_alert()
    ok = send_discord(cfg["secrets"]["discord_webhook_url"], build_discord_payload(rec, card))
    flash("Test alert sent - check your phone." if ok else "Test alert failed. Is DISCORD_WEBHOOK_URL set in .env?")
    return redirect(url_for("settings_page"))
