import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const workflowPath = ".github/workflows/quality-dashboard.yml";
const rawWorkflow = await readFile(workflowPath, "utf8");
const workflow = rawWorkflow.replace(/\r\n?/g, "\n");

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
      } else if (line.trim() === "") {
        continue;
      } else if (line.match(/^\s{4}\w+:/)) {
        // still inside on. block but not paths, e.g., branches
        continue;
      }
    }
  }
  return paths;
}

function extractAssembleJob() {
  const assembleIndex = workflow.indexOf("\n  assemble:\n");
  assert.ok(assembleIndex !== -1, "Debe existir el job assemble en el workflow");
  const afterAssemble = workflow.slice(assembleIndex + 1);
  const nextJobMatch = afterAssemble.slice(2).search(/\n {2}\w+:/);
  const assembleBlock = nextJobMatch !== -1
    ? afterAssemble.slice(0, nextJobMatch + 2)
    : afterAssemble;
  return assembleBlock;
}

// 1. Identificar las suites del dominio del dashboard
const allTestFiles = (await readdir("scripts"))
  .filter((file) => file.startsWith("test-") && file.endsWith(".mjs"))
  .sort();

// test-main-quality-gate.mjs pertenece al gate universal y no al flujo de Pages
const dashboardDomainSuites = allTestFiles.filter((file) => file !== "test-main-quality-gate.mjs");
assert.equal(
  dashboardDomainSuites.length,
  17,
  `El dominio del dashboard debe constar exactamente de 17 suites, pero se encontraron ${dashboardDomainSuites.length}`
);

// 2. Extraer y validar suites ejecutadas por el job assemble
const assembleBlock = extractAssembleJob();
const executedSuites = new Set(
  [...assembleBlock.matchAll(/node\s+scripts\/(test-[\w-]+\.mjs)/g)].map((m) => m[1])
);

// El gate universal independiente NO debe estar en assemble
assert.equal(
  executedSuites.has("test-main-quality-gate.mjs"),
  false,
  "El job assemble no debe acoplarse con test-main-quality-gate.mjs"
);

// Las 17 suites deben ser ejecutadas por assemble
const missingSuites = dashboardDomainSuites.filter((suite) => !executedSuites.has(suite));
assert.deepEqual(
  missingSuites,
  [],
  `El job assemble no ejecuta las siguientes suites del dashboard: ${missingSuites.join(", ")}`
);

// 3. Extraer y validar paths de triggers
const pullRequestPaths = extractPathsBlock("pull_request");
const pushPaths = extractPathsBlock("push");

// Simetría estricta entre pull_request.paths y push.paths
assert.deepEqual(
  [...pullRequestPaths].sort(),
  [...pushPaths].sort(),
  "pull_request.paths y push.paths deben ser exactamente simétricos"
);

// Comprobación de que no acoplan el gate universal independiente
for (const paths of [pullRequestPaths, pushPaths]) {
  assert.equal(
    paths.includes(".github/workflows/main-quality-gate.yml"),
    false,
    "El workflow del dashboard no debe incluir main-quality-gate.yml en paths"
  );
  assert.equal(
    paths.includes("scripts/test-main-quality-gate.mjs"),
    false,
    "El workflow del dashboard no debe incluir test-main-quality-gate.mjs en paths"
  );
}

// 4. Todas las suites del dashboard deben estar en pull_request.paths y push.paths
for (const suite of dashboardDomainSuites) {
  assert.ok(
    pullRequestPaths.includes(`scripts/${suite}`),
    `pull_request.paths debe incluir scripts/${suite}`
  );
  assert.ok(
    pushPaths.includes(`scripts/${suite}`),
    `push.paths debe incluir scripts/${suite}`
  );
}

// 5. Dependencias directas requeridas (módulos, fixtures y herramientas)
const requiredDependencies = [
  "scripts/github-api-request.mjs",
  "scripts/zip-entry-reader.mjs",
  "scripts/test-dashboard-trigger-paths.mjs",
  "scripts/fixture-history-legacy.mjs",
  "scripts/test-github-api-resilience.mjs"
];

for (const required of requiredDependencies) {
  assert.ok(
    pullRequestPaths.includes(required),
    `pull_request.paths debe incluir ${required}`
  );
  assert.ok(
    pushPaths.includes(required),
    `push.paths debe incluir ${required}`
  );
}

console.log("Dashboard trigger paths contract válido.");
