/* eslint-env mocha */

const assert = require('assert')
const minecraftData = require('minecraft-data')
const minecraftProtocol = require('minecraft-protocol')
const { Vec3 } = require('vec3')
const registry = require('prismarine-registry')('26.3')
const digEverything = require('./externalTests/digEverything')('26.3')
const Particle = require('../lib/particle')(registry)
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

  it('keeps the exhaustive dig matrix aligned with item-backed blocks', function () {
    const blockNames = Object.keys(digEverything)

    assert.ok(blockNames.length > 1000)
    assert.ok(blockNames.includes('poplar_log'))
    assert.ok(blockNames.includes('raw_iron_block'))
    assert.ok(!blockNames.includes('water'))
    assert.ok(!blockNames.includes('lava'))
    for (const blockName of blockNames) {
      assert.ok(registry.blocksByName[blockName], `${blockName} must exist in the block registry`)
      assert.ok(registry.itemsByName[blockName], `${blockName} must have a matching item`)
    }
  })

  it('keeps packet feature gates aligned across 26.2 and 26.3', function () {
    const data262 = minecraftData('26.2')
    const data263 = minecraftData('26.3')

    assert.strictEqual(data262.supportFeature('teamPacketUsesOptionalColor'), true)
    assert.strictEqual(data263.supportFeature('teamPacketUsesOptionalColor'), true)
    assert.strictEqual(data262.supportFeature('useEntityUsesSecondaryAction'), true)
    assert.strictEqual(data263.supportFeature('useEntityUsesSecondaryAction'), true)
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

    const slotTypes = data.protocol.types.SlotComponentType[1].mappings
    assert.strictEqual(Object.keys(slotTypes).length, 122)
    assert.strictEqual(slotTypes[40], 'attack_animation')
    assert.strictEqual(slotTypes[43], 'block_transformer')
    assert.strictEqual(slotTypes[121], 'cushion/color')

    const swingFields = data.protocol.play.toClient.types.packet_swing_animation[1]
    assert.deepStrictEqual(
      swingFields.map(field => field.name),
      ['entityId', 'hand', 'animationType', 'duration']
    )

    const lightFields = data.protocol.play.toClient.types.packet_update_light[1]
    assert.deepStrictEqual(
      lightFields.slice(2, 6).map(field => field.type),
      ['ByteArray', 'ByteArray', 'ByteArray', 'ByteArray']
    )
  })

  it('loads official 26.3 item-component wire shapes through the vendored registry', function () {
    const data = minecraftData('26.3')
    const slotFields = data.protocol.types.SlotComponent[1]
      .find(field => field.name === 'data').type[1].fields

    assert.strictEqual(slotFields.damage_resistant, 'IDSet')
    assert.strictEqual(slotFields.provides_banner_patterns, 'IDSet')
    assert.deepStrictEqual(
      slotFields.pot_decorations[1].map(({ name, type }) => [name, type]),
      [
        ['back', ['option', 'ItemStackTemplate']],
        ['left', ['option', 'ItemStackTemplate']],
        ['right', ['option', 'ItemStackTemplate']],
        ['front', ['option', 'ItemStackTemplate']]
      ]
    )

    const effectFields = data.protocol.types.ItemConsumeEffect[1]
    const variants = effectFields.find(({ anon }) => anon).type[1].fields
    assert.deepStrictEqual(
      variants.teleport_randomly[1].map(({ name, type }) => [name, type]),
      [['diameter', 'f32'], ['directionalParticles', 'bool']]
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

  it('preserves the 26.3 particle speed vector, randomization, visibility, and payload', function () {
    const particleData = registry.blocksByName.stone.id
    const particle = Particle.fromNetwork({
      particle: { type: 'block', data: particleData },
      x: 0.5,
      y: 64,
      z: -2,
      offsetX: 5,
      offsetY: 5,
      offsetZ: 5,
      xMaxSpeed: 0.125,
      yMaxSpeed: 0.25,
      zMaxSpeed: 0.75,
      amount: 100,
      longDistance: true,
      alwaysShow: true,
      randomizationType: 'alternative_with_speed'
    })

    assert.strictEqual(particle.name, 'block')
    assert.strictEqual(particle.position.x, 0.5)
    assert.strictEqual(particle.movementSpeed, 0.125)
    assert.strictEqual(particle.longDistanceRender, true)
    assert.deepStrictEqual(particle.maxSpeed, new Vec3(0.125, 0.25, 0.75))
    assert.strictEqual(particle.randomizationType, 'alternative_with_speed')
    assert.strictEqual(particle.alwaysShow, true)
    assert.strictEqual(particle.data, particleData)
  })

  it('keeps the legacy scalar particle speed compatible with the axis vector', function () {
    const registry262 = require('prismarine-registry')('26.2')
    const Particle262 = require('../lib/particle')(registry262)
    const particle = Particle262.fromNetwork({
      particle: { type: 'angry_villager' },
      x: 0,
      y: 0,
      z: 0,
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
      velocityOffset: 0.5,
      amount: 1,
      longDistance: false
    })

    assert.strictEqual(particle.movementSpeed, 0.5)
    assert.deepStrictEqual(particle.maxSpeed, new Vec3(0.5, 0.5, 0.5))
    assert.strictEqual(particle.randomizationType, undefined)
    assert.strictEqual(particle.alwaysShow, false)
  })
})
