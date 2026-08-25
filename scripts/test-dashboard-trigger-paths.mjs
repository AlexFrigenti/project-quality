import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflowPath = ".github/workflows/quality-dashboard.yml";
const workflow = await readFile(workflowPath, "utf8");

function extractPathsBlock(trigger) {
  const triggerIndex = workflow.indexOf(`${trigger}:`);
  assert.ok(triggerIndex !== -1, `Debe existir el trigger ${trigger}`);
  const afterTrigger = workflow.slice(triggerIndex);
  const pathsIndex = afterTrigger.indexOf("paths:");
  assert.ok(pathsIndex !== -1, `El trigger ${trigger} debe tener bloque paths`);
  // Extract until next trigger or job section (push: or schedule: or concurrency:)
  const blockStart = triggerIndex + pathsIndex;
  // Find end of paths list: look for next top-level key (two spaces indent, not 6)
  const remaining = workflow.slice(blockStart);
  const lines = remaining.split("\n");
  const paths = [];
  let inPaths = false;
  for (const line of lines) {
    if (line.trim() === "paths:") {
      inPaths = true;
      continue;
    }
    if (inPaths) {
      if (line.match(/^\s*-\s+".+"/)) {
        const match = line.match(/^\s*-\s+"([^"]+)"/);
        if (match) paths.push(match[1]);
      } else if (line.match(/^\s{2}\w+:/) || line.match(/^\s{2}schedule:/) || line.match(/^concurrency:/) || line.match(/^permissions:/) || line.match(/^jobs:/)) {
        break;
      } else if (line.trim() === "" ) {
        continue;
      } else if (line.match(/^\s{4}\w+:/)) {
        // still inside on. block but not paths, e.g., branches
        continue;
      }
    }
  }
  return paths;
}

const requiredPaths = [
  "scripts/github-api-request.mjs",
  "scripts/zip-entry-reader.mjs",
  "scripts/test-dashboard-trigger-paths.mjs"
];

const pullRequestPaths = extractPathsBlock("pull_request");
for (const required of requiredPaths) {
  assert.ok(
    pullRequestPaths.includes(required),
    `pull_request.paths debe incluir ${required}`
  );
}

const pushPaths = extractPathsBlock("push");
for (const required of requiredPaths) {
  assert.ok(
    pushPaths.includes(required),
    `push.paths debe incluir ${required}`
  );
}

// Verify assemble job executes the test
assert.ok(
  workflow.includes("node scripts/test-dashboard-trigger-paths.mjs"),
  "El job assemble debe ejecutar node scripts/test-dashboard-trigger-paths.mjs"
);

console.log("Dashboard trigger paths contract válido.");
