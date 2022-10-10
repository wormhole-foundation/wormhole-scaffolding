#!/bin/bash


###############################################################################
#
#   WARNING!
#
#   This is a temporary script until the wormhole SDK merges a specific PR.
#
###############################################################################

### Is the wormhole program built already? Bail out if so
ls wormhole-sdk-js > /dev/null 2>&1
if [ $? -eq 0 ]; then
    exit 0;
fi

### Clone the repo (main branch is dev.v2)
echo "fetching wormhole-sdk from wormhole repo"
git clone \
    --depth 1 \
    --branch sdk/remove-wasm \
    --filter=blob:none \
    --sparse \
    https://github.com/wormhole-foundation/wormhole \
    tmp-wormhole > /dev/null 2>&1
cd tmp-wormhole

### Checkout sdk/js directory and move that to the dependencies directory
git sparse-checkout set sdk ethereum solana > /dev/null 2>&1

### To prevent tsc (Typescript compiler) to traverse parent directories,
### we need to modify tsconfig.json in sdk/js
cd sdk/js
jq '.compilerOptions += {typeRoots: ["./node_modules/@types"]}' tsconfig.json > tmp.tsconfig.json
cat tmp.tsconfig.json > tsconfig.json
rm tmp.tsconfig.json

### Now build wormhole-sdk
cd ../../ethereum
npm ci
cd ../sdk/js
npm ci && npm run build
cd ../../..
mv tmp-wormhole/sdk/js wormhole-sdk-js
rm -rf tmp-wormhole

### Done
exit 0