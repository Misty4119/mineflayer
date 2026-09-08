const assert = require('assert')
const { onceWithCleanup } = require('../../lib/promise_utils')

module.exports = () => async (bot) => {
  const particleData = bot.registry.particles[0]

  const particle = onceWithCleanup(bot, 'particle', {
    timeout: 5000,
    checkCondition: particle => {
      if (typeof particle.id === 'number') {
        assert.strictEqual(particle.id, particleData.id)
      } else {
        assert.strictEqual(particle.id, particleData.name)
      }
      assert.strictEqual(particle.name, particleData.name)
      assert.strictEqual(particle.position.x, bot.entity.position.x)
      assert.strictEqual(particle.position.y, bot.entity.position.y)
      assert.strictEqual(particle.position.z, bot.entity.position.z)
      assert.strictEqual(particle.offset.x, 5)
      assert.strictEqual(particle.offset.y, 5)
      assert.strictEqual(particle.offset.z, 5)
      assert.strictEqual(particle.count, 100)
      assert.strictEqual(particle.movementSpeed, 0.5)
      assert.strictEqual(particle.longDistanceRender, true)
      return true
    }
  })

  bot.chat(`/particle ${particleData.name} ~ ~ ~ 5 5 5 0.5 100 force`)
  await particle
}
