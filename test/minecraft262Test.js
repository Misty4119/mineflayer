/* eslint-env mocha */

const assert = require('assert')
const minecraftData = require('minecraft-data')('26.2')
const registry = require('prismarine-registry')('26.2')
const Chunk = require('prismarine-chunk')('26.2')

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
})
