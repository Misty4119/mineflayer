# Security policy

## Scope

Mineflayer connects bots to remote Minecraft servers and loads plugins that process chat, entities, chunks, items, commands, and authentication state. Security issues can expose Microsoft or Mojang tokens, account identifiers, private server data, execute unintended plugin or child-process actions, or cause denial of service through malicious packets/worlds.

## Supported versions

There is no formal long-term security-support matrix for this fork. Triage starts with current master and the latest published package. The compatibility target is the tested-version list in lib/version.js, including Java 26.2 and 26.3. A version entry does not promise online-mode, Paper/Spigot, proxy, or long-running reconnect coverage; those require the corresponding environment and evidence.

## Reporting a vulnerability

As verified on 2026-09-19, this fork has no enabled GitHub private vulnerability-reporting endpoint. Do not publish account credentials, tokens, packet captures, exploit commands, private server addresses, or malicious plugin code in a public issue, discussion, pull request, or chat message.

1. Check the repository GitHub **Security** tab for **Report a vulnerability** and use the private form if available.
2. Otherwise use a private contact method listed on the [Misty4119 GitHub profile](https://github.com/Misty4119). If none is visible, request a private route without including the vulnerability details and then send the report privately.
3. Revoke or rotate any token that may have been exposed, and redact it from all logs and attachments.

Include the affected commit/version, Minecraft edition and version, auth mode, server/plugin setup, minimal reproduction, impact, and environment. Use a disposable offline account or local server for reproductions. No response or remediation time is promised.

For ordinary bot behavior or compatibility issues, use the [public issue tracker](https://github.com/Misty4119/mineflayer/issues) after removing confidential data.
