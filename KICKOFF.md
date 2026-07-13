# PPG Pulse — Claude Code Kickoff & Autonomous Loop

Paste the **prompt below** into Claude Code (in an empty folder that also contains
`CLAUDE.md`, `TASKS.md`, and `SPEC.md`). It runs an autonomous build loop that does
not stop until every task in `TASKS.md` is checked `[x]` and `npm run verify` passes.

> **Note on "never ends":** Claude Code works in turns, not literally forever. This
> setup makes each turn *self-continuing* — it always picks the next unfinished task,
> finishes it, verifies it, commits, and immediately moves to the next one, only
> yielding when the whole backlog is green or it is truly blocked. If a turn ends
> mid-backlog (token/time limit), just send **`continue`** and it resumes exactly
> where it left off, because state lives in `TASKS.md` / `PROGRESS.md`, not in memory.

---

## THE KICKOFF PROMPT (copy everything between the lines)

---
You are the lead engineer building **PPG Pulse**. Read `CLAUDE.md`, `SPEC.md`, and
`TASKS.md` fully before doing anything.

Operate as an **autonomous build loop**. Repeat this cycle and DO NOT STOP until the
Definition of Done in `CLAUDE.md` is met:

1. **SELECT** — Open `TASKS.md`. Pick the first task that is unchecked `[ ]` and whose
   listed dependencies are all `[x]`. If several are ready, take the lowest ID.
2. **PLAN** — Write a one-line plan of what you'll change for this task.
3. **IMPLEMENT** — Make the change: code, migrations, and the tests named in the task's
   "Tests" list. Follow the conventions in `CLAUDE.md`.
4. **VERIFY** — Run `npm run verify` (typecheck + lint + unit/integration tests + build).
   The task is only done when: (a) every acceptance criterion is objectively met, and
   (b) `verify` is fully green. If red, fix and re-run — do not move on with a red bar.
5. **RECORD** — Check the task `[x]` in `TASKS.md`, append a one-line entry to
   `PROGRESS.md` (date, task id, what shipped), and `git commit` with message
   `feat(<area>): <task id> <summary>`.
6. **LOOP** — Immediately go back to step 1 for the next task. Do not ask for
   permission between tasks. Do not summarize and stop while tasks remain.

Rules:
- Never mark a task done if `verify` is red or an acceptance criterion is unmet.
- If a task is genuinely blocked (needs a secret, an external decision, or a human),
  append it to `BLOCKERS.md` with the exact question, leave it unchecked, and continue
  with the next unblocked task. Never spin on a blocker.
- Keep commits small (one task = one or a few commits). Never force-push.
- Prefer boring, well-tested code over clever code. Every endpoint gets a test.
- When all tasks are `[x]`, run `npm run verify` one final time, then run the app,
  smoke-test the seeded demo, and post a final report: what was built, how to run it,
  test coverage, and anything in `BLOCKERS.md`.

Start now with the SELECT step. Announce the task id you're starting, then build it.
---

## If a turn stops early

Send: **`continue`** — it re-reads `TASKS.md`/`PROGRESS.md` and resumes the loop.

## Optional shell loop (runs Claude Code repeatedly until green)

If your Claude Code CLI supports non-interactive runs, you can wrap it:

```bash
# loop.sh — keeps invoking the agent until TASKS.md has no unchecked boxes
while grep -q "^\- \[ \]" TASKS.md; do
  claude -p "Resume the PPG Pulse autonomous build loop described in KICKOFF.md. \
Pick the next ready unchecked task, implement it, run 'npm run verify', check it off, \
commit, and continue. Stop this run only if blocked or the backlog is empty." \
    --dangerously-skip-permissions
  echo "---- pass complete; rechecking backlog ----"
done
echo "ALL TASKS COMPLETE"
npm run verify
```

(Only use `--dangerously-skip-permissions` in a sandbox/branch you trust. Otherwise run
interactively and approve tool calls.)
