const assert = require('assert')
const { once } = require('../../lib/promise_utils')

module.exports = () => async (bot) => {
  bot.test.sayEverywhere('/weather clear')
  // 26.2 fades rain over several seconds and does not accept a new weather
  // transition as a stop/start pair until the previous transition finishes.
  // Wait for the actual state change when the bot still believes it is raining;
  // otherwise retain the short settling delay for an already-clear world.
  if (bot.isRaining) await once(bot, 'rain')
  else await bot.test.wait(1000)
  bot.test.sayEverywhere('/weather rain')

  await once(bot, 'rain')
  assert.strictEqual(bot.isRaining, true)
  bot.test.sayEverywhere('/weather clear')

  await once(bot, 'rain')
  assert.strictEqual(bot.isRaining, false)
}
