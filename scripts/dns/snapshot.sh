#!/usr/bin/env bash
# Снимок публичного DNS домена -> docs/dns/baseline.txt (формат dig +short, по секциям).
# Использование: bash scripts/dns/snapshot.sh [домен] [селекторы DKIM через запятую] [файл]
# Если dig не установлен, запросы идут через DNS-over-HTTPS (dns.google) с тем же форматом вывода.
set -euo pipefail

DOMAIN="${1:-krunai.uz}"
SELECTORS="${2:-${DKIM_SELECTORS:-zmail,zoho,zmail2,zmail3,default}}"
OUT="${3:-$(dirname "$0")/../../docs/dns/baseline.txt}"

query() { # имя тип
  local name="$1" type="$2"
  if command -v dig >/dev/null 2>&1; then
    dig +short "$type" "$name" | sort
  else
    curl -fsS -m 15 "https://dns.google/resolve?name=${name}&type=${type}" | node -e '
      let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
        const a = JSON.parse(s).Answer || [];
        const t = { NS: 2, CNAME: 5, MX: 15, TXT: 16 }["'"$type"'"];
        console.log(a.filter(r => r.type === t).map(r => r.data).sort().join("\n"));
      });' | sed '/^$/d'
  fi
}

section() { # заголовок имя тип
  echo "## $1 ($3 $2)"
  query "$2" "$3"
  echo
}

{
  echo "# Снимок публичного DNS: ${DOMAIN}"
  echo "# Дата: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Источник: $(command -v dig >/dev/null 2>&1 && echo 'dig +short' || echo 'DNS-over-HTTPS dns.google (dig не найден), формат как у dig +short')"
  echo "# Только чтение. Эти записи НЕ менять (почта в Zoho)."
  echo
  section "NS" "$DOMAIN" NS
  section "MX" "$DOMAIN" MX
  section "TXT apex" "$DOMAIN" TXT
  section "TXT _dmarc" "_dmarc.${DOMAIN}" TXT
  IFS=',' read -ra SELS <<<"$SELECTORS"
  for s in "${SELS[@]}"; do
    section "DKIM ${s} TXT" "${s}._domainkey.${DOMAIN}" TXT
    section "DKIM ${s} CNAME" "${s}._domainkey.${DOMAIN}" CNAME
  done
} >"$OUT"

echo "Сохранено: $OUT"
