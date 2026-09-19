/* eslint-env mocha */

const assert = require('assert')
const minecraftData = require('minecraft-data')
const minecraftProtocol = require('minecraft-protocol')
const { latestSupportedVersion } = require('../lib/version')

describe('Minecraft Java 26.3 support', function () {
  it('loads native 26.3 protocol and game data through the public registry API', function () {
    assert.strictEqual(latestSupportedVersion, '26.3')

    const data = minecraftData('26.3')
    assert.ok(data, 'minecraft-data must provide a native 26.3 dataset')
    assert.strictEqual(data.version.version, 777)
    assert.strictEqual(data.version.dataVersion, 5023)
    assert.ok(data.blocksByName.poplar_log)
    assert.ok(data.itemsByName.white_cushion)
    assert.ok(data.biomesByName.dappled_forest)
    assert.ok(data.entitiesByName.player.metadataKeys.includes('pose'))
  })

  it('writes the 26.3 protocol number in the public handshake serializer', function () {
    const serializer = minecraftProtocol.createSerializer({
      state: minecraftProtocol.states.HANDSHAKING,
      version: '26.3',
      isServer: false
    })
    const packet = serializer.createPacketBuffer({
      name: 'set_protocol',
      params: {
        protocolVersion: 777,
        serverHost: 'localhost',
        serverPort: 25565,
        nextState: 1
      }
    })

    assert.strictEqual(packet.toString('hex'), '008906096c6f63616c686f737463dd01')
  })
})
