/* eslint-env mocha */

const assert = require('assert')
const mineflayer = require('../')
const minecraftProtocol = require('minecraft-protocol')
const conv = require('../lib/conversions')
const { once } = require('../lib/promise_utils')
const { Vec3 } = require('vec3')
const { getPort } = require('./common/util')

describe('Minecraft 26.3 live protocol adapters', function () {
  this.timeout(10000)
  let bot
  let client
  let server
  const packets = []

  before(async function () {
    const port = await getPort()
    const registry = require('prismarine-registry')('26.3')

    server = minecraftProtocol.createServer({
      'online-mode': false,
      version: '26.3',
      port
    })
    await once(server, 'listening')

    bot = mineflayer.createBot({
      username: 'player263',
      version: '26.3',
      port
    })

    server.on('playerJoin', async joinedClient => {
      client = joinedClient
      client.on('packet', (data, meta) => {
        if (['teleport_confirm', 'position', 'position_look', 'flying', 'tick_end', 'player_loaded', 'block_dig', 'update_sign'].includes(meta.name)) {
          packets.push({ data, name: meta.name })
        }
      })

      const loginPacket = { ...registry.loginPacket, entityId: 0 }
      await client.write('login', loginPacket)
      await client.write('position', {
        teleportId: 1,
        x: 1.5,
        y: 66,
        z: 1.5,
        dx: 0,
        dy: 0,
        dz: 0,
        yaw: 0,
        pitch: 0,
        flags: { x: false, y: false, z: false, yaw: false, pitch: false, dx: false, dy: false, dz: false, yawDelta: false }
      })
      await client.write('update_health', { health: 20, food: 20, foodSaturation: 5 })
    })

    await once(bot, 'spawn')
  })

  after(async function () {
    server.close()
    await once(bot, 'end')
  })

  function waitForPacket (name, predicate = () => true) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.removeListener('packet', onPacket)
        reject(new Error(`timed out waiting for ${name}`))
      }, 3000)
      function onPacket (data, meta) {
        if (meta.name !== name || !predicate(data)) return
        clearTimeout(timeout)
        client.removeListener('packet', onPacket)
        resolve(data)
      }
      client.on('packet', onPacket)
    })
  }

  function waitForEntityEvent (eventName, entityId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        bot.removeListener(eventName, onEvent)
        reject(new Error(`timed out waiting for ${eventName} for entity ${entityId}`))
      }, 3000)
      function onEvent (entity) {
        if (entity.id !== entityId) return
        clearTimeout(timeout)
        bot.removeListener(eventName, onEvent)
        resolve(entity)
      }
      bot.on(eventName, onEvent)
    })
  }

  it('completes login and emits client tick end packets', async function () {
    assert.match(server.sessionId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

    await new Promise(resolve => setTimeout(resolve, 150))

    assert.ok(packets.some(packet => packet.name === 'teleport_confirm'))
    assert.ok(packets.some(packet => packet.name === 'player_loaded'))
    assert.ok(packets.some(packet => packet.name === 'tick_end'))
    assert.strictEqual(packets.filter(packet => packet.name === 'position_look').length, 0)
  })

  it('adapts stepped entity deltas and sync positions into entity state', async function () {
    const movedEntity = waitForEntityEvent('entityMoved', 77)
    await client.write('entity_move_look', {
      entityId: 77,
      move: {
        onGround: true,
        steps: [
          { ticks: 1, dX: 128, dY: -64, dZ: 32 },
          { ticks: 2, dX: 64, dY: 0, dZ: -32 }
        ]
      },
      yaw: 0,
      pitch: 0
    })
    const entity = await movedEntity
    assert.deepStrictEqual(entity.position, new Vec3(0.046875, -0.015625, 0))
    assert.strictEqual(entity.onGround, true)

    const syncedEntity = waitForEntityEvent('entityMoved', 78)
    await client.write('sync_entity_position', {
      entityId: 78,
      positionType: 'stepped',
      steps: [
        { x: 1, y: 2, z: 3 },
        { x: 4, y: 5, z: 6 }
      ],
      yaw: 0,
      pitch: 0,
      onGround: true
    })
    const synced = await syncedEntity
    assert.deepStrictEqual(synced.position, new Vec3(4, 5, 6))
    assert.strictEqual(synced.onGround, true)
  })

  it('maps the 26.3 swing packet to the stable entitySwingArm event', async function () {
    const swungEntity = waitForEntityEvent('entitySwingArm', 79)
    await client.write('swing_animation', {
      entityId: 79,
      hand: 'main_hand',
      animationType: 'none',
      duration: 0
    })
    assert.strictEqual((await swungEntity).id, 79)
  })

  it('uses the 26.3 entity animation numbering', async function () {
    const wokenEntity = waitForEntityEvent('entityWake', 80)
    await client.write('animation', { entityId: 80, animation: 0 })
    assert.strictEqual((await wokenEntity).id, 80)
  })

  it('confirms a relative teleport before ending the movement tick', async function () {
    const previousPosition = bot.entity.position.clone()
    const previousYaw = bot.entity.yaw
    const previousPitch = bot.entity.pitch
    const forcedMove = once(bot, 'forcedMove')
    const confirmation = waitForPacket('teleport_confirm', packet => packet.teleportId === 2)
    await client.write('position', {
      teleportId: 2,
      x: 0.25,
      y: 0.5,
      z: -0.125,
      yaw: 5,
      pitch: -3,
      flags: {
        x: true,
        y: true,
        z: true,
        yaw: true,
        pitch: true,
        dx: false,
        dy: false,
        dz: false,
        yawDelta: false
      }
    })
    await forcedMove

    assert.deepStrictEqual(bot.entity.position, previousPosition.plus(new Vec3(0.25, 0.5, -0.125)))
    assert.strictEqual(bot.entity.yaw, conv.fromNotchianYaw(conv.toNotchianYaw(previousYaw) + 5))
    assert.strictEqual(bot.entity.pitch, conv.fromNotchianPitch(conv.toNotchianPitch(previousPitch) - 3))
    assert.strictEqual(bot.entity.onGround, false)
    await confirmation
    const confirmationIndex = packets.findIndex(packet => packet.name === 'teleport_confirm' && packet.data.teleportId === 2)
    assert.notStrictEqual(confirmationIndex, -1, 'relative teleport confirmation must be sent')
    assert.strictEqual(packets[confirmationIndex + 1]?.name, 'tick_end', 'tick_end must follow teleport confirmation')
  })

  it('applies absolute teleport coordinates and rotations', async function () {
    const forcedMove = once(bot, 'forcedMove')
    const confirmation = waitForPacket('teleport_confirm', packet => packet.teleportId === 3)
    bot.entity.velocity.y = -1
    await client.write('position', {
      teleportId: 3,
      x: 3.5,
      y: 67,
      z: -2,
      yaw: 90,
      pitch: -10,
      flags: {
        x: false,
        y: false,
        z: false,
        yaw: false,
        pitch: false,
        dx: false,
        dy: false,
        dz: false,
        yawDelta: false
      }
    })
    await forcedMove
    await confirmation

    assert.deepStrictEqual(bot.entity.position, new Vec3(3.5, 67, -2))
    assert.strictEqual(bot.entity.yaw, conv.fromNotchianYaw(90))
    assert.strictEqual(bot.entity.pitch, conv.fromNotchianPitch(-10))
    assert.strictEqual(bot.entity.velocity.y, 0)
    const confirmationIndex = packets.findIndex(packet => packet.name === 'teleport_confirm' && packet.data.teleportId === 3)
    assert.strictEqual(packets[confirmationIndex + 1]?.name, 'tick_end', 'tick_end must follow teleport confirmation')
  })

  it('uses protocol 777 digging statuses and front/back sign slots', async function () {
    const startPacket = waitForPacket('block_dig', packet => packet.status === 0)
    const cancelPacket = waitForPacket('block_dig', packet => packet.status === 2)
    const digPromise = bot.dig({
      position: new Vec3(2, 64, 2),
      diggable: true,
      shapes: [],
      digTime: () => 1000
    }, 'ignore')
    const digRejection = assert.rejects(digPromise, /Digging aborted/)
    bot.stopDigging()
    await Promise.all([startPacket, cancelPacket, digRejection])

    const frontSign = waitForPacket('update_sign', packet => packet.slot === 'front')
    bot.updateSign({ position: new Vec3(2, 64, 2) }, 'front text')
    const front = await frontSign
    assert.strictEqual(front.text1, 'front text')

    const backSign = waitForPacket('update_sign', packet => packet.slot === 'back')
    bot.updateSign({ position: new Vec3(2, 64, 2) }, 'back text', true)
    const back = await backSign
    assert.strictEqual(back.text1, 'back text')
  })
})
