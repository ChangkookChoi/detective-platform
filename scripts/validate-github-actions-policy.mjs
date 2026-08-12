import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const workflowsDirectory = path.join(repositoryRoot, ".github", "workflows");
const workflowFiles = (await readdir(workflowsDirectory))
  .filter((file) => /\.ya?ml$/u.test(file))
  .sort();
const failures = [];

for (const file of workflowFiles) {
  const filePath = path.join(workflowsDirectory, file);
  const source = await readFile(filePath, "utf8");
  const lines = source.split("\n");

  if (!/^permissions:\s*$/mu.test(source)) {
    failures.push(`${file}: top-level permissions must be explicit`);
  }

  if (/^\s*pull_request_target:\s*$/mu.test(source)) {
    failures.push(`${file}: pull_request_target is not allowed`);
  }

  if (/^\s*permissions:\s*write-all\s*$/mu.test(source)) {
    failures.push(`${file}: write-all permissions are not allowed`);
  }

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const action = line.match(/^\s*uses:\s*([^\s#]+)/u);
    const runner = line.match(/^\s*runs-on:\s*([^\s#]+)/u);
    const postgresImage = line.match(
      /(?:image:|POSTGRES_CLIENT_IMAGE:)\s*(postgres:[^\s]+)/u,
    );

    if (action && !action[1].startsWith("./")) {
      if (!action[1].startsWith("actions/")) {
        failures.push(
          `${file}:${lineNumber}: only GitHub-owned actions/* actions are allowed`,
        );
      }

      if (!/@[0-9a-f]{40}$/u.test(action[1])) {
        failures.push(
          `${file}:${lineNumber}: external actions require a full commit SHA`,
        );
      }
    }

    if (runner && runner[1] !== "ubuntu-24.04") {
      failures.push(
        `${file}:${lineNumber}: only the standard ubuntu-24.04 runner is allowed`,
      );
    }

    if (postgresImage && !/@sha256:[0-9a-f]{64}$/u.test(postgresImage[1])) {
      failures.push(
        `${file}:${lineNumber}: PostgreSQL images require an immutable digest`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `GitHub Actions policy validation completed for ${workflowFiles.length} workflows.`,
  );
}
