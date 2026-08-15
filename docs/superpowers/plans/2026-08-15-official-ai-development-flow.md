# Official AI Development Flow Implementation Plan

> **For agentic workers:** Implement this plan task-by-task and verify the complete Pull Request diff before integration.

**Goal:** Convert the approved AI-assisted development design into the shared repository documentation without changing technical quality gates.

**Architecture:** Keep the process tool-agnostic. Spec Kit supplies structured artifacts when useful, Superpowers supplies execution discipline, and GitHub Actions remains the source of objective quality evidence. This PR updates only shared documentation and the PR template.

**Tech Stack:** Markdown documentation and GitHub Pull Request template.

## Global Constraints

- Do not modify `main` directly.
- Do not install Spec Kit, Pi, Superpowers, dependencies, or plugins.
- Do not modify consumer repositories.
- Preserve merge commit policy; do not use squash or rebase.
- Do not add artificial quality scores or fictitious checks.
- Keep `No aplica` distinct from failure.
- Do not introduce a workflow that blocks solely because a specification is absent.

## Task 1: Update the quality contract

**File:** `QUALITY_STANDARD.md`

- Add T0, T1, and T2 change classification.
- Add the lifecycle from intake through merge.
- Define traceability between intent, criteria, tasks, tests, CI evidence, and PR.
- State that documentation requirements do not replace real technical gates.

**Verification:** Check headings, exclusions, merge policy, and existing project profiles remain present.

## Task 2: Update agent instructions

**File:** `AGENTS.md`

- Require context discovery and change classification before edits.
- Require specification artifacts for T1/T2 work.
- Add TDD, scope control, systematic debugging, and verification expectations.
- Preserve the existing safety and reporting rules.

**Verification:** Confirm the agent is not instructed to invent controls or bypass `main`.

## Task 3: Update contribution workflow

**File:** `CONTRIBUTING.md`

- Document the human approval points.
- Define reduced T0 and full T1/T2 flows.
- Add pre-PR and post-merge checks.
- Preserve explicit merge confirmation and branch cleanup.

**Verification:** Confirm branch, PR, merge commit, checks, diff review, and cleanup are explicit.

## Task 4: Update Pull Request traceability

**File:** `.github/pull_request_template.md`

- Add change level, specification path, acceptance criteria, test mapping, and out-of-scope fields.
- Preserve validation, security, documentation, and review checklists.
- Keep non-applicable checks explainable rather than falsely checked.

**Verification:** Confirm every required traceability field is present.

## Task 5: Update repository entrypoint

**File:** `README.md`

- Add the official AI-assisted development flow.
- Link the design document and explain T0/T1/T2 at a high level.
- Clarify that the standard is tool-agnostic and Actions remain authoritative.
- Preserve existing workflow usage and dashboard documentation.

**Verification:** Confirm existing links, consumer workflow examples, pinned SHA guidance, and dashboard sections remain present.

## Final verification

- Fetch every changed file from the PR branch.
- Confirm only the approved documentation files plus the design and plan are changed.
- Scan for `TBD`, `TODO`, unresolved placeholders, secrets, and accidental consumer-specific rules.
- Review the complete PR diff against `main`.
