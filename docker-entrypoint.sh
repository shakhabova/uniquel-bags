#!/bin/sh
set -eu

mkdir -p "$DATA_DIR/images"
chown -R node:node "$DATA_DIR"
exec gosu node "$@"
