#!/usr/bin/env bash
#
# One-command R2 setup for the coursewise-api Worker.
#
# What this does (idempotent):
#   1. Creates the R2 bucket `coursewise-files` if it doesn't exist.
#   2. Prompts for the three R2 S3-API credentials and uploads them as
#      Worker secrets (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).
#   3. Optionally uploads R2_PUBLIC_ENDPOINT if you've wired a custom domain.
#
# Prerequisites:
#   - `wrangler login` already run.
#   - You've created an R2 API token in the Cloudflare dashboard
#     (My Profile → API Tokens → Create Token → R2 Token, scoped to
#     Object Read & Write on the `coursewise-files` bucket). The token's
#     "Access Key ID" and "Secret Access Key" go into the prompts below.
#     The "Account ID" is the long hex string at the top of your R2
#     dashboard (also visible via `wrangler whoami`).
#
# Run this from anywhere — it cds into apps/api before talking to wrangler.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$SCRIPT_DIR/.."

BUCKET="${R2_BUCKET_NAME:-coursewise-files}"

echo
echo "=== CourseWise R2 setup ==="
echo "Bucket name: $BUCKET"
echo

# Find a wrangler invocation that works in this shell. Prefer a direct
# `wrangler` on PATH; fall back to the locally-installed copy via pnpm or npx.
if command -v wrangler >/dev/null 2>&1; then
  WRANGLER=(wrangler)
elif command -v pnpm >/dev/null 2>&1 && pnpm exec wrangler --version >/dev/null 2>&1; then
  WRANGLER=(pnpm exec wrangler)
elif command -v npx >/dev/null 2>&1; then
  WRANGLER=(npx --no-install wrangler)
else
  echo "error: could not find wrangler. Install with: npm i -g wrangler" >&2
  exit 1
fi

echo "Step 1/3: ensuring R2 bucket exists…"
if "${WRANGLER[@]}" r2 bucket create "$BUCKET" 2>&1 | tee /tmp/coursewise-r2-create.log; then
  echo "  ✓ bucket ready."
else
  # Cloudflare returns a non-zero exit if the bucket already exists. Treat that as success.
  if grep -qi "already exists" /tmp/coursewise-r2-create.log; then
    echo "  ✓ bucket already exists — nothing to do."
  else
    echo "  ✗ failed to create bucket. Check the wrangler output above." >&2
    exit 1
  fi
fi
rm -f /tmp/coursewise-r2-create.log

echo
echo "Step 2/3: uploading the three R2 secrets as Worker secrets…"
echo "(each prompt below pipes your input into 'wrangler secret put' — your value is not echoed)"
echo

put_secret() {
  local name="$1"
  local label="$2"
  local value
  printf "  %-22s : " "$label"
  read -rs value
  printf '\n'
  if [[ -z "$value" ]]; then
    echo "  skipping $name (no value entered)"
    return
  fi
  printf '%s' "$value" | "${WRANGLER[@]}" secret put "$name" >/dev/null
  echo "  ✓ $name set."
}

put_secret R2_ACCOUNT_ID       "R2 account ID"
put_secret R2_ACCESS_KEY_ID    "R2 access key ID"
put_secret R2_SECRET_ACCESS_KEY "R2 secret access key"

echo
echo "Step 3/3: (optional) R2_PUBLIC_ENDPOINT for a custom CDN host"
echo "  Leave blank to fall back to the default *.r2.cloudflarestorage.com host."
printf "  %-22s : " "R2 public endpoint"
read -r public_endpoint
if [[ -n "$public_endpoint" ]]; then
  printf '%s' "$public_endpoint" | "${WRANGLER[@]}" secret put R2_PUBLIC_ENDPOINT >/dev/null
  echo "  ✓ R2_PUBLIC_ENDPOINT set."
else
  echo "  skipping R2_PUBLIC_ENDPOINT."
fi

echo
echo "=== Done. ==="
echo "Verify with: wrangler secret list"
echo "Then redeploy if the secrets weren't already on the live Worker:"
echo "  pnpm --filter @coursewise/api deploy"
echo
