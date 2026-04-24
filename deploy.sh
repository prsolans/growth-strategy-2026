#!/usr/bin/env bash
set -e

DEPLOY_WEB="AKfycbzdRvRuH3WIYSR6N5ZUR71IJnm4QSzrLGR7uysiBCzLRE4Mn1WwKWEa-izpL9Gobdar"
DEPLOY_SLACK="AKfycbzEAFeCSMYVLEmaBo_p7qJgpXXMNdN2e_JraK0R68pSpS7lfxPky4AdSxwqAqZpiooe"
BUILD_DATE=$(date '+%Y-%m-%d %H:%M')
DESC="${1:-deploy $(date '+%Y-%m-%d')}"

# Stamp build date into Game.html
sed -i '' "s/var BUILD_DATE = '[^']*'/var BUILD_DATE = '$BUILD_DATE'/" src/Game.html

echo "Build date: $BUILD_DATE"
clasp push

# Create ONE version and point both deployments at it (saves version slots)
VERSION_OUTPUT=$(clasp version "$DESC")
VERSION=$(echo "$VERSION_OUTPUT" | grep -oE '[0-9]+' | tail -1)
echo "Created version $VERSION"

clasp deploy -i "$DEPLOY_WEB" -V "$VERSION" -d "$DESC"
clasp deploy -i "$DEPLOY_SLACK" -V "$VERSION" -d "$DESC"
echo "Done. Both deployments updated to version $VERSION."
