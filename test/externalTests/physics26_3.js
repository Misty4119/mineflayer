const assert = require('assert')
const { Vec3 } = require('vec3')
const { onceWithCleanup } = require('../../lib/promise_utils')

module.exports = (version) => {
  if (version !== '26.3') return {}

  async function runTicks (bot, count, control, state) {
    const completed = new Promise((resolve, reject) => {
      let ticks = 0
      const timeout = setTimeout(() => {
        bot.removeListener('physicsTick', onTick)
        reject(new Error(`timed out after ${ticks}/${count} physics ticks`))
      }, 5000)
      function onTick () {
        if (++ticks !== count) return
        clearTimeout(timeout)
        bot.removeListener('physicsTick', onTick)
        resolve()
      }
      bot.on('physicsTick', onTick)
    })

    bot.setControlState(control, state)
    try {
      await completed
    } finally {
      bot.setControlState(control, false)
    }
  }

  async function runCommand (bot, command) {
    const marker = `physics-26.3-${Date.now()}-${Math.floor(Math.random() * 100000)}`
    const acknowledged = onceWithCleanup(bot, 'messagestr', {
      timeout: 5000,
      checkCondition: message => message.includes(marker)
    })
    bot.chat(command)
    bot.chat(marker)
    await acknowledged
  }

  async function waitForBlocks (bot, positions, expectedName) {
    const deadline = Date.now() + 5000
    while (positions.some(position => bot.blockAt(position)?.name !== expectedName)) {
      if (Date.now() >= deadline) throw new Error(`timed out waiting for ${expectedName} blocks`)
      await bot.test.wait(50)
    }
  }

  async function waitForGroundedBlock (bot, x, y, z, expectedName) {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      const blockBelow = bot.blockAt(new Vec3(x, y - 1, z))
      if (blockBelow?.name === expectedName && bot.entity.onGround && Math.abs(bot.entity.position.y - y) < 0.125) return
      await bot.test.wait(50)
    }
    const blockBelow = bot.blockAt(new Vec3(x, y - 1, z))
    throw new Error(`timed out grounding on ${expectedName}: y=${bot.entity.position.y}, onGround=${bot.entity.onGround}, below=${blockBelow?.name}`)
  }

  return {
    'matches Vanilla soul sand support slowdown': async (bot) => {
      const y = bot.test.groundY - 1
      const zStart = -24
      const zEnd = 0
      const stoneLane = Array.from({ length: zEnd - zStart + 1 }, (_, index) => new Vec3(0, y, zStart + index))
      const soulSandLane = Array.from({ length: zEnd - zStart + 1 }, (_, index) => new Vec3(2, y, zStart + index))

      bot.clearControlStates()
      await bot.test.becomeSurvival()
      bot.creative.stopFlying()
      await runCommand(bot, `/fill 0 ${y} ${zStart} 0 ${y} ${zEnd} stone`)
      await runCommand(bot, `/fill 2 ${y} ${zStart} 2 ${y} ${zEnd} soul_sand`)
      await waitForBlocks(bot, stoneLane, 'stone')
      await waitForBlocks(bot, soulSandLane, 'soul_sand')

      async function distanceAfterWalking (x) {
        bot.clearControlStates()
        await bot.test.teleport(new Vec3(x + 0.5, bot.test.groundY, 0.5))
        await bot.look(0, 0, true)
        await bot.test.wait(250)
        const start = bot.entity.position.clone()
        let corrections = 0
        const onForcedMove = () => corrections++
        bot.on('forcedMove', onForcedMove)
        try {
          await runTicks(bot, 40, 'forward', true)
          await bot.test.wait(200)
          return { distance: start.z - bot.entity.position.z, corrections }
        } finally {
          bot.removeListener('forcedMove', onForcedMove)
          bot.clearControlStates()
        }
      }

      try {
        const stone = await distanceAfterWalking(0)
        const soulSand = await distanceAfterWalking(2)
        assert.ok(stone.distance > 1, `stone lane should produce measurable movement: ${stone.distance}`)
        assert.ok(soulSand.distance > 0, `soul sand lane should allow forward movement: ${soulSand.distance}`)
        assert.ok(soulSand.distance < stone.distance * 0.7, `Vanilla soul sand should slow movement: stone=${stone.distance}, soul_sand=${soulSand.distance}`)
        assert.strictEqual(stone.corrections, 0, 'Vanilla should accept the predicted movement on stone')
        assert.strictEqual(soulSand.corrections, 0, 'Vanilla should accept the predicted slowdown on soul sand')
      } finally {
        bot.clearControlStates()
        await runCommand(bot, `/fill 0 ${y} ${zStart} 2 ${y} ${zEnd} grass_block`)
      }
    },
    'climbs the Vanilla Poplar trapdoor and ladder pairing': async (bot) => {
      const x = 7
      const z = 0
      const trapdoorY = bot.test.groundY
      const ladderY = trapdoorY - 1
      const start = new Vec3(x + 0.5, trapdoorY, z + 0.5)
      const trapdoor = new Vec3(x, trapdoorY, z)
      const ladder = new Vec3(x, ladderY, z)

      bot.clearControlStates()
      await bot.test.becomeSurvival()
      bot.creative.stopFlying()
      await runCommand(bot, `/setblock ${ladder.x} ${ladder.y} ${ladder.z} ladder[facing=north,waterlogged=false]`)
      await runCommand(bot, `/setblock ${trapdoor.x} ${trapdoor.y} ${trapdoor.z} poplar_trapdoor[facing=north,half=bottom,open=true,powered=false,waterlogged=false]`)
      await waitForBlocks(bot, [ladder], 'ladder')
      await waitForBlocks(bot, [trapdoor], 'poplar_trapdoor')
      assert.strictEqual(bot.blockAt(trapdoor).getProperties().open, true)
      assert.strictEqual(bot.blockAt(trapdoor).getProperties().facing, 'north')

      try {
        await bot.test.teleport(start)
        await bot.look(0, 0, true)
        await bot.test.wait(250)
        const startingY = bot.entity.position.y
        await runTicks(bot, 12, 'jump', true)
        assert.ok(bot.entity.position.y > startingY + 0.25, `Vanilla should let the bot climb above the trapdoor: start=${startingY}, end=${bot.entity.position.y}`)
      } finally {
        bot.clearControlStates()
        await runCommand(bot, `/setblock ${trapdoor.x} ${trapdoor.y} ${trapdoor.z} air`)
        await runCommand(bot, `/setblock ${ladder.x} ${ladder.y} ${ladder.z} grass_block`)
      }
    },
    'matches Vanilla honey-block jump height': async (bot) => {
      const honeyX = 10
      const stoneX = 14
      const zStart = 0
      const zEnd = 2
      // Use positive coordinates: at a negative world Y, a 1/16-block landing
      // offset crosses Math.floor's boundary in the physics support lookup.
      const groundY = 4
      const y = groundY - 1
      const honeyLane = Array.from({ length: zEnd - zStart + 1 }, (_, index) => new Vec3(honeyX, y, zStart + index))
      const stoneLane = Array.from({ length: zEnd - zStart + 1 }, (_, index) => new Vec3(stoneX, y, zStart + index))

      bot.clearControlStates()
      await bot.test.becomeSurvival()
      bot.creative.stopFlying()
      await runCommand(bot, `/fill ${honeyX} ${y} ${zStart} ${honeyX} ${y} ${zEnd} honey_block`)
      await runCommand(bot, `/fill ${stoneX} ${y} ${zStart} ${stoneX} ${y} ${zEnd} stone`)
      await waitForBlocks(bot, honeyLane, 'honey_block')
      await waitForBlocks(bot, stoneLane, 'stone')

      async function jumpHeight (x, supportName) {
        bot.clearControlStates()
        await bot.test.teleport(new Vec3(x + 0.5, groundY + 2, 1.5))
        await bot.look(0, 0, true)
        await waitForGroundedBlock(bot, x, groundY, 1, supportName)

        const startY = bot.entity.position.y
        let maxY = startY
        let corrections = 0
        const recordHeight = () => { maxY = Math.max(maxY, bot.entity.position.y) }
        const onForcedMove = () => corrections++
        bot.on('physicsTick', recordHeight)
        bot.on('forcedMove', onForcedMove)
        try {
          await runTicks(bot, 1, 'jump', true)
          await runTicks(bot, 12, 'jump', false)
          await bot.test.wait(250)
          return { height: maxY - startY, corrections }
        } finally {
          bot.removeListener('physicsTick', recordHeight)
          bot.removeListener('forcedMove', onForcedMove)
          bot.clearControlStates()
        }
      }

      try {
        const honey = await jumpHeight(honeyX, 'honey_block')
        const stone = await jumpHeight(stoneX, 'stone')
        assert.ok(honey.height > 0.2, `honey block should permit a measurable jump: ${honey.height}`)
        assert.ok(stone.height > honey.height * 1.8, `Vanilla honey jump should be shorter than stone: honey=${honey.height}, stone=${stone.height}`)
        assert.strictEqual(honey.corrections, 0, 'Vanilla should accept the predicted honey-block jump')
        assert.strictEqual(stone.corrections, 0, 'Vanilla should accept the predicted stone jump')
      } finally {
        bot.clearControlStates()
        await runCommand(bot, `/fill ${honeyX} ${y} ${zStart} ${honeyX} ${y} ${zEnd} grass_block`)
        await runCommand(bot, `/fill ${stoneX} ${y} ${zStart} ${stoneX} ${y} ${zEnd} grass_block`)
      }
    }
  }
}
