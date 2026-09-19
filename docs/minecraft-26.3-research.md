# Minecraft Java 26.3 support research

> Research date: 2026-09-19  
> Scope: the local Mineflayer private fork and its five sibling Prismarine repositories.

## Confirmed release facts

| Field | 26.3 value | Source |
| --- | --- | --- |
| Minecraft release | `26.3` | [Mojang release article](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-3) |
| Java protocol | `777` | [minecraft-data 26.3 protocol data](https://github.com/PrismarineJS/minecraft-data/pull/1300) |
| Data version | `5023` | [minecraft-data 26.3 data update](https://github.com/PrismarineJS/minecraft-data/pull/1301) |
| Java runtime | 25 | Mojang release requirements and the 26.3 server manifest |
| Resource pack format | `97.1` | Mojang release article |
| Data pack format | `121.0` | Mojang release article |

The local implementation uses a native `data/pc/26.3` snapshot. It does not alias the 26.3 block, item, entity, biome, particle, sound, collision, recipe, or protocol registries to 26.2. The snapshot currently contains 1,286 blocks, 1,658 items, 67 biomes, and 161 entities.

## Wire protocol findings

The 26.3 protocol keeps the 26.2 protocol family but changes movement handling in a way that affects clients:

- Relative entity movement uses the native `entityDelta` type for `rel_entity_move` and `entity_move_look`.
- The clientbound `sync_entity_position` packet is present and is handled by Mineflayer's entity tracker.
- `teleport_confirm` carries the teleport position and rotations in addition to the teleport id.
- The server expects a serverbound `tick_end` each client tick. Vanilla resets per-tick movement bookkeeping when it receives this packet; clients that omit it can be disconnected with `multiplayer.disconnect.invalid_player_movement` after a second movement packet.

The protocol YAML remains the source of truth. `tools/js/compileProtocol.js` normalizes anonymous container members to the canonical `{ anon: true, type }` ProtoDef form before writing `protocol.json`. This matters for the 26.3 item `container` component and keeps the generated JSON accepted by `protodef-validator`.

Primary references:

- [Mojang: Minecraft Java Edition 26.3](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-3)
- [Protocol documentation](https://protocol.derklaro.dev/)
- [minecraft-data 26.3 work](https://github.com/PrismarineJS/minecraft-data/pull/1300)
- [minecraft-data data update](https://github.com/PrismarineJS/minecraft-data/pull/1301)

## Data and gameplay changes represented here

The native registry includes the new 26.3 names used by the release, including `poplar_log`, `red_poplar_leaves`, `shelf_mushroom`, `white_cushion`, `straw_bed`, and the `dappled_forest` biome. Generic Mineflayer block, item, chunk, and entity APIs expose these through the normal versioned data lookup; no 26.3-specific high-level API was added.

## Validation performed

- Official vanilla 26.3 server jar: `server_jars/minecraft_server.26.3.jar`
- SHA-1: `33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c`
- Offline-mode login, configuration, spawn, chunk loading, chat, movement, and sustained connection were verified.
- The vanilla movement test specifically exercises repeated position packets and confirms that the bot is not kicked for invalid movement.
- `minecraft-data` protocol sync and schema validation cover every registered version, including 26.3.
- `prismarine-chunk` round-trips 26.3 sections and validates the larger global palette.
- `node-minecraft-protocol` has 26.3 serializer/deserializer and `entityDelta` round-trip regression tests.
- Mineflayer 26.2 and 26.3 pure/integration tests cover the version selection and movement adapter.

The test servers run in offline mode. No Microsoft account or online-mode session was available, so online authentication is intentionally outside the evidence recorded here. Paper, Spigot, and other server implementations were not used as release gates; their 26.3 support should be treated as a separate compatibility matrix.

## Performance comparison

The repeated baseline is recorded in [minecraft-26.3-performance-baseline.json](minecraft-26.3-performance-baseline.json). On the same Windows/Node environment, the 26.3 median p95 changed by +6.13% for position encode/decode and -5.86% for chunk block-state set/get; peak RSS changed by +1.57%. No measured regression exceeded the agreed 10% investigation threshold.

## Maintenance notes

The 26.3 data and protocol work is local to this private fork. Before publishing or switching back to npm dependencies, replace the local sibling links with immutable released commits, regenerate the data from the upstream generator inputs, and rerun the offline and online server matrices.
