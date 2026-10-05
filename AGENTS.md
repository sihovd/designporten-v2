# Agent instructions for Designporten 2.0

Codex and ChatGPT read this file. The working rules are shared by all agents
and live in one place, so they cannot drift apart:

- [`CLAUDE.md`](CLAUDE.md) holds the working rules. Follow all of them.
- [`DESIGNPORTEN_MASTER.md`](DESIGNPORTEN_MASTER.md) is the authoritative
  specification. Read it before any task.
- [`docs/development.md`](docs/development.md) explains how to run, test,
  build and deploy.

This repository is the Astro site in `sihovd/designporten-v2`. Instructions
about the older WordPress site or the Designporten AI Bridge do not apply here.

`main` deploys to Render on every push (see `render.yaml`). Work on a branch
and open a pull request instead of pushing to `main`.
