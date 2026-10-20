#!/bin/bash
# One-time setup of the TCG Boogie deal bot on a fresh Ubuntu VPS. Safe to run again.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "== packages"
apt-get update -qq
apt-get upgrade -y -qq >/dev/null
apt-get install -y -qq python3-venv python3-pip ufw unattended-upgrades >/dev/null

echo "== firewall: allow SSH only (the bot makes outgoing connections, nothing comes in)"
ufw allow OpenSSH >/dev/null
ufw --force enable >/dev/null
ufw status | head -5

echo "== bot account and files"
id dealbot >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/dealbot --shell /usr/sbin/nologin dealbot
mkdir -p /opt/dealbot
tar -xzf /root/dealbot.tgz -C /opt/dealbot
[ -f /root/shared.py ] && cp /root/shared.py /opt/dealbot/pokemon-deal-finder/dealfinder/shared.py
mkdir -p /opt/dealbot/pokemon-deal-finder/logs /opt/dealbot/pokemon-deal-finder/data
chown -R dealbot:dealbot /opt/dealbot
chmod 600 /opt/dealbot/pokemon-deal-finder/.env

echo "== python environment"
sudo -u dealbot python3 -m venv /opt/dealbot/venv
sudo -u dealbot /opt/dealbot/venv/bin/pip install -q --upgrade pip
sudo -u dealbot /opt/dealbot/venv/bin/pip install -q -r /opt/dealbot/pokemon-deal-finder/requirements.txt

echo "== tests"
cd /opt/dealbot/pokemon-deal-finder && sudo -u dealbot /opt/dealbot/venv/bin/python -m unittest discover -s tests 2>&1 | tail -1

echo "== service (starts at boot, restarts if it stops)"
cat > /etc/systemd/system/dealbot.service <<'UNIT'
[Unit]
Description=TCG Boogie deal bot (website mode)
After=network-online.target
Wants=network-online.target

[Service]
User=dealbot
WorkingDirectory=/opt/dealbot/pokemon-deal-finder
ExecStart=/opt/dealbot/venv/bin/python run_web.py
Restart=always
RestartSec=30
Environment=PYTHONUNBUFFERED=1
# Hardening: the bot only needs its own folder.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/dealbot/pokemon-deal-finder/data /opt/dealbot/pokemon-deal-finder/logs
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now dealbot >/dev/null 2>&1
sleep 5
systemctl is-active dealbot
rm -f /root/dealbot.tgz /root/shared.py
echo "== done"
