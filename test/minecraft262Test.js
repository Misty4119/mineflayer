/* eslint-env mocha */

const assert = require('assert')
const minecraftData = require('minecraft-data')('26.2')
const minecraftProtocol = require('minecraft-protocol')
const registry = require('prismarine-registry')('26.2')
const Chunk = require('prismarine-chunk')('26.2')
const digEverything = require('./externalTests/digEverything')('26.2')

describe('Minecraft 26.2 support', function () {
  it('loads the native 26.2 data set', function () {
    assert.strictEqual(minecraftData.version.version, 776)
    assert.strictEqual(minecraftData.version.dataVersion, 4903)
    assert.ok(minecraftData.blocksByName.sulfur)
    assert.ok(minecraftData.itemsByName.sulfur)
    assert.ok(minecraftData.entitiesByName.sulfur_cube)
    assert.ok(minecraftData.biomesByName.sulfur_caves)
    assert.strictEqual(registry.version, minecraftData.version)
  })

  it('exposes the 26.2 packet shapes and feature flags', function () {
    const loginSuccess = JSON.stringify(minecraftData.protocol.login.toClient.types.packet_success)
    const playLogin = JSON.stringify(minecraftData.protocol.play.toClient.types.packet_login)
    const toClient = minecraftData.protocol.play.toClient.types
    const toServer = minecraftData.protocol.play.toServer.types
    const updateTime = JSON.stringify(toClient.packet_update_time)
    const useEntity = JSON.stringify(toServer.packet_use_entity)
    const teams = JSON.stringify(toClient.packet_teams)

    assert.ok(loginSuccess.includes('sessionId'))
    assert.ok(playLogin.includes('onlineMode'))
    assert.ok(updateTime.includes('gameTime'))
    assert.ok(updateTime.includes('clock'))
    assert.ok(useEntity.includes('usingSecondaryAction'))
    assert.ok(teams.includes('friendly_fire'))
    assert.ok(toServer.packet_attack)
    assert.ok(toServer.packet_player_loaded)
    assert.strictEqual(minecraftData.supportFeature('attackUsesOwnPacket'), true)
    assert.strictEqual(minecraftData.supportFeature('sendsPlayerLoadedPacket'), true)
    assert.strictEqual(minecraftData.supportFeature('enchantmentsComponentIsFlat'), true)
    assert.strictEqual(minecraftData.supportFeature('loginSuccessIncludesSessionId'), true)
    assert.strictEqual(minecraftData.supportFeature('fishingBiteDelayMaxTicks'), 600)
    assert.ok(minecraftData.entitiesByName.player.metadataKeys.includes('pose'))
    assert.ok(minecraftData.entitiesByName.fishing_bobber.metadataKeys.includes('biting'))
  })

  it('round-trips a 26.2 block state through prismarine-chunk', function () {
    const chunk = new Chunk()
    const sulfurId = minecraftData.blocksByName.sulfur.id

    chunk.setBlockType({ x: 0, y: 0, z: 0 }, sulfurId)
    assert.strictEqual(chunk.getBlockType({ x: 0, y: 0, z: 0 }), sulfurId)
  })

  it('keeps the exhaustive dig matrix aligned with item-backed blocks', function () {
    const blockNames = Object.keys(digEverything)

    assert.ok(blockNames.length > 1000)
    assert.ok(blockNames.includes('sulfur'))
    assert.ok(blockNames.includes('cinnabar'))
    assert.ok(!blockNames.includes('water'))
    assert.ok(!blockNames.includes('lava'))
    for (const blockName of blockNames) {
      assert.ok(registry.itemsByName[blockName], `${blockName} must have a matching item`)
    }
  })

  it('round-trips the 26.2 login success session id', function () {
    const serializer = minecraftProtocol.createSerializer({
      state: minecraftProtocol.states.LOGIN,
      isServer: true,
      version: '26.2'
    })
    const deserializer = minecraftProtocol.createDeserializer({
      state: minecraftProtocol.states.LOGIN,
      version: '26.2',
      noErrorLogging: true
    })
    const packet = {
      name: 'success',
      params: {
        uuid: '00112233-4455-6677-8899-aabbccddeeff',
        username: 'Player',
        properties: [],
        sessionId: 'ffeeddcc-bbaa-9988-7766-554433221100'
      }
    }

    const buffer = serializer.createPacketBuffer(packet)
    const parsed = deserializer.parsePacketBuffer(buffer)

    assert.strictEqual(parsed.data.name, 'success')
    assert.strictEqual(parsed.data.params.sessionId, packet.params.sessionId)
  })

  it('serializes typed components in the 26.2 creative slot packet', function () {
    const serializer = minecraftProtocol.createSerializer({
      state: minecraftProtocol.states.PLAY,
      version: '26.2'
    })
    const buffer = serializer.createPacketBuffer({
      name: 'set_creative_slot',
      params: {
        slot: 36,
        item: {
          present: true,
          itemCount: 1,
          itemId: minecraftData.itemsByName.diamond_sword.id,
          addedComponentCount: 1,
          removedComponentCount: 0,
          components: [{
            type: 'enchantments',
            data: { enchantments: [{ id: minecraftData.enchantmentsByName.sharpness.id, level: 5 }] }
          }],
          removeComponents: []
        }
      }
    })

    assert.strictEqual(buffer.toString('hex'), '38002401c40701000d03012105')
  })

  it('uses the 26.2 spectator_action packet id and optional target', function () {
    const serializer = minecraftProtocol.createSerializer({
      state: minecraftProtocol.states.PLAY,
      version: '26.2'
    })
    const deserializer = minecraftProtocol.createDeserializer({
      state: minecraftProtocol.states.PLAY,
      isServer: true,
      version: '26.2',
      noErrorLogging: true
    })

    const emptyTarget = serializer.createPacketBuffer({
      name: 'spectator_action',
      params: { entityId: null }
    })
    const entityTarget = serializer.createPacketBuffer({
      name: 'spectator_action',
      params: { entityId: 123 }
    })

    assert.strictEqual(emptyTarget.toString('hex'), '3e00')
    assert.strictEqual(entityTarget.toString('hex'), '3e017b')
    assert.deepStrictEqual(deserializer.parsePacketBuffer(emptyTarget).data.params, { entityId: undefined })
    assert.deepStrictEqual(deserializer.parsePacketBuffer(entityTarget).data.params, { entityId: 123 })
  })

  it('keeps the 26.2 teams optional color before the trailing flags byte', function () {
    const serializer = minecraftProtocol.createSerializer({
      state: minecraftProtocol.states.PLAY,
      isServer: true,
      version: '26.2'
    })
    const deserializer = minecraftProtocol.createDeserializer({
      state: minecraftProtocol.states.PLAY,
      version: '26.2',
      noErrorLogging: true
    })
    const displayName = {
      type: 'compound',
      name: '',
      value: { text: { type: 'string', value: 'T' } }
    }
    const packet = {
      name: 'teams',
      params: {
        team: 't',
        mode: 'add',
        displayName,
        prefix: displayName,
        suffix: displayName,
        nameTagVisibility: 'always',
        collisionRule: 'always',
        color: null,
        flags: { friendly_fire: true, see_friendly_invisible: false },
        players: []
      }
    }

    const buffer = serializer.createPacketBuffer(packet)
    const parsed = deserializer.parsePacketBuffer(buffer)

    assert.strictEqual(buffer.toString('hex'), '6d0174000a08000474657874000154000a08000474657874000154000a08000474657874000154000000000100')
    assert.strictEqual(parsed.data.name, 'teams')
    assert.strictEqual(parsed.data.params.color, undefined)
    assert.strictEqual(parsed.data.params.flags.friendly_fire, true)
    assert.strictEqual(parsed.data.params.players.length, 0)
  })

  it('fails safely on a truncated 26.2 spectator_action packet', function () {
    const deserializer = minecraftProtocol.createDeserializer({
      state: minecraftProtocol.states.PLAY,
      isServer: true,
      version: '26.2',
      noErrorLogging: true
    })

    assert.throws(() => deserializer.parsePacketBuffer(Buffer.from([0x3e])), error => error.partialReadError === true)
  })
})
