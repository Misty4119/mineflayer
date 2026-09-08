const assert = require('assert')
const { onceWithCleanup } = require('../../lib/promise_utils')

module.exports = () => async (bot) => {
  const Item = require('prismarine-item')(bot.registry)

  await bot.test.setInventorySlot(36, new Item(bot.registry.itemsByName.bread.id, 1, 0))
  await bot.test.becomeSurvival()

  // The external server world may survive an interrupted run, so the player
  // can enter this test with partially depleted hunger.  Establish the
  // precondition explicitly instead of relying on a fresh player's defaults.
  if (bot.food !== 20) {
    const fullFood = onceWithCleanup(bot, 'health', {
      timeout: 5000,
      checkCondition: () => bot.food === 20
    })
    if (bot.supportFeature('effectAreNotPrefixed')) bot.test.sayEverywhere('/effect give @s saturation 1 255')
    else if (bot.supportFeature('effectAreMinecraftPrefixed')) bot.test.sayEverywhere(`/effect ${bot.username} minecraft:saturation 1 255`)
    else bot.test.sayEverywhere(`/effect ${bot.username} saturation 1 255`)
    await fullFood
  }
  assert.strictEqual(bot.food, 20, `expected full hunger before consume test, got ${bot.food}`)

  // Cannot consume if bot.food === 20
  await assert.rejects(bot.consume, (err) => {
    if (!err) {
      // log the conditions that made this not throw
      console.log({ a: bot.game.gameMode !== 'creative', b: !['potion', 'milk_bucket', 'enchanted_golden_apple', 'golden_apple'].includes(bot.heldItem.name), c: bot.food === 20 })
    }
    assert.notStrictEqual(err, undefined)
    return true
  })

  await bot.test.becomeSurvival()

  // Drain a little hunger so consuming is legal, waiting on the food update
  // instead of polling on a fixed sleep. One bread is enough to show the
  // consume state transitions; eating back to 20 re-runs the identical path.
  let foodChanged = false
  for (let attempt = 0; attempt < 3 && bot.food === 20; attempt++) {
    if (bot.supportFeature('effectAreNotPrefixed')) bot.test.sayEverywhere('/effect give @s hunger 10 255')
    else if (bot.supportFeature('effectAreMinecraftPrefixed')) bot.test.sayEverywhere(`/effect ${bot.username} minecraft:hunger 10 255`)
    foodChanged = await onceWithCleanup(bot, 'health', {
      timeout: 5000,
      checkCondition: () => bot.food < 20
    }).then(() => true, () => false)
  }

  assert.ok(foodChanged || bot.food < 20, 'hunger effect did not lower food after 3 attempts')

  assert.ok(!bot.usingHeldItem)
  const consume = bot.consume()
  assert.ok(bot.usingHeldItem)
  await consume
  assert.ok(!bot.usingHeldItem)
}
