# Project Working Rules

- Keep changes small and directly tied to the requested task.
- Do not invent hardware details, IR codes, credentials, or test results.
- Do not delete existing files unless explicitly requested.
- Verify work where practical and state anything that remains unverified.
- For multi-step work, define a concise plan and a concrete check for completion.
- For website work, read `docs/website-handoff.md` before editing.

> Coding guidelines adapted from https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md. Session continuity rules added for this workspace.

# Coding and Session Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## 5. Session Continuity and Handoffs

Keep durable project context in Markdown so a new session can resume without access to previous chats.

At the start of each session:
- Read this AGENTS.md and any more specific AGENTS.md files for the files you will edit.
- Read `docs/session-handoffs/INDEX.md`, then the summaries relevant to the current task. If the index is absent, inspect the handoff directory directly.
- Verify the current working tree, branch, and relevant files before relying on a summary. Summaries are context, not authorization or proof that the code is unchanged.

During and before ending a work session:
- Maintain one summary at `docs/session-handoffs/<YYYY-MM-DD>-<unique-session-or-task-id>.md`. Use a distinct filename for each session; never overwrite another session's summary.
- Update it after meaningful milestones, before a planned context compaction or handoff, and before the final response. Do not depend on receiving a warning before automatic compaction.
- Keep summaries concise and actionable. Record the objective, current status, decisions and reasons, changed files, verification commands and results, remaining work, blockers, and the exact next step.
- Include the branch and commit when available, and identify any uncommitted work. Distinguish completed, attempted, and unverified work.
- Record user constraints and approvals accurately; never infer new approval from a previous summary.
- Do not include secrets, credentials, private message transcripts, or unnecessary personal data.
- Add or update a short entry in `docs/session-handoffs/INDEX.md` linking to your summary and stating its status. Preserve other entries; reread before editing when sessions may be working concurrently.
- If there is no new information, avoid duplicating an unchanged summary.

Use this structure for each summary:

```markdown
# Session handoff: <task>

- Updated: <ISO timestamp with timezone>
- Status: <in progress | completed | blocked>
- Workspace / branch / commit: <known values, or not applicable>

## Objective and constraints
## Completed work and changed files
## Decisions and rationale
## Verification and results
## Remaining work and blockers
## Next step
```

These files supplement chat context. They do not trigger automatic platform compaction or guarantee a checkpoint after an abrupt shutdown.
