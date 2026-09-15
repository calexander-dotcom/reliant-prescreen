#!/usr/bin/env bash
# Triage the intermittent 503 on https://new.synergymedicalstaffing.com/health
#
# Context: new.synergymedicalstaffing.com is an A record straight at this box
# (3.86.133.116). The site root stays up during the incidents while /health
# returns 503, which is the signature of a reverse proxy whose upstream app
# process is gone. This script finds out which process, and why.
#
# Run on the EC2 box:  sudo bash ops/triage-503.sh 2>&1 | tee /tmp/triage.txt
set -u

hr() { echo; echo "===== $* ====="; }

hr "1. Listening sockets (who owns 80/443 and the app port)"
ss -tlnp 2>/dev/null | grep -E ':(80|443|3000|8000|8080)\b' || echo "none found"

hr "2. Which web server is running"
for s in nginx caddy apache2 httpd traefik; do
  systemctl is-active --quiet "$s" 2>/dev/null && echo "ACTIVE: $s"
done

hr "3. Running app services"
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null \
  | grep -viE '^(systemd|dbus|cron|ssh|snap|polkit|rsyslog|getty|user@|networkd|resolved|chrony|amazon|acpid|multipathd|unattended|apparmor)' \
  || echo "none"

hr "4. Services with NO auto-restart (these stay dead after a crash)"
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | awk '{print $1}' | while read -r u; do
  [ "$(systemctl show -p Restart --value "$u" 2>/dev/null)" = "no" ] && echo "NO RESTART POLICY: $u"
done

hr "5. OOM kills  <-- prime suspect"
dmesg -T 2>/dev/null | grep -iE 'out of memory|oom-kill|killed process' | tail -20 || echo "nothing in dmesg"
journalctl --since "30 days ago" --no-pager 2>/dev/null | grep -iE 'oom-kill|killed process' | tail -20 || echo "nothing in journal"

hr "6. Memory headroom"
free -h
echo "--- swap ---"
swapon --show 2>/dev/null || echo "NO SWAP CONFIGURED (an OOM here kills the app outright)"

hr "7. What actually answers /health"
curl -s -o /dev/null -w "  127.0.0.1/health -> HTTP %{http_code}\n" http://127.0.0.1/health 2>/dev/null
curl -s -o /dev/null -w "  127.0.0.1/       -> HTTP %{http_code}\n" http://127.0.0.1/ 2>/dev/null
grep -rn "health" /etc/nginx/ /etc/caddy/ 2>/dev/null | head -20 || echo "no health route in proxy config"

hr "8. Recent 503s in the access log"
zgrep -h ' 503 ' /var/log/nginx/access.log* 2>/dev/null | tail -20 || echo "no nginx 503s found"

hr "9. Scheduled jobs on this box (car_watch + the site monitor both live here)"
crontab -l 2>/dev/null || echo "no root crontab"
for u in ubuntu www-data; do
  echo "--- crontab for $u ---"; crontab -u "$u" -l 2>/dev/null || echo "(none)"
done
ls -la /etc/cron.d/ 2>/dev/null
systemctl list-timers --no-pager 2>/dev/null | head -15

hr "10. Logs during the last known outage window (box local time, EDT)"
journalctl --since "2026-09-03 00:50" --until "2026-09-03 01:50" --no-pager 2>/dev/null | tail -40 || echo "journal unavailable"

hr "Done - output saved if you used: | tee /tmp/triage.txt"
