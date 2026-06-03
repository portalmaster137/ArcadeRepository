#!/bin/sh
set -e

# Write any RUNTIME_ prefixed environment variables into a JS file
# that gets loaded before the app bundle. Useful for values that
# aren't known at image build time (e.g. dynamic API URLs in k8s).
#
# Usage in index.html:  <script src="/env-config.js"></script>
# Usage in code:        window.__ENV__.VITE_API_URL

ENV_FILE=/usr/share/nginx/html/env-config.js

echo "window.__ENV__ = {" > "$ENV_FILE"

env | grep '^RUNTIME_' | while IFS='=' read -r key value; do
    # Strip the RUNTIME_ prefix to get the original var name
    short_key="${key#RUNTIME_}"
    # Escape double quotes in value
    escaped_value=$(printf '%s' "$value" | sed 's/"/\\"/g')
    echo "  \"$short_key\": \"$escaped_value\"," >> "$ENV_FILE"
done

echo "};" >> "$ENV_FILE"

exec "$@"
