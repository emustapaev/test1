#!/usr/bin/env bash
# Пост-деплойная smoke-проверка критериев приёмки ТЗ v5 (разд. 2).
# Env: SITE_URL, API_ENDPOINT, SITE_BUCKET (обязательные);
#      CUSTOM_DOMAIN_ENABLED=true — проверить редирект www (по умолчанию false);
#      AWS_REGION — регион бакета для прямого S3 URL (по умолчанию us-east-1).
# Реальные письма не отправляются: POST только с заведомо невалидным телом (400 до SES)
# и preflight/запросы с чужим Origin.
set -euo pipefail

: "${SITE_URL:?SITE_URL не задан}"
: "${API_ENDPOINT:?API_ENDPOINT не задан}"
: "${SITE_BUCKET:?SITE_BUCKET не задан}"
CUSTOM_DOMAIN_ENABLED="${CUSTOM_DOMAIN_ENABLED:-false}"
REGION="${AWS_REGION:-us-east-1}"

SITE_URL="${SITE_URL%/}"
API_ENDPOINT="${API_ENDPOINT%/}"
EVIL_ORIGIN="https://evil.example"
CURL=(curl -sS --max-time 20 -o /dev/null)

failures=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1" >&2; failures=$((failures + 1)); }

# check_status <описание> <ожидаемый код> <curl-аргументы...>
check_status() {
  local desc="$1" expected="$2" code
  shift 2
  code=$("${CURL[@]}" -w '%{http_code}' "$@" || echo "000")
  if [ "$code" = "$expected" ]; then
    pass "$desc (HTTP $code)"
  else
    fail "$desc: ожидалось $expected, получено $code"
  fi
}

# AC1: сайт отвечает 200
check_status "GET ${SITE_URL}/en/" 200 "${SITE_URL}/en/"
check_status "GET ${SITE_URL}/ru/" 200 "${SITE_URL}/ru/"

# AC1: прямой доступ к S3 закрыт (OAC, Block Public Access)
check_status "Прямой S3 URL закрыт" 403 \
  "https://${SITE_BUCKET}.s3.${REGION}.amazonaws.com/index.html"

# AC2: www -> apex, 301 с сохранением пути и query (только при включённом домене)
if [ "$CUSTOM_DOMAIN_ENABLED" = "true" ]; then
  host="${SITE_URL#https://}"
  www_resp=$(curl -sS --max-time 20 -o /dev/null -w '%{http_code} %{redirect_url}' \
    "https://www.${host}/foo?x=1" || echo "000 ")
  if [ "$www_resp" = "301 ${SITE_URL}/foo?x=1" ]; then
    pass "www -> apex 301 (${www_resp#* })"
  else
    fail "www redirect: ожидалось '301 ${SITE_URL}/foo?x=1', получено '${www_resp}'"
  fi
else
  echo "SKIP: проверка www (CUSTOM_DOMAIN_ENABLED!=true)"
fi

# AC4: невалидные данные -> 400 (пустое имя; письмо не отправляется)
check_status "POST /contact с пустым именем" 400 \
  -X POST "${API_ENDPOINT}/contact" \
  -H 'Content-Type: application/json' \
  --data '{"name":"","email":"smoke@example.com","message":"smoke test","lang":"en","website":""}'
check_status "POST /contact с некорректным email" 400 \
  -X POST "${API_ENDPOINT}/contact" \
  -H 'Content-Type: application/json' \
  --data '{"name":"Smoke","email":"not-an-email","message":"smoke test","lang":"en","website":""}'

# CORS: чужой origin не должен получить Access-Control-Allow-Origin
cors_headers=$(curl -sS --max-time 20 -D - -o /dev/null -X OPTIONS "${API_ENDPOINT}/contact" \
  -H "Origin: ${EVIL_ORIGIN}" \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' | tr -d '\r' || true)
acao=$(printf '%s\n' "$cors_headers" | grep -i '^access-control-allow-origin:' || true)
if [ -z "$acao" ]; then
  pass "CORS: чужой origin отклонён"
else
  case "$acao" in
    *"*"* | *"$EVIL_ORIGIN"*) fail "CORS: чужой origin разрешён (${acao})" ;;
    *) pass "CORS: чужой origin не разрешён (${acao})" ;;
  esac
fi

if [ "$failures" -gt 0 ]; then
  echo "Smoke-проверка провалена: ${failures}" >&2
  exit 1
fi
echo "Smoke-проверка пройдена"
