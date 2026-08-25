#!/usr/bin/env bash
# Local dev server (webpack-dev-server). Override the port with PORT=nnnnn.
set -euo pipefail
cd "$(dirname "$0")"
exec npx webpack serve --mode development
