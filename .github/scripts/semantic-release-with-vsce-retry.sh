#!/usr/bin/env bash

set -o pipefail

max_attempts=3
retry_delay_seconds=30
log_file=$(mktemp)
trap 'rm -f "$log_file"' EXIT

for ((attempt = 1; attempt <= max_attempts; attempt++)); do
  if npx semantic-release --extends ./publish.release.config.js 2>&1 | tee "$log_file"; then
    exit 0
  fi

  if ! grep -Fq 'Request timeout: /_apis/securityroles' "$log_file"; then
    exit 1
  fi

  if ((attempt == max_attempts)); then
    exit 1
  fi

  echo "Marketplace security roles request timed out; retrying in ${retry_delay_seconds}s (attempt $((attempt + 1))/${max_attempts})..." >&2
  sleep "$retry_delay_seconds"
done
