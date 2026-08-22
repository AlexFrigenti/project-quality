import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { validateDashboard } from "./dashboard-contract.mjs";

export { validateDashboard } from "./dashboard-contract.mjs";

async function main() {
  const file = process.argv[2] || "site/data.json";
  const value = JSON.parse(await readFile(file, "utf8"));
  validateDashboard(value);
  console.log("Dashboard válido: " + value.repositories.length + " repositorios.");
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entrypoint === import.meta.url) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
