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

  it('matches the 26.3 entity metadata and light mask wire types', function () {
    const data = minecraftData('26.3')
    const metadataType = data.protocol.types.entityMetadataEntry[1]
      .find(field => field.name === 'type').type[1].mappings
    assert.strictEqual(metadataType[8], 'boolean')
    assert.strictEqual(metadataType[9], 'rotations')
    assert.strictEqual(metadataType[14], 'block_state')
    assert.strictEqual(metadataType[20], 'pose')
    assert.strictEqual(metadataType[35], 'sniffer_state')
    assert.strictEqual(metadataType[36], 'armadillo_state')
    assert.strictEqual(metadataType[43], 'dye_color')

    const lightFields = data.protocol.play.toClient.types.packet_update_light[1]
    assert.deepStrictEqual(
      lightFields.slice(2, 6).map(field => field.type),
      ['ByteArray', 'ByteArray', 'ByteArray', 'ByteArray']
    )
  })

  it('round-trips the 26.3 metadata, punch, sign, and teleport packets', function () {
    const clientboundSerializer = minecraftProtocol.createSerializer({
      state: minecraftProtocol.states.PLAY,
      version: '26.3',
      isServer: true
    })
    const clientboundDeserializer = minecraftProtocol.createDeserializer({
      state: minecraftProtocol.states.PLAY,
      version: '26.3',
      noErrorLogging: true
    })
    const metadataBuffer = clientboundSerializer.createPacketBuffer({
      name: 'entity_metadata',
      params: {
        entityId: 1,
        metadata: [{ key: 0, type: 'boolean', value: true }]
      }
    })
    assert.deepStrictEqual(
      clientboundDeserializer.parsePacketBuffer(metadataBuffer).data.params.metadata,
      [{ key: 0, type: 'boolean', value: true }]
    )

    const serverboundSerializer = minecraftProtocol.createSerializer({
      state: minecraftProtocol.states.PLAY,
      version: '26.3'
    })
    const serverboundDeserializer = minecraftProtocol.createDeserializer({
      state: minecraftProtocol.states.PLAY,
      version: '26.3',
      isServer: true,
      noErrorLogging: true
    })
    const punchBuffer = serverboundSerializer.createPacketBuffer({ name: 'punch', params: {} })
    assert.strictEqual(punchBuffer[0], 0x2e)

    const signBuffer = serverboundSerializer.createPacketBuffer({
      name: 'update_sign',
      params: {
        location: { x: 1, y: 64, z: 2 },
        text1: 'a',
        text2: '',
        text3: '',
        text4: '',
        slot: 'front'
      }
    })
    const sign = serverboundDeserializer.parsePacketBuffer(signBuffer).data
    assert.strictEqual(sign.name, 'update_sign')
    assert.strictEqual(sign.params.slot, 'front')
    assert.strictEqual(sign.params.text1, 'a')

    const teleportBuffer = serverboundSerializer.createPacketBuffer({
      name: 'teleport_confirm',
      params: { teleportId: 7, x: 1.5, y: 64, z: -2.25, yRot: 90, xRot: -10 }
    })
    const teleport = serverboundDeserializer.parsePacketBuffer(teleportBuffer).data
    assert.deepStrictEqual(teleport.params, {
      teleportId: 7,
      x: 1.5,
      y: 64,
      z: -2.25,
      yRot: 90,
      xRot: -10
    })
  })
})
