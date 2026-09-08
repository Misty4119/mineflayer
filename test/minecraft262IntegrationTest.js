/* eslint-env mocha */

const assert = require('assert')
const mineflayer = require('../')
const minecraftProtocol = require('minecraft-protocol')
const nbt = require('prismarine-nbt')
const { once } = require('../lib/promise_utils')
const { getPort } = require('./common/util')

describe('Minecraft 26.2 protocol adapters', function () {
  this.timeout(10000)
  let bot
  let client
  let server
  let packets

  function chatText (text) {
    return nbt.comp({ text: nbt.string(text) })
  }

  before(async function () {
    const port = await getPort()
    const registry = require('prismarine-registry')('26.2')

    server = minecraftProtocol.createServer({
      'online-mode': false,
      version: '26.2',
      port
    })
    await once(server, 'listening')

    bot = mineflayer.createBot({
      username: 'player',
      version: '26.2',
      port
    })

    server.on('playerJoin', async joinedClient => {
      client = joinedClient
      packets = []
      client.on('packet', (data, meta) => {
        if (['player_loaded', 'attack', 'use_entity'].includes(meta.name)) {
          packets.push({ data, name: meta.name })
        }
      })
      const loginPacket = { ...registry.loginPacket, entityId: 0 }
      await client.write('login', loginPacket)
      await client.write('update_health', { health: 20, food: 20, foodSaturation: 5 })
    })

    await once(bot, 'spawn')
  })

  after(async function () {
    server.close()
    await once(bot, 'end')
  })

  it('sends player_loaded and the split attack/use_entity packets', async function () {
    assert.match(server.sessionId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    bot.attack({ id: 42 }, false)
    bot.useOn({ id: 43 })
    const lookAt = bot.lookAt
    bot.lookAt = async () => {}
    await bot.activateEntity({ id: 44, position: bot.entity.position.offset(0, 0, 2) })
    bot.lookAt = lookAt

    await new Promise(resolve => setTimeout(resolve, 50))
    assert.ok(packets.some(packet => packet.name === 'player_loaded'))
    assert.deepStrictEqual(
      packets.filter(packet => packet.name === 'attack')[0].data,
      { entityId: 42 }
    )
    const useEntityPackets = packets.filter(packet => packet.name === 'use_entity')
    assert.strictEqual(useEntityPackets.length, 2)
    for (const packet of useEntityPackets) {
      assert.strictEqual(packet.data.hand, 0)
      assert.strictEqual(packet.data.usingSecondaryAction, false)
    }
  })

  it('normalizes 26.2 clock updates', async function () {
    const time = once(bot, 'time')
    client.write('update_time', {
      gameTime: 123n,
      clockUpdates: [{ clock: 0, totalTicks: 456, partialTick: 0.25, rate: 1 }]
    })
    await time

    assert.strictEqual(bot.time.bigAge, 123n)
    assert.strictEqual(bot.time.bigTime, 456n)
    assert.strictEqual(bot.time.doDaylightCycle, true)
  })

  it('normalizes 26.2 team fields', async function () {
    const created = once(bot, 'teamCreated')
    client.write('teams', {
      team: 'sulfur',
      mode: 'add',
      displayName: chatText('Sulfur'),
      prefix: chatText('['),
      suffix: chatText(']'),
      nameTagVisibility: 'always',
      collisionRule: 'always',
      color: 12,
      flags: { friendly_fire: true, see_friendly_invisible: false },
      players: ['player']
    })
    const [team] = await created

    assert.strictEqual(team.color, 'red')
    assert.deepStrictEqual(team.members, ['player'])
    assert.strictEqual(bot.teamMap.player, team)
  })
})
