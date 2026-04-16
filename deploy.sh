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
clasp deploy --deploymentId "$DEPLOY_WEB" --description "$DESC"
clasp deploy --deploymentId "$DEPLOY_SLACK" --description "$DESC"
echo "Done. (web + slack deployments updated)"
