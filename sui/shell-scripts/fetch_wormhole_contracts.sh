#!/bin/bash

### Navigate back to the root of this program directory
cd $(dirname $0)/..

### This directory should already exist, but attempting to make
### it just in case.
mkdir -p dependencies
cd dependencies

### Is wormhole built already? Bail out if so
WORMHOLE_BYTECODE=./Wormhole/bytecode_modules/*.mv
TOKEN_BRIDGE_BYTECODE=./TokenBridge/bytecode_modules/*.mv
ls $WORMHOLE_BYTECODE $TOKEN_BRIDGE_BYTECODE > /dev/null 2>&1
if [ $? -eq 0 ]; then
    exit 0;
fi

### Clone the repo (main branch)
echo "fetching Sui programs from wormhole repo"
git clone \
    --depth 1 \
    --branch main \
    --filter=blob:none \
    --sparse \
    https://github.com/wormhole-foundation/wormhole \
    tmp-wormhole > /dev/null 2>&1
cd tmp-wormhole

### Checkout sui directory and move that to this program directory
git sparse-checkout set sui > /dev/null 2>&1

### Move source
cd ..
mv -fn tmp-wormhole/sui/wormhole .
mv -fn tmp-wormhole/sui/token_bridge .
rm -rf tmp-wormhole

sed -i 's/wormhole = \"0x0\"/wormhole = "_"/g' wormhole/Move.toml
sed -i 's/token_bridge = \"0x0\"/token_bridge = "_"/g' token_bridge/Move.toml

### Done
exit 0
