---
name: git-flow-start
description: Standard workflow for starting new tasks. Use this skill BEFORE creating any new features, fixing bugs, or making significant code changes. It ensures you are on a clean, up-to-date branch.
---

# Git Flow Start

## When to Use

You MUST use this skill at the **beginning** of any task that involves code modification, specifically:
*   Starting a new feature (`feat`)
*   Fixing a bug (`fix`)
*   Refactoring code (`refactor`)
*   Documentation updates (`docs`)

## Workflow Instructions

Follow these steps sequentially. Do not skip validation.

### 1. Safety Check (Status)

First, verify the current repository state to avoid losing uncommitted changes.

```bash
git status
```

*   **If dirty**: Stash changes (`git stash`) or commit them if related to previous work. Do NOT proceed if the working tree is dirty.

### 2. Synchronization (Update)

Ensure you are branching off the latest stable code (usually `main` or `master`).

```bash
git checkout main
git pull origin main
```

*   *Note*: If the project uses message `master`, adjust accordingly.

### 3. Branch Creation

Create a new branch with a descriptive name following the convention: `<type>/<short-description>`.

**Types**:
*   `feat`: New features
*   `fix`: Bug fixes
*   `refactor`: Code restructuring
*   `chore`: Config/Build changes

**Command**:
```bash
git checkout -b <type>/<description>
```

**Example**:
*   `git checkout -b feat/add-login-screen`
*   `git checkout -b fix/header-alignment`

### 4. Verification

Confirm you are on the new branch.

```bash
git branch --show-current
```

## Anti-Patterns (What NOT to do)

*   ❌ **Direct Commit**: Never commit directly to `main` / `master`.
*   ❌ **Mega Branches**: Don't reuse old feature branches for new unrelated tasks.
*   ❌ **Vague Names**: Avoid branch names like `test`, `temp`, `my-branch`.
