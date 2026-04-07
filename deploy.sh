#!/usr/bin/env bash
set -e

DEPLOYMENT_ID="AKfycbzdRvRuH3WIYSR6N5ZUR71IJnm4QSzrLGR7uysiBCzLRE4Mn1WwKWEa-izpL9Gobdar"
BUILD_DATE=$(date '+%Y-%m-%d %H:%M')
DESC="${1:-deploy $(date '+%Y-%m-%d')}"

# Stamp build date into Game.html
sed -i '' "s/var BUILD_DATE = '[^']*'/var BUILD_DATE = '$BUILD_DATE'/" src/Game.html

echo "Build date: $BUILD_DATE"
clasp push
clasp deploy --deploymentId "$DEPLOYMENT_ID" --description "$DESC"
echo "Done."
