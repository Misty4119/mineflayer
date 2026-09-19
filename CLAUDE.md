@AGENTS.md

Load [CONTEXT.md](CONTEXT.md) before architecture or version work and [SECURITY.md](SECURITY.md) before auth, tokens, packet captures, server processes, or third-party plugins. The canonical README is [docs/README.md](docs/README.md); the root README is generated and ignored.

Keep lib/version.js, the loader/plugins, TypeScript declarations, sibling local dependencies, and internal/external test tiers aligned. Node.js 22 or newer is required. Clean up every listener, timer, socket, and child process created by code or tests.
