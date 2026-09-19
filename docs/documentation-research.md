# Documentation research record

Research date: 2026-09-19

## Scope and method

This record captures the primary-source research used to write the repository documentation for the six local PrismarineJS forks:

- minecraft-data
- node-minecraft-protocol
- prismarine-chunk
- prismarine-physics
- prismarine-item
- mineflayer

Claims were checked against the local source trees and package manifests, upstream repository files, official GitHub documentation, and the official Contributor Covenant text. No credentials, private packet captures, or account data were used.

## Primary sources

- Local source of truth: each repository's package.json (where present), entry points, version tables, test directories, existing README/contribution files, and current 26.2/26.3 research notes.
- [PrismarineJS contribution guide](https://github.com/PrismarineJS/prismarine-contribute) for repository relationships and release flow.
- [minecraft-data architecture](https://github.com/PrismarineJS/minecraft-data/blob/master/doc/ARCHITECTURE.md), [new-version procedure](https://github.com/PrismarineJS/minecraft-data/blob/master/doc/add-data-new-version.md), and [protocol guide](https://github.com/PrismarineJS/minecraft-data/blob/master/doc/protocol.md) for generated-data source of truth.
- [Mineflayer contribution guide](https://github.com/PrismarineJS/mineflayer/blob/master/docs/CONTRIBUTING.md) and [LLM test guide](https://github.com/PrismarineJS/mineflayer/blob/master/docs/llm_contribute.md) for test tiers, plugin conventions, error handling, and cleanup.
- [GitHub: adding a security policy](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/add-security-policy), [GitHub: adding a code of conduct](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/adding-a-code-of-conduct-to-your-project), and [GitHub coordinated disclosure](https://docs.github.com/en/code-security/concepts/vulnerability-reporting-and-management/coordinated-disclosure).
- [Contributor Covenant 3.0](https://www.contributor-covenant.org/version/3/0/code_of_conduct/code_of_conduct.md) for the adopted community standards and attribution.
- [Anthropic memory guidance](https://code.claude.com/docs/en/memory.md) for importing AGENTS.md from CLAUDE.md.
- [GitHub README guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes) and [npm README guidance](https://docs.npmjs.com/about-package-readme-files/) for canonical user-facing documentation.

## Findings that shaped the documents

### Source and release state

The six local master branches contain Java 26.2 and 26.3 work after the currently published package versions. The source trees therefore distinguish current repository behavior from what a plain npm install provides. Mineflayer's fork uses sibling file dependencies and a vendored minecraft-data snapshot; this is the reproducible development topology for the local compatibility work.

Java 26.2 uses protocol 776 and data version 4903. Java 26.3 uses protocol 777 and data version 5023. Exact supported-version lists remain in source files such as minecraft-data/data/dataPaths.json, node-minecraft-protocol/src/version.js, prismarine-chunk/src/index.js, and mineflayer/lib/version.js.

### Repository-specific source of truth

- minecraft-data: data/dataPaths.json, common version indexes, schemas, and generator/extractor inputs. Protocol YAML is editable; protocol.json is generated.
- node-minecraft-protocol: src/version.js, src/datatypes, src/transforms, client/server layers, and tests. docs/README.md is canonical and root README.md is generated and ignored.
- prismarine-chunk: src/index.js dispatch, PC/Bedrock implementations, raw fixtures, and types/index.d.ts.
- prismarine-physics: index.js API, collision/math/attribute modules, lib/features.json, and deterministic tests.
- prismarine-item: index.js, lib/hashedSlot*, lib/anvil.js, index.d.ts, and legacy/component/hash/anvil tests.
- mineflayer: index.js, lib/loader.js, lib/plugins, lib/version.js, index.d.ts, internal/external tests, sibling dependencies, and vendor/minecraft-data. docs/README.md is canonical and root README.md is generated and ignored.

### Governance channel verification

The six public Misty4119 repositories report no enabled GitHub private vulnerability-reporting channel as of this research date. The upstream PrismarineJS repositories also expose no reusable SECURITY.md, CODE_OF_CONDUCT.md, organization security email, or default community policy. The new policies therefore state the limitation instead of inventing an email, response SLA, bounty, or private URL. Maintainers should configure a monitored private channel before promising confidential conduct reporting.

## Documentation decisions

- AGENTS.md owns agent workflow, source-of-truth rules, commands, and completion checks.
- CLAUDE.md imports AGENTS.md and adds only Claude-specific loading guidance.
- CONTEXT.md records architecture and cross-repository data flow.
- README.md remains user-facing; docs/README.md is preserved as canonical where the repository intentionally generates the root copy.
- SECURITY.md describes each module's threat model and the verified reporting limitation.
- CODE_OF_CONDUCT.md adopts Contributor Covenant 3.0 and states the currently available reporting route and its limitation.

## Validation performed

- Confirmed all six repositories are on the documentation branch with no unrelated code changes.
- Confirmed all required files exist and all modified canonical README links resolve to existing local targets or verified external URLs.
- Confirmed CLAUDE.md imports AGENTS.md in every repository.
- Confirmed no placeholders, unverified security advisory URLs, credentials, or private data were added.
- Ran git diff --check for every repository; no whitespace errors were reported.
