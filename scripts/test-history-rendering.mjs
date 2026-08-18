import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

console.log("Iniciando pruebas de renderizado de histórico...");

const html = await readFile("dashboard/history.html", "utf8");
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, "history.html debe contener un bloque de script");

const domStore = {};
const mockDocument = {
  getElementById: (id) => ({
    set innerHTML(val) {
      domStore[id] = val;
    },
    get innerHTML() {
      return domStore[id] || "";
    }
  })
};

const context = vm.createContext({
  document: mockDocument,
  console,
  Intl,
  Date,
  Array,
  Object,
  String,
  Map,
  Set,
  Number
});

vm.runInContext(scriptMatch[1], context);

const renderSnapshot = context.renderSnapshot;
const renderOverview = context.renderOverview;

assert.equal(typeof renderSnapshot, "function", "renderSnapshot debe estar definida en history.html");
assert.equal(typeof renderOverview, "function", "renderOverview debe estar definida en history.html");

const baseSnapshot = {
  generatedAt: "2026-08-18T16:00:00.000Z",
  dashboardCommitSha: "dddddddddddddddddddddddddddddddddddddddd",
  standard: { release: "v1.1.0" }
};

const baseProcess = {
  overall: "pass"
};

// 1. Caso CURRENT
{
  const record = {
    snapshot: {
      ...baseSnapshot,
      generatedAt: "2026-08-18T16:00:00.000Z"
    },
    repository: {
      id: "gestor-autonomo",
      notApplicableAreas: [],
      process: baseProcess,
      quality: {
        status: "current",
        commitSha: "1111111111111111111111111111111111111111",
        validatedAt: "2026-08-10T12:30:00.000Z",
        conclusion: "passed",
        gates: [
          { id: "build", label: "Build", status: "passed", applicability: "required" }
        ],
        metrics: {}
      }
    }
  };

  const rendered = renderSnapshot(record);
  assert.ok(rendered.includes("Commit validado"), "En estado current debe aparecer la etiqueta 'Commit validado'");
  assert.ok(rendered.includes("111111111111"), "En estado current debe aparecer el commitSha validado");
  assert.ok(!rendered.includes("Commit actual"), "En estado current NO debe aparecer la etiqueta 'Commit actual'");

  renderOverview([record]);
  const overviewHtml = domStore.overview;
  assert.ok(overviewHtml.includes("Commit 111111111111"), "El overview debe mostrar el commit validado");
  assert.ok(!overviewHtml.includes("pendiente"), "El overview de current no debe marcarse como pendiente");

  // Verificación estricta de procedencia temporal: debe reflejar validatedAt (10 ago), no snapshot.generatedAt (18 ago)
  assert.ok(overviewHtml.includes("10 ago"), "La fecha de última validación debe proceder estrictamente de quality.validatedAt (10 ago)");
  assert.ok(!overviewHtml.includes("18 ago"), "La fecha de última validación NO debe proceder de snapshot.generatedAt (18 ago)");
}

// 2. Caso PENDING
{
  const record = {
    snapshot: baseSnapshot,
    repository: {
      id: "nexo",
      notApplicableAreas: ["Tipos", "Cobertura", "E2E", "Smoke test"],
      process: baseProcess,
      quality: {
        status: "pending",
        currentHeadSha: "2222222222222222222222222222222222222222",
        message: "Evidencia pendiente para el commit actual",
        gates: [],
        metrics: {}
      }
    }
  };

  const rendered = renderSnapshot(record);
  assert.ok(rendered.includes("Commit actual"), "En estado pending debe aparecer la etiqueta 'Commit actual'");
  assert.ok(rendered.includes("222222222222"), "En estado pending debe aparecer el currentHeadSha");
  assert.ok(!rendered.includes("Commit validado"), "En estado pending NO debe aparecer 'Commit validado'");

  renderOverview([record]);
  const overviewHtml = domStore.overview;
  assert.ok(overviewHtml.includes("Commit actual 222222222222") && overviewHtml.includes("pendiente"), "El overview debe indicar que el commit está pendiente");
  assert.ok(overviewHtml.includes(">—<") || overviewHtml.includes(">—</"), "La fecha de última validación en pending debe mostrar —");
}

// 3. Caso UNAVAILABLE con SHA
{
  const record = {
    snapshot: baseSnapshot,
    repository: {
      id: "nucleo",
      notApplicableAreas: ["Tipos", "Cobertura", "E2E"],
      process: baseProcess,
      quality: {
        status: "unavailable",
        currentHeadSha: "3333333333333333333333333333333333333333",
        message: "Evidencia no disponible.",
        gates: [],
        metrics: {}
      }
    }
  };

  const rendered = renderSnapshot(record);
  assert.ok(rendered.includes("Commit actual"), "En estado unavailable debe aparecer la etiqueta 'Commit actual'");
  assert.ok(rendered.includes("333333333333"), "En estado unavailable debe aparecer el currentHeadSha");
  assert.ok(!rendered.includes("Commit validado"), "En estado unavailable NO debe aparecer 'Commit validado'");

  renderOverview([record]);
  const overviewHtml = domStore.overview;
  assert.ok(overviewHtml.includes("Commit actual 333333333333") && overviewHtml.includes("sin validar"), "El overview debe indicar que el commit está sin validar");
}

// 4. Caso UNAVAILABLE sin SHA (caso límite de robustez)
{
  const record = {
    snapshot: baseSnapshot,
    repository: {
      id: "nucleo-preview",
      notApplicableAreas: ["Instalación", "Tipos", "Build", "Cobertura", "E2E"],
      process: baseProcess,
      quality: {
        status: "unavailable",
        message: "Evidencia no disponible.",
        gates: [],
        metrics: {}
      }
    }
  };

  let rendered;
  assert.doesNotThrow(() => {
    rendered = renderSnapshot(record);
  }, "renderSnapshot no debe arrojar excepciones cuando falta currentHeadSha");

  assert.ok(rendered.includes("Commit actual"), "Debe mostrar 'Commit actual'");
  assert.ok(rendered.includes(">—<"), "Debe mostrar '—' cuando no hay SHA disponible");
  assert.ok(!rendered.includes("undefined"), "El HTML generado no debe contener 'undefined'");
  assert.ok(!rendered.includes("null"), "El HTML generado no debe contener 'null'");

  renderOverview([record]);
  const overviewHtml = domStore.overview;
  assert.ok(overviewHtml.includes("Evidencia no disponible"), "El overview debe mostrar el mensaje de fallback");
}

// 5. Caso PROCESS PENDING (verificación de etiqueta 'En curso' para proceso)
{
  const processLabel = context.processLabel;
  assert.equal(typeof processLabel, "function", "processLabel debe estar definida en history.html");
  assert.equal(processLabel("pending"), "En curso", "processLabel('pending') debe devolver 'En curso'");

  const record = {
    snapshot: baseSnapshot,
    repository: {
      id: "gestor-autonomo",
      notApplicableAreas: [],
      process: { overall: "pending" },
      quality: {
        status: "current",
        commitSha: "4444444444444444444444444444444444444444",
        validatedAt: "2026-08-15T10:00:00.000Z",
        conclusion: "passed",
        gates: [{ id: "build", label: "Build", status: "passed", applicability: "required" }],
        metrics: {}
      }
    }
  };

  const rendered = renderSnapshot(record);
  assert.ok(rendered.includes('<span class="fact-value">En curso</span>'), "En estado de proceso pending debe aparecer 'En curso'");
  assert.ok(!rendered.includes('<span class="fact-value">Pendiente</span>'), "En estado de proceso pending NO debe aparecer 'Pendiente'");
}

console.log("Pruebas de renderizado de histórico válidas.");
