/* eslint-env mocha */

const assert = require('assert')
const mineflayer = require('../')
const minecraftProtocol = require('minecraft-protocol')
const { once } = require('../lib/promise_utils')
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
        if (['teleport_confirm', 'position', 'position_look', 'flying', 'tick_end', 'player_loaded'].includes(meta.name)) {
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

  it('completes login and emits client tick end packets', async function () {
    assert.match(server.sessionId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

    await new Promise(resolve => setTimeout(resolve, 150))

    assert.ok(packets.some(packet => packet.name === 'teleport_confirm'))
    assert.ok(packets.some(packet => packet.name === 'player_loaded'))
    assert.ok(packets.some(packet => packet.name === 'tick_end'))
    assert.strictEqual(packets.filter(packet => packet.name === 'position_look').length, 0)
  })
})
