#!/usr/bin/env bash
# Проверка после применения DNS (FR-1..FR-3). Только читает, ничего не меняет.
# Использование:
#   bash scripts/dns/verify.sh --domain krunai.uz --canonical krunai.uz \
#     --outputs tf-outputs.json --baseline docs/dns/baseline.txt [--region eu-west-3] [--skip-aws]
# Нужны: curl, jq; dig (если нет — запросы идут через DNS-over-HTTPS dns.google); aws cli — опционально.
# Код возврата: 0 — нет FAIL, 1 — есть FAIL, 2 — ошибка параметров.
set -uo pipefail

DOMAIN="krunai.uz"
CANONICAL=""
OUTPUTS=""
BASELINE="$(dirname "$0")/../../docs/dns/baseline.txt"
REGION="eu-west-3"
SKIP_AWS=0

usage() {
  echo "Использование: $0 --domain D --canonical HOST --outputs outputs.json --baseline baseline.txt [--region R] [--skip-aws]" >&2
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --canonical) CANONICAL="${2:-}"; shift 2 ;;
    --outputs) OUTPUTS="${2:-}"; shift 2 ;;
    --baseline) BASELINE="${2:-}"; shift 2 ;;
    --region) REGION="${2:-}"; shift 2 ;;
    --skip-aws) SKIP_AWS=1; shift ;;
    -h | --help) usage ;;
    *) echo "Неизвестный параметр: $1" >&2; usage ;;
  esac
done

[ -n "$DOMAIN" ] || usage
CANONICAL="${CANONICAL:-$DOMAIN}"
if [ ! -f "$OUTPUTS" ]; then echo "Не найден файл outputs: '${OUTPUTS}'" >&2; usage; fi
[ -f "$BASELINE" ] || { echo "Не найден baseline: '${BASELINE}'" >&2; usage; }
for tool in curl jq; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Нужен $tool" >&2; exit 2; }
done

FAILS=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; if [ -n "${2:-}" ]; then printf '%s\n' "$2" | sed 's/^/        /'; fi; FAILS=$((FAILS + 1)); }
skip() { echo "SKIP  $1"; }

# Нормализация: без пустых строк, нижний регистр, без точки на конце, сортировка.
norm() { sed 's/\r$//; s/\.$//; /^[[:space:]]*$/d' | tr 'A-Z' 'a-z' | sort -u; }

# query ИМЯ ТИП -> значения построчно (формат dig +short)
query() {
  local name="$1" type="$2"
  if command -v dig >/dev/null 2>&1; then
    dig +short "$type" "$name"
  else
    local code
    case "$type" in CNAME) code=5 ;; MX) code=15 ;; TXT) code=16 ;; *) return 1 ;; esac
    curl -fsS -m 15 "https://dns.google/resolve?name=${name}&type=${type}" |
      jq -r --argjson t "$code" '(.Answer // [])[] | select(.type == $t) | .data'
  fi
}

# TXT у dig приходит в кавычках, длинные значения разбиты на части: "a" "b" -> ab
unquote_txt() { sed 's/" "//g; s/^"//; s/"$//'; }

# section ЗАГОЛОВОК -> строки секции baseline
section() {
  awk -v h="## $1 (" 'index($0, h) == 1 { on = 1; next } /^## / { on = 0 } on' "$BASELINE"
}

# ---- 1. Почта Zoho не изменилась (FR-2) ----
compare() { # метка заголовок-в-baseline имя тип
  local label="$1" head="$2" name="$3" type="$4" cur base
  base="$(section "$head" | unquote_txt | norm)"
  cur="$(query "$name" "$type" | unquote_txt | norm)"
  if [ "$cur" = "$base" ]; then
    pass "$label совпадает с baseline"
  else
    fail "$label отличается от baseline" "baseline: $(echo "$base" | tr '\n' '|')
сейчас:   $(echo "$cur" | tr '\n' '|')"
  fi
}
compare "MX ${DOMAIN}" "MX" "$DOMAIN" MX
compare "TXT apex (SPF) ${DOMAIN}" "TXT apex" "$DOMAIN" TXT
compare "TXT _dmarc.${DOMAIN}" "TXT _dmarc" "_dmarc.${DOMAIN}" TXT

# ---- 2. Записи SES из outputs (FR-2) ----
# Имена в outputs могут быть с точкой на конце и без .domain — приводим к FQDN.
fqdn() { local n="${1%.}"; case "$n" in *".${DOMAIN}" | "$DOMAIN") echo "$n" ;; *) echo "${n}.${DOMAIN}" ;; esac; }

check_record() { # метка имя тип ожидаемое
  local label="$1" name="$2" type="$3" want="$4" got
  got="$(query "$name" "$type" | unquote_txt | norm)"
  if echo "$got" | grep -Fxq -- "$(printf '%s\n' "$want" | norm)"; then
    pass "$label"
  else
    fail "$label" "$type $name: ожидалось '${want}', получено '$(echo "$got" | tr '\n' '|')'"
  fi
}

dkim_count=0
while IFS=$'\t' read -r name type value; do
  [ -n "$name" ] || continue
  dkim_count=$((dkim_count + 1))
  check_record "DKIM SES $(fqdn "$name")" "$(fqdn "$name")" "$type" "$value"
done < <(jq -r '(.ses_dkim_records.value // [])[] | [.name, .type, .value] | @tsv' "$OUTPUTS")
if [ "$dkim_count" -eq 3 ]; then pass "В outputs 3 DKIM CNAME"; else fail "В outputs ожидалось 3 DKIM CNAME, найдено ${dkim_count}"; fi

mf_count=0
while IFS=$'\t' read -r name type value; do
  [ -n "$name" ] || continue
  mf_count=$((mf_count + 1))
  check_record "MAIL FROM ${type} $(fqdn "$name")" "$(fqdn "$name")" "$type" "$value"
done < <(jq -r '(.ses_mail_from_records.value // [])[] | [.name, .type, .value] | @tsv' "$OUTPUTS")
if [ "$mf_count" -eq 2 ]; then pass "В outputs MAIL FROM MX и TXT"; else fail "В outputs ожидалось 2 записи MAIL FROM, найдено ${mf_count}"; fi

# ---- 3. Сайт: HTTPS, редиректы (FR-3) ----
if [ "$CANONICAL" = "$DOMAIN" ]; then OTHER="www.${DOMAIN}"; else OTHER="$DOMAIN"; fi

# status_of URL -> "код|Location" ; при ошибке TLS/сети код 000
head_of() {
  local out rc
  out="$(curl -sI -m 20 -o - -w '\n%{http_code}' "$1")"; rc=$?
  if [ $rc -ne 0 ]; then echo "000|curl exit $rc"; return; fi
  local code loc
  code="$(printf '%s\n' "$out" | tail -n1)"
  loc="$(printf '%s\n' "$out" | tr -d '\r' | awk 'tolower($1) == "location:" { print $2; exit }')"
  echo "${code}|${loc}"
}

for host in "$CANONICAL" "$OTHER"; do
  if [ "$host" = "$CANONICAL" ]; then role="канонический"; else role="неканонический"; fi
  r="$(head_of "https://${host}/")"; code="${r%%|*}"; loc="${r#*|}"
  if [ "$host" = "$CANONICAL" ]; then
    case "$code" in
      2??) pass "https://${host} (${role}) отвечает ${code}, сертификат валиден" ;;
      *) fail "https://${host} (${role}): код ${code} ${loc}" ;;
    esac
  else
    if [ "$code" = "301" ] && case "$loc" in "https://${CANONICAL}" | "https://${CANONICAL}/"*) true ;; *) false ;; esac; then
      pass "https://${host} (${role}) → 301 ${loc}"
    else
      fail "https://${host} (${role}): ожидался 301 на https://${CANONICAL}, получено ${code} ${loc}"
    fi
  fi
done

for host in "$CANONICAL" "$OTHER"; do
  r="$(head_of "http://${host}/")"; code="${r%%|*}"; loc="${r#*|}"
  if [ "$code" = "301" ] && case "$loc" in https://*) true ;; *) false ;; esac; then
    pass "http://${host} → 301 ${loc}"
  else
    fail "http://${host}: ожидался 301 на https, получено ${code} ${loc}"
  fi
done

# ---- 4. SES API (опционально) ----
if [ "$SKIP_AWS" -eq 1 ]; then
  skip "SES identity (--skip-aws)"
elif ! command -v aws >/dev/null 2>&1; then
  skip "SES identity (aws cli не установлен)"
elif ! aws sts get-caller-identity --region "$REGION" >/dev/null 2>&1; then
  skip "SES identity (нет AWS-креденшелов)"
else
  ses="$(aws sesv2 get-email-identity --email-identity "$DOMAIN" --region "$REGION" --output json 2>&1)" || ses=""
  if [ -z "$ses" ] || ! echo "$ses" | jq -e . >/dev/null 2>&1; then
    fail "SES get-email-identity ${DOMAIN}" "$ses"
  else
    ses_check() { # метка jq-выражение ожидаемое
      local got
      got="$(echo "$ses" | jq -r "$2")"
      if [ "$got" = "$3" ]; then pass "$1 = $got"; else fail "$1: ожидалось $3, получено $got"; fi
    }
    ses_check "SES VerifiedForSendingStatus" '.VerifiedForSendingStatus' true
    ses_check "SES DkimAttributes.Status" '.DkimAttributes.Status' SUCCESS
    ses_check "SES MailFromAttributes.MailFromDomainStatus" '.MailFromAttributes.MailFromDomainStatus' SUCCESS
  fi
fi

echo
if [ "$FAILS" -eq 0 ]; then echo "ИТОГ: PASS"; exit 0; fi
echo "ИТОГ: FAIL (${FAILS})"
exit 1
