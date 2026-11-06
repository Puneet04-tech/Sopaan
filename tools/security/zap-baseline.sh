#!/usr/bin/env bash
# OWASP ZAP baseline against the API (design 8.1: "OWASP ZAP baseline").
#
#   ./tools/security/zap-baseline.sh http://localhost:8080
#
# Requires docker. The scan is passive: it reports what an unauthenticated caller can see.
# Anything in the report marked High is a release blocker; the goal is a clean baseline, not
# a green tick on a broken build.
set -euo pipefail

TARGET="${1:-http://localhost:8080}"
OUT_DIR="${PWD}/reports/zap"
mkdir -p "${OUT_DIR}"

docker run --rm -t --network host \
  -v "${OUT_DIR}:/zap/wrk:rw" \
  ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t "${TARGET}" \
  -J baseline.json \
  -r baseline.html \
  -w baseline.md \
  -m 2 \
  -z "-config scanner.strength=MEDIUM"

echo "Reports written to ${OUT_DIR}"
