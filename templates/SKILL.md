---
name: skill-name
description: One sentence. What this does and when an agent should reach for it. This is the line the agent reads to decide.
---

<!-- Template by Ctrl Alt Delegate, a Hertect Consulting product. CC BY 4.0. -->

A skill is used when needed, not always on. Keep it to one job. Ctrl Alt Delegate treats the whole file as one rule — write your What and Check sections so a person could tell whether the skill was followed.

## When to use
Name the situation. "When adding a database migration." "When a PR touches the auth module."

## What to do
Numbered steps. Short. Each step is something an agent can act on.

1. Do the first thing.
2. Do the second thing.
3. Leave evidence that it happened.

## Check
`git ls-files dist/index.js` finds the file — or whatever a person would look at to know this skill was followed: a command, a file that exists afterward, or something visible in the PR.

## Owner
@handle

## Reviewed
2026-09-16

Copy the shape below for a new skill. It lives in its own file, one skill per SKILL.md:

```
---
name: skill-name
description: One sentence.
---

## When to use


## What to do
1.
2.
3.

## Check


## Owner
@handle

## Reviewed
YYYY-MM-DD
```

<!-- Checkable by Ctrl Alt Delegate. -->
