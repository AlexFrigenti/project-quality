import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const workflowPath = join(repositoryRoot, ".github", "workflows", "node-quality.yml");
const contractTestPath = fileURLToPath(new URL("./test-node-quality-workflow.mjs", import.meta.url));
const temporaryRoot = await mkdtemp(join(tmpdir(), "project-quality-crlf-"));

try {
  await mkdir(join(temporaryRoot, ".github", "workflows"), { recursive: true });
  await mkdir(join(temporaryRoot, "scripts"), { recursive: true });

  const workflow = await readFile(workflowPath, "utf8");
  await copyFile(contractTestPath, join(temporaryRoot, "scripts", "test-node-quality-workflow.mjs"));
  await writeFile(
    join(temporaryRoot, ".github", "workflows", "node-quality.yml"),
    workflow.replace(/\r?\n/g, "\r\n"),
  );

  const result = spawnSync(process.execPath, ["scripts/test-node-quality-workflow.mjs"], {
    cwd: temporaryRoot,
    encoding: "utf8",
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

  assert.equal(
    result.status,
    0,
    `el contrato Node debe aceptar workflows CRLF (salida:\n${output})`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}

console.log("Node quality workflow contract CRLF válido.");
