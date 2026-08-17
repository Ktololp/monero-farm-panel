#!/usr/bin/env bash
set -euo pipefail

: "${MONEROD_CONFIG_PATH:=}"
: "${MONEROD_SERVICE_UNIT:=monerod.service}"
: "${EXPERIMENT_ACTION:=snapshot}"
: "${SNAPSHOT_PATH:=}"

if [ -z "$MONEROD_CONFIG_PATH" ] || [ ! -f "$MONEROD_CONFIG_PATH" ]; then
  echo "monerod config file not found: $MONEROD_CONFIG_PATH" >&2
  exit 2
fi
case "$MONEROD_CONFIG_PATH" in /*) ;; *) echo "monerod config path must be absolute" >&2; exit 3 ;; esac

safe_snapshot_path() {
  case "$1" in
    "${MONEROD_CONFIG_PATH}.mfp-tor-experiment-"*) return 0 ;;
    *) return 1 ;;
  esac
}

case "$EXPERIMENT_ACTION" in
  snapshot)
    SNAPSHOT_PATH="${MONEROD_CONFIG_PATH}.mfp-tor-experiment-$(date +%Y%m%d%H%M%S)-$$"
    cp -a "$MONEROD_CONFIG_PATH" "$SNAPSHOT_PATH"
    CONFIG_SHA="$(sha256sum "$MONEROD_CONFIG_PATH" | awk '{print $1}')"
    SNAPSHOT_SHA="$(sha256sum "$SNAPSHOT_PATH" | awk '{print $1}')"
    [ "$CONFIG_SHA" = "$SNAPSHOT_SHA" ] || { echo "snapshot checksum mismatch" >&2; exit 4; }
    printf 'MFP_SNAPSHOT_PATH=%s\n' "$SNAPSHOT_PATH"
    printf 'MFP_SNAPSHOT_SHA256=%s\n' "$SNAPSHOT_SHA"
    echo "Created exact pre-experiment monerod config checkpoint: $SNAPSHOT_PATH"
    ;;
  restore)
    if [ -z "$SNAPSHOT_PATH" ] || ! safe_snapshot_path "$SNAPSHOT_PATH" || [ ! -f "$SNAPSHOT_PATH" ]; then
      echo "invalid or missing experiment snapshot: $SNAPSHOT_PATH" >&2
      exit 5
    fi
    SNAPSHOT_SHA="$(sha256sum "$SNAPSHOT_PATH" | awk '{print $1}')"
    CURRENT_SHA="$(sha256sum "$MONEROD_CONFIG_PATH" | awk '{print $1}')"
    if [ "$SNAPSHOT_SHA" = "$CURRENT_SHA" ]; then
      printf 'MFP_RESTORED=0\n'
      printf 'MFP_RESTORED_SHA256=%s\n' "$CURRENT_SHA"
      echo "Current monerod config already matches the pre-experiment checkpoint; service restart skipped."
      exit 0
    fi
    cp -a "$SNAPSHOT_PATH" "$MONEROD_CONFIG_PATH"
    RESTORED_SHA="$(sha256sum "$MONEROD_CONFIG_PATH" | awk '{print $1}')"
    [ "$SNAPSHOT_SHA" = "$RESTORED_SHA" ] || { echo "restored config checksum mismatch" >&2; exit 6; }
    systemctl restart "$MONEROD_SERVICE_UNIT"
    printf 'MFP_RESTORED=1\n'
    printf 'MFP_RESTORED_SHA256=%s\n' "$RESTORED_SHA"
    echo "Restored exact pre-experiment monerod config and restarted $MONEROD_SERVICE_UNIT"
    ;;
  *)
    echo "invalid EXPERIMENT_ACTION: $EXPERIMENT_ACTION" >&2
    exit 7
    ;;
esac
