#!/usr/bin/env bash
# Third pass: the app itself returned 503. Find out what its health check tests.
#
# Established so far: nginx logged no upstream error during the 03 Sep window,
# synergy-web has not restarted, and only /health 503'd - three retries per
# check, on the monitor's exact 10-minute cadence. So the 503 is the
# application's own verdict on itself, not a proxy or crash. This reads the
# health handler, the monitor, and the app's logs from that window.
#
# Run on the server:  sudo bash inspect-health.sh 2>&1 | tee /tmp/health.txt
set -u
hr() { echo; echo "===== $* ====="; }
APP=/home/ubuntu/synergy-web

hr "1. The REAL nginx config for new.synergymedicalstaffing.com"
# nginx -T dumps the fully resolved config, symlinks and includes already followed.
nginx -T 2>/dev/null > /tmp/nginx-dump.txt
if [ -s /tmp/nginx-dump.txt ]; then
  echo "--- every server_name nginx knows about ---"
  grep -h "server_name" /tmp/nginx-dump.txt | sed 's/^[[:space:]]*/  /' | sort -u
  echo
  echo "--- context around new.synergymedicalstaffing.com ---"
  grep -n -B 25 -A 40 "new\.synergymedicalstaffing\.com" /tmp/nginx-dump.txt || echo "  NOT FOUND in resolved config - it is being served by the default server block"
else
  echo "nginx -T produced nothing (needs root?)"
fi

hr "2. Anything returning 503 directly from nginx"
grep -n "return 503\|limit_req\|limit_conn\|max_fails" /tmp/nginx-dump.txt 2>/dev/null || echo "  none - nginx is not generating the 503 itself"

hr "3. The synergy-web app"
ls -la "$APP" 2>/dev/null || echo "($APP not found)"

hr "4. Its /health handler  <-- the thing that decided to say 503"
grep -RIn --exclude-dir=node_modules --exclude-dir=.git -e "health" "$APP" 2>/dev/null | head -30

hr "5. Every place the app can emit a 503"
grep -RIn --exclude-dir=node_modules --exclude-dir=.git -e "503" "$APP" 2>/dev/null | head -30

hr "6. The monitor itself (bin/uptime.js) - what it calls DOWN"
sed -n '1,120p' "$APP/bin/uptime.js" 2>/dev/null || echo "(not found)"

hr "7. PM2 metadata for synergy-web"
sudo -u ubuntu pm2 describe synergy-web 2>/dev/null | head -40 || echo "(unavailable)"

hr "8. PM2 log files available"
ls -la /home/ubuntu/.pm2/logs/ 2>/dev/null | grep -i "synergy\|total\|^d" | head -20

hr "9. App logs around the 03 Sep 01:00-02:00 outage"
for f in /home/ubuntu/.pm2/logs/synergy-web-out.log /home/ubuntu/.pm2/logs/synergy-web-error.log; do
  [ -f "$f" ] && { echo "### $f"; grep -n "Sep 03\|2026-09-03\|09/03" "$f" 2>/dev/null | head -25 || echo "  (no 03 Sep lines retained)"; }
done

hr "10. The monitor's own log around that window"
grep -n "DOWN\|RECOVER" "$APP/logs/uptime.log" 2>/dev/null | tail -30 || echo "(no DOWN lines retained in current log)"
ls -la "$APP/logs/" 2>/dev/null | head

hr "11. How slow is the old job board? (it timed out on 20 Aug)"
grep -c "wp-jobs" "$APP/logs/uptime.log" 2>/dev/null
grep "wp-jobs" "$APP/logs/uptime.log" 2>/dev/null | awk '{print $4}' | sed 's/ms//' | sort -n | awk '
  {a[NR]=$1} END {if(NR){printf "  samples=%d  min=%sms  median=%sms  max=%sms\n", NR, a[1], a[int(NR/2)+1], a[NR]}}'

hr "Done"
