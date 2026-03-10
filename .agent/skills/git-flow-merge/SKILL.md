---
name: git-flow-merge
description: Standard workflow for completing tasks and merging code to main. Use this skill AFTER implementation and verification are complete. It ensures changes are committed, merged to main, and the feature branch is cleaned up.
---

# Git Flow Merge

## When to Use

You MUST use this skill at the **completion** of a task, when:
*   A feature or fix is fully implemented and verified.
*   You are ready to merge the changes back to the main codebase.

## Workflow Instructions

Follow these steps sequentially. Do not skip validation.

### 1. Safety Check (Current Branch)

Verify you are ON the feature branch you want to merge.

```bash
git branch --show-current
```

*   **Critical**: If you are on `main` or `master`, STOP. You cannot merge `main` into `main`.
*   **Status**: Check `git status`. Ensure the working tree is clean. If there are uncommitted changes, commit them now:
    *   `git add .`
    *   `git commit -m "feat: complete feature implementation"`

### 2. Capture Branch Name

Store the current branch name, you will need it.

```bash
# Example only - visually note the branch name
current_branch=$(git branch --show-current)
```

### 3. Update Main

Switch to main and ensure it's up to date.

```bash
git checkout main
git pull origin main
```

### 4. Merge Feature Branch

Merge your feature branch into main.

```bash
git merge <feature-branch-name>
```

*   **Conflict Handling**: If conflicts occur, resolve them manually, then `git add .` and `git commit`.

### 5. Cleanup (Post-Merge)

Once merged successfully, delete the local feature branch to keep the workspace clean.

```bash
git branch -d <feature-branch-name>
```

*   *Note*: Use `-D` only if necessary and you are sure changes are merged.

## Final Verification

Confirm you are back on main and the merge is reflected in the log.

```bash
git log --oneline -n 5
```
