# mineflayer repository context

## Purpose and package boundary

Mineflayer is a high-level Minecraft bot framework. It exposes createBot through index.js and lib/loader.js, installs core plugins from lib/plugins/, and publishes TypeScript declarations from index.d.ts. The current package is 4.39.0 and requires Node.js 22 or newer.

The exact tested-version list is lib/version.js, currently spanning 1.8.8 through Java 26.3, including 26.2. A listed version means the repository has a compatibility path and tests; it does not promise identical behavior on every server implementation.

## Architecture

- index.js enforces the runtime guard and exports the loader.
- lib/loader.js builds the bot and applies core plugins.
- lib/plugins/ contains chat, entity, inventory, world, physics, digging, health, and other bot features.
- lib/version.js defines oldest/latest and tested versions.
- index.d.ts documents the public TypeScript surface.
- test/internalTest.js and related tests use a local node-minecraft-protocol server for deterministic protocol behavior.
- test/externalTest.js and test/externalTests/ exercise a Vanilla server and are separate, slower compatibility evidence.
- test/minecraft262* and test/minecraft263* cover release-specific behavior; test/protocolResourceLimitTest.js covers a packet-limit boundary.
- vendor/minecraft-data/ is the checked-in data used by this fork. package.json also points at sibling checkouts for minecraft-protocol, prismarine-chunk, prismarine-item, and prismarine-physics.

## Connection and plugin flow

createBot selects a version and auth mode, creates a minecraft-protocol client, then loader plugins subscribe to protocol events and expose high-level state and actions. World/chunk, block, item, physics, inventory, entity, chat, and command plugins exchange objects from the sibling Prismarine packages. Plugin order and event cleanup are part of the runtime contract.

A bot may connect to offline servers or Microsoft-authenticated online servers. Authentication tokens are cached by the protocol/auth dependencies; application code must treat those files as secrets.

## Version and release facts

Java 26.2 uses protocol 776 and data version 4903; Java 26.3 uses protocol 777 and data version 5023. The current Mineflayer compatibility work includes version-specific movement, packet/resource-limit, chunk, item, and registry paths. Review docs/minecraft-26.2-research.md and docs/minecraft-26.3-research.md for the evidence and its limits.

The current validation records are offline-mode and local-server oriented. Online Microsoft authentication, Paper/Spigot compatibility, and long-running reconnect/resource-leak gates require separate environments and must not be implied by the version list.

## Development topology

In this fork, the package resolves minecraft-data from vendor/minecraft-data and several sibling packages through file: paths. This makes cross-repository changes testable from one checkout. It is not the install topology for users who install mineflayer from npm. Keep vendor provenance and sibling commit state visible in change descriptions.

## Documentation and test lifecycle

docs/README.md is the canonical public README; npm run prepublishOnly copies it to the ignored root README.md. docs/api.md uses doctoc for its table of contents. docs/CONTRIBUTING.md defines issue, test, plugin, and error-handling conventions. docs/llm_contribute.md gives focused external-test patterns, but inspect current helpers before copying examples.

When a test starts a server, socket, listener, timer, or child process, close it in a finally/after path. External tests should use the established bot.test helpers and remove listeners they add. Avoid logging auth or private server data.

## Common pitfalls

- Assuming a successful offline Vanilla test proves online authentication or proxy/server compatibility.
- Updating a sibling protocol/data package without updating vendor data or local dependency state.
- Forgetting that plugin event names and state fields are public API.
- Throwing from a recoverable bot action where the project expects an error event or callback.
- Leaving spawned server processes, listeners, or files behind.
- Claiming support for a version that is listed but not exercised by the relevant test tier.


## Published versus source-tree status

The current 26.2/26.3 implementation is after the published 4.39.0 release. An ordinary npm install cannot reproduce it because the fork intentionally uses local file dependencies and a vendored data snapshot. Use the six-repository checkout layout, record each commit, and distinguish offline/local evidence from online-mode or third-party-server evidence.

See [the cross-repository documentation research record](docs/documentation-research.md) for the primary sources and decisions behind these files.
