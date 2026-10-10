const assert = require('assert')
const { Vec3 } = require('vec3')
const { onceWithCleanup } = require('../../lib/promise_utils')

module.exports = (version) => {
  if (version !== '26.3') return {}

  return {
    'relative teleport': async (bot) => {
      const previousPosition = bot.entity.position.clone()
      const positionPacket = onceWithCleanup(bot._client, 'position', {
        timeout: 5000,
        checkCondition: packet => packet.flags?.x || packet.flags?.y || packet.flags?.z
      })
      const forcedMove = onceWithCleanup(bot, 'forcedMove', { timeout: 5000 })
      const outbound = []
      const originalWrite = bot._client.write
      bot._client.write = function (name, params) {
        if (['teleport_confirm', 'tick_end', 'position', 'position_look', 'look', 'flying'].includes(name)) {
          outbound.push(name)
        }
        return originalWrite.call(this, name, params)
      }

      try {
        bot.chat('/tp @s ~1 ~ ~')
        const [packet] = await positionPacket
        await forcedMove

        const expectedPosition = new Vec3(
          packet.flags.x ? previousPosition.x + packet.x : packet.x,
          packet.flags.y ? previousPosition.y + packet.y : packet.y,
          packet.flags.z ? previousPosition.z + packet.z : packet.z
        )
        assert.deepStrictEqual(bot.entity.position, expectedPosition)
        assert.ok(packet.flags.x || packet.flags.y || packet.flags.z, 'Vanilla should send a relative position flag')

        const confirmationIndex = outbound.lastIndexOf('teleport_confirm')
        assert.notStrictEqual(confirmationIndex, -1, 'Mineflayer should confirm Vanilla\'s relative teleport')
        assert.strictEqual(outbound[confirmationIndex + 1], 'tick_end', 'tick_end should end the teleport confirmation tick')

        await new Promise(resolve => setTimeout(resolve, 150))
        assert.notStrictEqual(bot.test.disconnected, true, 'Vanilla should keep the bot connected after a relative teleport')
      } finally {
        bot._client.write = originalWrite
      }
    }
  }
}
