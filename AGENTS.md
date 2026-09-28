# Repository Agent Instructions

This file is the mandatory bootstrap for AI work in this repository.

Before doing any repository work, read these files in order:

1. `AI_OPERATOR_GOVERNANCE.md`
2. the current GitHub issue, pull request, or owner instruction defining the task
3. `docs/OPERATING_BLUEPRINT.md`
4. `docs/AGENT_WORK_ORDERS.md`
5. any task-specific decision log, release evidence, or runbook linked from the task

`AI_OPERATOR_GOVERNANCE.md` controls authority and precedence. Older role assignments in planning documents are specialties and work-allocation guidance, not standing execution authority.

If an agent runtime does not automatically load this file, it must be explicitly included before that agent performs consequential repository work. An agent that has not loaded the canonical governance policy may inspect the repository read-only but must not mutate, execute, deploy, merge, release, or communicate externally.

No agent-specific bootstrap file may weaken or bypass the canonical governance policy.
