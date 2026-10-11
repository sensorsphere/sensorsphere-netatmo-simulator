#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
command -v docker >/dev/null 2>&1 || { echo 'Docker required' >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo 'Compose v2 required' >&2; exit 1; }
case "${1:-help}" in
 install|update) docker compose config --quiet && docker compose up -d --build && docker compose ps ;;
 status) docker compose ps ;;
 logs) docker compose logs --tail=100 netatmo-simulator ;;
 stop) docker compose stop netatmo-simulator ;;
 *) echo 'Usage: install.sh {install|update|status|logs|stop}' ;;
esac
