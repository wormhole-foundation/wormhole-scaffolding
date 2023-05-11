#!/usr/bin/env bash

set -euo pipefail

# Help message
function usage() {
cat <<EOF >&2
Deploy and initialize Sui core bridge and token bridge contracts to the
specified network. Additionally deploys an example messaging contract in
devnet.
  Usage: $(basename "$0") <network> [options]
  Positional args:
    <network>          Network to deploy to (devnet, testnet, mainnet)
  Options:
    -k, --private-key  Use given key to sign transactions
    -h, --help         Show this help message
EOF
exit 1
}

# If positional args are missing, print help message and exit
if [ $# -lt 1 ]; then
  usage
fi

# Default values
PRIVATE_KEY_ARG=

# Set network
NETWORK=$1 || usage
shift

# Set guardian address
if [ "$NETWORK" = mainnet ]; then
  echo "Mainnet not supported yet"
  exit 1
elif [ "$NETWORK" = testnet ]; then
  echo "Testnet not supported yet"
  exit 1
elif [ "$NETWORK" = devnet ]; then
  GUARDIAN_ADDR=befa429d57cd18b7f8a4d91a2da9ab4af05d0fbe
else
  usage
fi

# Parse short/long flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    -k|--private-key)
      PRIVATE_KEY_ARG="-k $2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

# Assumes this script is in a sibling directory to contract dirs
DIRNAME=$(dirname "$0")
WORMHOLE_PATH=$(realpath "$DIRNAME"/../wormhole)
TOKEN_BRIDGE_PATH=$(realpath "$DIRNAME"/../token_bridge)

echo -e "[1/4] Publishing core bridge contracts..."
WORMHOLE_PUBLISH_OUTPUT=$($(echo worm sui deploy "$WORMHOLE_PATH" -n "$NETWORK" "$PRIVATE_KEY_ARG"))
echo "$WORMHOLE_PUBLISH_OUTPUT"

echo -e "\n[2/4] Initializing core bridge..."
WORMHOLE_PACKAGE_ID=$(echo "$WORMHOLE_PUBLISH_OUTPUT" | grep -oP 'Published to +\K.*')
WORMHOLE_INIT_OUTPUT=$($(echo worm sui init-wormhole -n "$NETWORK" --initial-guardian "$GUARDIAN_ADDR" -p "$WORMHOLE_PACKAGE_ID" "$PRIVATE_KEY_ARG"))
WORMHOLE_STATE_OBJECT_ID=$(echo "$WORMHOLE_INIT_OUTPUT" | grep -oP 'Wormhole state object ID +\K.*')
echo "$WORMHOLE_INIT_OUTPUT"

echo -e "\n[3/4] Publishing token bridge contracts..."
TOKEN_BRIDGE_PUBLISH_OUTPUT=$($(echo worm sui deploy "$TOKEN_BRIDGE_PATH" -n "$NETWORK" "$PRIVATE_KEY_ARG"))
echo "$TOKEN_BRIDGE_PUBLISH_OUTPUT"

echo -e "\n[4/4] Initializing token bridge..."
TOKEN_BRIDGE_PACKAGE_ID=$(echo "$TOKEN_BRIDGE_PUBLISH_OUTPUT" | grep -oP 'Published to +\K.*')
TOKEN_BRIDGE_INIT_OUTPUT=$($(echo worm sui init-token-bridge -n "$NETWORK" -p "$TOKEN_BRIDGE_PACKAGE_ID" --wormhole-state "$WORMHOLE_STATE_OBJECT_ID" -"$PRIVATE_KEY_ARG"))
echo "$TOKEN_BRIDGE_INIT_OUTPUT"

echo -e "\nDeployments successful!"
