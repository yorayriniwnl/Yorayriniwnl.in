#!/usr/bin/env bash
# Rebuild every GLB from source.
#   BPY=/path/to/python-with-bpy ./art/build_all.sh
# Requires: Python 3.11 with `pip install bpy` (Blender 5.x as a module) and
# Node 22 (`npx @gltf-transform/cli`).
set -euo pipefail
cd "$(dirname "$0")/.."
BPY="${BPY:-python3.11}"
TMP="$(mktemp -d)"
"$BPY" art/build_operator.py "$TMP/operator.glb"
"$BPY" art/build_husky.py "$TMP/husky.glb"
"$BPY" art/build_props.py "$TMP/props.glb"
mkdir -p public/models
for name in operator husky props; do
  npx --yes @gltf-transform/cli@4.5.1 optimize "$TMP/$name.glb" "public/models/$name.glb" \
    --compress meshopt --flatten false --join false --instance false --palette false \
    --simplify true --simplify-error 0.0006 --texture-compress webp --texture-size 1024
done
ls -la public/models
