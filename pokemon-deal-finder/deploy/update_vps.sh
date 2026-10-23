#!/bin/bash
# Push this folder's code to the VPS and restart the bot. Run from pokemon-deal-finder/ in Git Bash:
#   bash deploy/update_vps.sh
# Keeps the server's own .env and data/ (cache, eBay call counter).
set -euo pipefail
HOST=root@2.24.77.223
KEY=~/.ssh/tcgboogie_vps
tar --force-local --exclude='__pycache__' --exclude='*.pyc' --exclude='logs' --exclude='data' --exclude='.env' -czf ../dealbot-update.tgz .
scp -q -i "$KEY" ../dealbot-update.tgz "$HOST":/root/dealbot-update.tgz && rm ../dealbot-update.tgz
ssh -i "$KEY" "$HOST" 'set -e
  tar -xzf /root/dealbot-update.tgz -C /opt/dealbot/pokemon-deal-finder && rm /root/dealbot-update.tgz
  chown -R dealbot:dealbot /opt/dealbot
  sudo -u dealbot /opt/dealbot/venv/bin/pip install -q -r /opt/dealbot/pokemon-deal-finder/requirements.txt
  # Run the tests on the server first: if anything fails, the running bot is left alone. DATABASE_URL is blanked so
  # tests can never read or write the real database (the .env loader leaves an already-set variable alone).
  cd /opt/dealbot/pokemon-deal-finder && sudo -u dealbot env DATABASE_URL= /opt/dealbot/venv/bin/python -m unittest discover -s tests 2>&1 | tail -3
  sudo -u dealbot env DATABASE_URL= /opt/dealbot/venv/bin/python -m unittest discover -s tests >/dev/null 2>&1 || { echo "TESTS FAILED: bot NOT restarted (still running the previous version)"; exit 1; }
  systemctl restart dealbot && sleep 3 && systemctl is-active dealbot'
