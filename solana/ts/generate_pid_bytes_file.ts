import fs from "fs";
import { PublicKey } from "@solana/web3.js";

if (process.argv.length < 4) {
  console.log("Usage: ts-node generate_pid_bin_file.ts <base58 program id> <output file>");
  process.exit(1);
}

const encodedString = process.argv[2];
const filename = process.argv[3];

try {
  fs.writeFileSync(filename, new PublicKey(encodedString).toBytes(), { encoding: "binary" });
} catch (err) {
  console.error(err);
  process.exit(1);
}
