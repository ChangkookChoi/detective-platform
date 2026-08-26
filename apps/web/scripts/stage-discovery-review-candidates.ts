import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { config } from "dotenv";

import { closeDatabase } from "../src/db";
import {
  parseDiscoveryReviewCandidates,
  stageDiscoveryReviewCandidates,
} from "../src/modules/moderation/discovery-review-intake";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

function readArguments() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf("--input");
  if (inputIndex < 0 || !args[inputIndex + 1]) {
    throw new Error(
      "Usage: db:stage-discovery-reviews -- --input <private-jsonl> [--apply]",
    );
  }
  return { input: args[inputIndex + 1], apply: args.includes("--apply") };
}

async function loadPrivateInput(inputPath: string) {
  const repositoryRoot = resolve(process.cwd(), "../..");
  const privateRoot = resolve(repositoryRoot, "data/private");
  const resolvedInput = resolve(process.cwd(), inputPath);
  if (
    resolvedInput !== privateRoot &&
    !resolvedInput.startsWith(`${privateRoot}${sep}`)
  ) {
    throw new Error("discovery_intake_input_must_be_private");
  }
  const fileStat = await stat(resolvedInput);
  if (!fileStat.isFile() || (fileStat.mode & 0o077) !== 0) {
    throw new Error("discovery_intake_input_permissions_invalid");
  }
  return readFile(resolvedInput, "utf8");
}

async function main() {
  const args = readArguments();
  const parsed = parseDiscoveryReviewCandidates(
    await loadPrivateInput(args.input),
  );
  const summary = await stageDiscoveryReviewCandidates({
    parsed,
    dryRun: !args.apply,
    actorId: process.env.DISCOVERY_INTAKE_ACTOR_ID,
  });
  console.log(
    JSON.stringify({
      ok: true,
      ...summary,
      reasonCounts: parsed.reasonCounts,
    }),
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "unknown_error",
      }),
    );
    process.exitCode = 1;
  })
  .finally(closeDatabase);
