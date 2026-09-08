const assert = require('assert')
const Vec3 = require('vec3')
const { once, sleep, onceWithCleanup } = require('../../lib/promise_utils')

module.exports = () => async (bot) => {
  // Test spawn event on death
  const Item = require('prismarine-item')(bot.registry)
  const portalName = bot.registry.blocksByName.nether_portal ? 'nether_portal' : 'portal'

  let signItem = null
  for (const name in bot.registry.itemsByName) {
    if (name.includes('sign') && !name.includes('hanging')) signItem = bot.registry.itemsByName[name]
  }
  assert.notStrictEqual(signItem, null)

  // A portal's link goes inert after a failed attempt at the same spot, so
  // each retry must use a fresh location or it is guaranteed to time out.
  bot.test.netherAttempts ??= 0
  const attempt = ++bot.test.netherAttempts
  const returnsByDeath = !bot.supportFeature('hasExecuteCommand')
  const portalPosition = new Vec3((attempt - 1) * 4, bot.test.groundY, 0)
  await bot.test.teleport(portalPosition)
  if (returnsByDeath) {
    // Old servers respawn a Nether death at the player's spawn point. Keep it
    // away from the entry portal or the fresh player immediately re-enters it
    // while the test is handing control back to the next case.
    bot.chat(`/spawnpoint ${bot.username} 12 ${bot.test.groundY} 0`)
  }
  bot.chat(`/setblock ~ ~ ~ ${portalName}`)
  await onceWithCleanup(bot, 'spawn', { timeout: 30000 })
  bot.test.sayEverywhere('/tp 0 128 0')

  await once(bot, 'forcedMove')
  await bot.waitForChunksToLoad()

  // Poll until the block below is loaded and non-air before placing.
  // On slow CI, chunks may report as loaded before block data is ready.
  let lowerBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0))
  for (let attempts = 0; attempts < 50 && (!lowerBlock || lowerBlock.name === 'air'); attempts++) {
    await sleep(100)
    lowerBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0))
  }
  assert.ok(lowerBlock && lowerBlock.name !== 'air', 'solid block below player was not loaded')

  await bot.lookAt(lowerBlock.position, true)
  await bot.test.setInventorySlot(36, new Item(signItem.id, 1, 0))
  const signOpen = onceWithCleanup(bot, 'signOpen', { timeout: 5000 })
  await bot.placeBlock(lowerBlock, new Vec3(0, 1, 0))

  // The server opens the sign editor once the sign is placed.
  const [sign] = await signOpen
  bot.updateSign(sign, '1\n2\n3\n')

  // Wait for the server to echo the new text back rather than polling: it
  // usually lands within a tick, but can take longer on slow CI.
  await onceWithCleanup(bot, 'blockEntityData', {
    timeout: 5000,
    checkCondition: (block) => block?.position?.equals(sign.position) && block.signText?.trimEnd() === '1\n2\n3'
  })
  const updated = bot.blockAt(sign.position)
  console.log('Updated sign', updated)

  assert.strictEqual(updated.signText.trimEnd(), '1\n2\n3')

  if (updated.blockEntity) {
    // Check block update
    bot.activateBlock(updated)
    assert.notStrictEqual(updated.blockEntity, undefined)
  }

  // The test's contract is the spawn event after returning from the Nether.
  // On 1.12/1.13, repeatedly re-entering a single portal block can leave the
  // vanilla portal cooldown stuck across Mocha retries. Death is the stable
  // return path for these old servers and still exercises the spawn/respawn
  // event after the dimension travel above.
  if (!returnsByDeath) {
    bot.chat(`/setblock ~ ~ ~ ${portalName}`)
  } else {
    bot.test.selfKill()
  }
  await onceWithCleanup(bot, 'spawn', { timeout: 30000 })
  if (returnsByDeath) {
    // Remove the entry block before the next test resets the bot to origin. A
    // death can respawn away from it but the reset teleport may still land in
    // the portal before vanilla's cooldown expires.
    //
    // Some 1.9/1.10 servers acknowledge these commands without sending a
    // block update when the server-side block is already air. Toggle through
    // bedrock and unload the old chunk so the next load must contain air.
    const marker = `clear-nether-done-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    const markerPromise = onceWithCleanup(bot, 'messagestr', {
      timeout: 5000,
      checkCondition: message => message.includes(marker)
    })
    const clearPosition = `${portalPosition.x} ${portalPosition.y} ${portalPosition.z}`
    bot.chat(`/setblock ${clearPosition} bedrock`)
    bot.chat(`/setblock ${clearPosition} air`)
    bot.chat(marker)
    await markerPromise

    // 1.8.8 is too slow to populate the distant chunk set within the helper
    // timeout; its direct block update is sufficient without this reload.
    if (bot.version !== '1.8.8') {
      await bot.test.teleport(new Vec3(portalPosition.x + 256, bot.test.groundY, 0))
      await bot.waitForChunksToLoad()
    }
  }
  await bot.waitForChunksToLoad()
}
