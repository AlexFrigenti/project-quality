export const legacyHistorySnapshot = {
  schemaVersion: 1,
  generatedAt: "2026-08-01T06:17:00.000Z",
  dashboardCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  standard: {
    release: "v1.1.0",
    sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  },
  repositories: [
    {
      id: "gestor-autonomo",
      repository: "AlexFrigenti/gestor-autonomo",
      kind: "node",
      visibility: "private",
      notApplicableAreas: [],
      process: {
        overall: "pass",
        mainProtection: "pass",
        workflow: "pass",
        checks: [
          { id: "main-protection", status: "pass" },
          { id: "latest-quality-run", status: "pass" }
        ]
      },
      quality: {
        status: "current",
        commitSha: "1111111111111111111111111111111111111111",
        validatedAt: "2026-08-01T05:30:00.000Z",
        conclusion: "passed",
        gates: [
          {
            id: "tests",
            label: "Tests unitarios",
            applicability: "required",
            status: "passed",
            details: "10 de 10 tests correctos."
          },
          {
            id: "coverage",
            label: "Cobertura",
            applicability: "required",
            status: "passed",
            details: "86.4 por ciento de lineas cubiertas."
          }
        ],
        metrics: {
          tests: { total: 10, passed: 10 },
          coverage: { lines: 86.4 }
        }
      }
    },
    {
      id: "nucleo-preview",
      repository: "AlexFrigenti/Nucleo-preview",
      kind: "static",
      visibility: "public",
      notApplicableAreas: ["Build", "Tipos"],
      process: {
        overall: "warning",
        mainProtection: "pass",
        workflow: "pass",
        checks: [{ id: "latest-quality-run", status: "pending" }]
      },
      quality: {
        status: "pending",
        currentHeadSha: "4444444444444444444444444444444444444444",
        message: "Evidencia pendiente para el commit actual.",
        gates: [],
        metrics: {}
      }
    }
  ]
};
