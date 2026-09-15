#!/usr/bin/env bash
# Second pass: why does /health return 503 for 30-60 minutes at a time?
#
# Pass 1 ruled out the easy answers: no OOM kills, 2.4G RAM free, swap present,
# and /health answers 200 right now. It also showed this box runs ~40 cron jobs
# including heavy browser automation, with a chrome-reaper and a flock added
# after an overlap once drove load to 38. Sustained load is the new suspect.
#
# Run on the server:  sudo bash diagnose-503.sh 2>&1 | tee /tmp/diag.txt
set -u
hr() { echo; echo "===== $* ====="; }

# sysstat archives are sa<DD>; locate one for a given day-of-month.
sa_for() { local d="$1"; for p in "/var/log/sysstat/sa$d" "/var/log/sa/sa$d"; do [ -f "$p" ] && { echo "$p"; return; }; done; }

hr "0. Host check"
echo "  hostname : $(hostname)"
echo "  public IP: $(curl -fsS --max-time 6 https://checkip.amazonaws.com 2>/dev/null || echo unknown)"

hr "1. The nginx vhost serving new.synergymedicalstaffing.com"
for f in $(grep -rl "new\.synergymedicalstaffing\.com" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null); do
  echo "### $f"; cat "$f"; echo
done

hr "2. Directives that can produce a 503 (rate limiting / upstream health)"
grep -rn "limit_req\|limit_conn\|max_fails\|fail_timeout\|^\s*upstream " /etc/nginx/ 2>/dev/null | grep -v Binary

hr "3. The node process on :8080"
ss -tlnp 2>/dev/null | grep ':8080' || echo "nothing on 8080"
pid=$(ss -tlnpH 2>/dev/null | grep ':8080' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
if [ -n "${pid:-}" ]; then
  echo "--- cmdline ---"; tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null; echo
  echo "--- running since ---"; ps -o lstart= -p "$pid" 2>/dev/null
fi

hr "4. Process managers"
sudo -u ubuntu pm2 list 2>/dev/null || echo "(pm2 list unavailable)"

hr "5. REAL 503s in the access log"
# NOTE: pass 1 grepped for ' 503 ' and matched the BYTE COUNT column, not the
# status. In nginx combined format $9 is the status and $10 the bytes sent.
for f in /var/log/nginx/*access.log; do
  [ -f "$f" ] && awk -v F="$f" '$9==503 {print F": "$4" "$7}' "$f"
done 2>/dev/null | tail -40
for f in /var/log/nginx/*access.log.*.gz; do
  [ -f "$f" ] && zcat "$f" 2>/dev/null | awk -v F="$f" '$9==503 {print F": "$4" "$7}'
done 2>/dev/null | tail -40
echo "--- how far back do the logs go? ---"
ls -la /var/log/nginx/ 2>/dev/null | head -25

hr "6. nginx error log (this is where the 503 reason lives)"
tail -60 /var/log/nginx/error.log 2>/dev/null || echo "(no error.log)"
for f in /var/log/nginx/error.log.*.gz; do
  [ -f "$f" ] && { echo "### $f"; zcat "$f" 2>/dev/null | grep -iE "upstream|limiting|503" | tail -20; }
done 2>/dev/null

hr "7. The monitor's own log (bin/uptime.js)"
tail -80 /home/ubuntu/synergy-web/logs/uptime.log 2>/dev/null || echo "(no uptime.log)"

hr "8. Load during the Sept 3 outage (01:10-01:40 EDT)"
f=$(sa_for 03); [ -n "$f" ] && LC_ALL=C sar -q -f "$f" -s 00:50:00 -e 02:00:00 2>/dev/null || echo "(no sysstat for the 3rd)"

hr "9. Load during the Aug 28 outage (22:20-23:20 EDT)"
f=$(sa_for 28); [ -n "$f" ] && LC_ALL=C sar -q -f "$f" -s 21:50:00 -e 23:40:00 2>/dev/null || echo "(no sysstat for the 28th)"

hr "10. Memory during the Sept 3 window"
f=$(sa_for 03); [ -n "$f" ] && LC_ALL=C sar -r -f "$f" -s 00:50:00 -e 02:00:00 2>/dev/null | tail -15 || echo "(none)"

hr "11. Right now: load and top consumers"
uptime
ps -eo pcpu,pmem,rss,etime,comm --sort=-pcpu 2>/dev/null | head -15
echo "--- chrome processes: $(pgrep -c -f chrome 2>/dev/null || echo 0) ---"

hr "Done"
