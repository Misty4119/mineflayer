const { Vec3 } = require('vec3')
const assert = require('assert')
const { onceWithCleanup, withTimeout } = require('../../lib/promise_utils')

// The full 26.2 item-backed matrix contains more than 1,000 cases and is
// intentionally opt-in from test/externalTest.js because it takes tens of
// minutes.

const excludedBlocks = [
  // broken
  'bed',
  'double_stone_slab',
  'wooden_door',
  'iron_door',
  'redstone_ore',
  'lit_redstone_ore',
  'trapdoor',
  'double_wooden_slab',
  'jungle_stairs',
  'flower_pot',
  'carrots',
  'potatoes',
  'skull',
  'unpowered_comparator',
  'standing_banner',
  'wall_banner',
  'daylight_detector',
  'stone_slab2',
  'spruce_door',
  'birch_door',
  'jungle_door',
  'acacia_door',
  'dark_oak_door',

  // cannot be placed
  'piston_extension',
  'fire',
  'standing_sign',
  'reeds',
  'powered_repeater',
  'pumpkin_stem',
  'melon_stem',
  'brewing_stand',
  'cauldron',
  'lit_redstone_lamp',
  'tripwire',

  // cause problems
  'mob_spawner',
  'obsidian',

  // unbreakable in survival (hardness -1)
  'reinforced_deepslate'
]

module.exports = (version) => {
  const registry = require('prismarine-registry')(version)

  const funcs = {}
  for (const id in registry.blocks) {
    if (registry.blocks[id] !== undefined) {
      const block = registry.blocks[id]
      // This matrix validates blocks that can be placed through their own
      // item. Fluids, crops, wall-attached states, and block entities need
      // specialized setup, so they are covered by dedicated tests instead of
      // being silently mapped through an unrelated item ID.
      if (block.diggable &&
          excludedBlocks.indexOf(block.name) === -1 &&
          registry.itemsByName[block.name] !== undefined) {
        funcs[block.name] = (blockId => async (bot) => {
          await digSomething(blockId, bot)
        })(block.id)
      }
    }
  }

  const start = Number.parseInt(process.env.MINEFLAYER_EXHAUSTIVE_BLOCK_START ?? '', 10)
  const end = Number.parseInt(process.env.MINEFLAYER_EXHAUSTIVE_BLOCK_END ?? '', 10)
  if (Number.isInteger(start) || Number.isInteger(end)) {
    const from = Number.isInteger(start) ? Math.max(0, start) : 0
    const to = Number.isInteger(end) ? Math.max(from, end) : undefined
    return Object.fromEntries(Object.entries(funcs).slice(from, to))
  }

  return funcs
}

async function digSomething (blockId, bot) {
  const Item = require('prismarine-item')(bot.registry)
  const block = bot.registry.blocks[blockId]
  const blockItem = bot.registry.itemsByName[block.name]

  // Block and item registries are independent in 26.2. In particular, the
  // old block-id-as-item-id shortcut turns sulfur (block 998, item 26) into a
  // diamond helmet and makes this test report a false success or hang while
  // waiting for the wrong placement. Use the item with the same resource
  // name and fail clearly for blocks that cannot be placed as an item.
  assert(blockItem, `${block.name} has no placeable item representation`)

  // Exhaustive runs reuse one world between cases to avoid paying the full
  // reset cost for every block. Re-enter creative mode and clear the slot
  // state so each case still starts from a deterministic inventory.
  await bot.test.becomeCreative()
  await bot.test.clearInventory()
  // The exhaustive runner reuses the same bot after each survival dig. Keep
  // it flying while the three-layer fluid cleanup removes the floor around
  // the target; stopFlying() below is the only point where survival physics
  // is allowed to resume.
  bot.creative.startFlying()
  const fixtureAnchor = new Vec3(0, bot.test.groundY, 0)
  if (bot.entity.position.distanceTo(fixtureAnchor) > 0.9) {
    // A previous survival case can leave the entity one or more blocks below
    // the reusable superflat floor. Re-anchor before any cleanup command so
    // restoreBotGround never attempts an invalid y=-65 block at the 26.2
    // world bottom.
    await bot.test.teleport(fixtureAnchor)
  }
  // Breaking infested blocks legitimately spawns silverfish. They remain in
  // the reused world and can kill the bot several cases later, making the
  // failure look unrelated to the block currently under test. Remove only
  // those fixture side effects while the bot is invulnerable in creative.
  await clearSilverfish(bot)
  const isSurfaceWaterPlant = ['lily_pad', 'frogspawn'].includes(block.name)
  // Keep one empty block between the player and the fixture. The original
  // one-block offset becomes unsafe after many cases because place/dig
  // physics can drift the player into the newly placed collision box.
  const targetOffset = new Vec3(2, isSurfaceWaterPlant ? 1 : 0, 0)
  const targetPosition = bot.blockAt(bot.entity.position.plus(targetOffset)).position
  const needsWater = ['seagrass', 'kelp', 'lily_pad', 'small_dripleaf', 'frogspawn'].includes(block.name)
  const replacesWater = ['seagrass', 'kelp'].includes(block.name)
  const needsSand = block.name === 'cactus'
  const needsAdjacentWater = block.name === 'sugar_cane'
  const needsSoulSand = block.name === 'nether_wart'
  const needsEndStone = ['chorus_plant', 'chorus_flower'].includes(block.name)
  const needsEggSand = block.name === 'turtle_egg'
  const needsLowLight = ['brown_mushroom', 'red_mushroom'].includes(block.name)
  const needsFarmlandCover = block.name === 'farmland'
  const needsWallAttachment = ['ladder', 'vine', 'glow_lichen', 'resin_clump', 'tripwire_hook'].includes(block.name)
  const needsCeilingAttachment = block.name.endsWith('_hanging_sign') || ['weeping_vines', 'spore_blossom', 'hanging_roots', 'pale_hanging_moss'].includes(block.name)
  const needsServerPlacement = block.name.startsWith('infested_') ||
     ['resin_bricks', 'chiseled_resin_bricks', 'smooth_basalt', 'wheat', 'farmland', 'sugar_cane', 'brown_mushroom_block', 'red_mushroom_block', 'mushroom_stem'].includes(block.name)
  // Any non-fluid placement can be contaminated by a water source left by a
  // previous water-plant case. Clear the neighborhood for solid blocks too;
  // checking only empty-collision blocks lets flowing water replace a valid
  // solid target before the placement packet is processed.
  const needsDryPlacementArea = !needsWater && !needsAdjacentWater
  if (replacesWater || isSurfaceWaterPlant) {
    // Kelp and seagrass replace a water block in-place. Clear the surrounding
    // fluid volume first: a source left one block below or beside the target
    // can turn the replacement cell into flowing water before block_place is
    // handled, making the plant immediately disappear on 26.2.
    await clearWaterPlantArea(bot, targetPosition)
    if (block.name === 'kelp') {
      // The bottom kelp block must be rooted in a kelp-plantable substrate;
      // water below it is not a valid survival state. Sand is accepted by
      // vanilla and still lets the item-use packet replace the water cell.
      const kelpFloor = targetPosition.offset(0, -1, 0)
      await bot.test.setBlock({ x: kelpFloor.x, y: kelpFloor.y, z: kelpFloor.z, blockName: 'sand', force: true })
    }
    await bot.test.setBlock({
      x: targetPosition.x,
      y: targetPosition.y,
      z: targetPosition.z,
      blockName: 'water',
      force: true
    })
  } else if (needsDryPlacementArea) {
    // A single air block can be refilled by a neighbouring water source before
    // the placement packet is handled. Clear a small neighborhood atomically
    // so replaceable plants are never handed back to dig() as a stale water
    // snapshot (water has a 150-second dig time in 26.2).
    await clearPlacementArea(bot, targetPosition)
  } else {
    await bot.test.setBlock({
      x: targetPosition.x,
      y: targetPosition.y,
      z: targetPosition.z,
      blockName: needsWater && !isSurfaceWaterPlant ? 'water' : 'air',
      force: true
    })
  }
  if (isSurfaceWaterPlant) {
    const waterPosition = targetPosition.offset(0, -1, 0)
    await bot.test.setBlock({ x: waterPosition.x, y: waterPosition.y, z: waterPosition.z, blockName: 'water', force: true })
  }
  if (needsSand) {
    const supportPosition = targetPosition.offset(0, -1, 0)
    await bot.test.setBlock({ x: supportPosition.x, y: supportPosition.y, z: supportPosition.z, blockName: 'sand', force: true })
  }
  if (needsSoulSand) {
    const supportPosition = targetPosition.offset(0, -1, 0)
    await bot.test.setBlock({ x: supportPosition.x, y: supportPosition.y, z: supportPosition.z, blockName: 'soul_sand', force: true })
  }
  if (needsEndStone) {
    const supportPosition = targetPosition.offset(0, -1, 0)
    await bot.test.setBlock({ x: supportPosition.x, y: supportPosition.y, z: supportPosition.z, blockName: 'end_stone', force: true })
  }
  if (needsEggSand) {
    const supportPosition = targetPosition.offset(0, -1, 0)
    await bot.test.setBlock({ x: supportPosition.x, y: supportPosition.y, z: supportPosition.z, blockName: 'sand', force: true })
  }
  if (needsAdjacentWater) {
    const supportPosition = targetPosition.offset(0, -1, 0)
    await bot.test.setBlock({ x: supportPosition.x, y: supportPosition.y, z: supportPosition.z, blockName: 'grass_block', force: true })
  }
  if (needsLowLight) {
    // Mushrooms reject placement when sky light can enter from the sides. A
    // temporary 3x3 enclosure keeps this case on the normal block_place path;
    // the next reset removes the walls and roof.
    await createLowLightEnclosure(bot, targetPosition)
  }
  const wallPosition = targetPosition.offset(-1, 0, 0)
  if (needsWallAttachment) {
    await bot.test.setBlock({ x: wallPosition.x, y: wallPosition.y, z: wallPosition.z, blockName: 'stone', force: true })
  }
  const ceilingPosition = targetPosition.offset(0, 1, 0)
  if (needsCeilingAttachment) {
    await bot.test.setBlock({ x: ceilingPosition.x, y: ceilingPosition.y, z: ceilingPosition.z, blockName: 'stone', force: true })
  }
  await bot.test.setInventorySlot(36, new Item(blockItem.id, 1, 0))
  if (replacesWater) {
    // Water plants replace the clicked water block instead of being placed
    // on top of the block below it. Use the low-level placement primitive so
    // the packet targets the water block and wait for the replacement
    // explicitly.
    bot.setQuickBarSlot(0)
    const waterBlock = bot.blockAt(targetPosition)
    const placed = onceWithCleanup(bot, `blockUpdate:${targetPosition}`, {
      timeout: 5000,
      checkCondition: (_oldBlock, newBlock) => newBlock?.name === block.name
    })
    await bot._genericPlace(waterBlock, new Vec3(0, 1, 0), { swingArm: 'right' })
    await placed
  } else if (isSurfaceWaterPlant) {
    // Surface plants such as lily pads are placed by the server on the water
    // surface. The normal block_place packet is not accepted for this
    // special item on 26.2, so use the authoritative server fixture to create
    // it and keep this matrix focused on the subsequent dig path.
    await bot.test.setBlock({ x: targetPosition.x, y: targetPosition.y, z: targetPosition.z, blockName: block.name, force: true })
  } else if (needsServerPlacement) {
    // Infested blocks are world-generated variants, not placeable gameplay
    // items. Resin decorative blocks and smooth basalt expose valid registry
    // entries but 26.2 rejects their normal placement packet in this fixture,
    // crop blocks such as wheat are placed through a different seed item,
    // flowing water races sugar cane placement, and mushroom-block items are
    // world-generated variants rejected by 26.2's normal placement path.
    // Vanilla rejects the same-name or race-prone placement packet in these
    // cases. Create the authoritative block state with a command and continue
    // validating the 26.2 block/dig path.
    if (needsAdjacentWater) {
      // Sugar cane is removed by the server when it has no adjacent water.
      // Install the source below a temporary solid target so fluid flow cannot
      // occupy the target before the cane command is handled.
      await setAdjacentWaterPlant(bot, targetPosition, block.name)
    } else if (needsFarmlandCover || block.name === 'wheat') {
      await setFarmlandWithCrop(bot, targetPosition, block.name)
    } else {
      await bot.test.setBlock({ x: targetPosition.x, y: targetPosition.y, z: targetPosition.z, blockName: block.name, force: true })
    }
  } else if (needsWallAttachment) {
    bot.setQuickBarSlot(0)
    await bot.placeBlock(bot.blockAt(wallPosition), new Vec3(1, 0, 0))
  } else if (needsCeilingAttachment) {
    bot.setQuickBarSlot(0)
    await bot.placeBlock(bot.blockAt(ceilingPosition), new Vec3(0, -1, 0))
  } else {
    await bot.test.placeBlock(36, targetPosition)
  }
  const placedBlockName = bot.blockAt(targetPosition).name
  const validPlacedNames = block.name === 'bamboo' ? ['bamboo', 'bamboo_sapling'] : [block.name]
  assert(validPlacedNames.includes(placedBlockName), `${block.name} was placed as ${placedBlockName}`)
  // TODO: find a better way than this bot.test.wait(200)
  await bot.test.wait(200)
  await bot.test.clearInventory()
  await bot.test.setInventorySlot(36, new Item(getDigToolId(block, bot.registry), 1, 0))
  // resetState keeps the bot flying so setup commands never make it fall.
  // Restore normal gravity before measuring/digging; otherwise the digging
  // calculation correctly applies the vanilla airborne penalty forever.
  bot.creative.stopFlying()
  if (!bot.entity.onGround) {
    // The reusable external fixture leaves the bot flying while it moves
    // between cases.  A hard block such as ender_chest can otherwise inherit
    // the vanilla 5x airborne digging penalty and exceed the bounded timeout.
    const playerPosition = bot.entity.position.floored()
    const playerGround = playerPosition.offset(0, -1, 0)
    if (bot.blockAt(playerGround)?.boundingBox !== 'block') {
      await bot.test.setBlock({
        x: playerGround.x,
        y: playerGround.y,
        z: playerGround.z,
        blockName: 'grass_block',
        force: true
      })
    }
  }
  await bot.test.becomeSurvival()
  if (!bot.entity.onGround) {
    await onceWithCleanup(bot, 'physicsTick', {
      timeout: 1000,
      checkCondition: () => bot.entity.onGround
    })
  }
  const blockToDig = bot.blockAt(targetPosition)
  assert.strictEqual(blockToDig.name, placedBlockName, `${block.name} changed before dig (${blockToDig.name})`)
  try {
    // Trial spawners and vaults intentionally are not in 26.2's
    // mineable/pickaxe tag. Their hardness is 50, so vanilla's legitimate
    // survival break time is 75 seconds even with a netherite pickaxe. Keep
    // the timeout derived from the client calculation, while retaining a
    // hard upper bound so a broken test cannot loop forever.
    const calculatedDigTime = bot.digTime(blockToDig)
    const digTimeout = Number.isFinite(calculatedDigTime)
      ? Math.min(90000, Math.max(15000, calculatedDigTime + 5000))
      : 15000
    await withTimeout(bot.dig(blockToDig), digTimeout)
  } catch (err) {
    bot.stopDigging()
    throw err
  }
  // make sure that block is gone
  assert.strictEqual(bot.blockAt(targetPosition).type, 0)
  if (needsFarmlandCover) {
    const coverPosition = targetPosition.offset(0, 1, 0)
    await bot.test.setBlock({ x: coverPosition.x, y: coverPosition.y, z: coverPosition.z, blockName: 'air', force: true })
  }
  if (needsWallAttachment) {
    await bot.test.setBlock({ x: wallPosition.x, y: wallPosition.y, z: wallPosition.z, blockName: 'air', force: true })
  }
  if (needsCeilingAttachment) {
    await bot.test.setBlock({ x: ceilingPosition.x, y: ceilingPosition.y, z: ceilingPosition.z, blockName: 'air', force: true })
  }
}

async function clearPlacementArea (bot, targetPosition) {
  const marker = `clear-placement-area-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const markerPromise = onceWithCleanup(bot, 'messagestr', {
    timeout: 5000,
    checkCondition: message => message.includes(marker)
  })
  // The reusable external-test world can retain a water source just outside
  // the immediate placement cell. Clear a generous three-layer neighborhood
  // so water above or below the target cannot flow into it between the setup
  // command and block placement.
  const radius = 8
  bot.chat(`/fill ${targetPosition.x - radius} ${targetPosition.y - 1} ${targetPosition.z - radius} ${targetPosition.x + radius} ${targetPosition.y + 1} ${targetPosition.z + radius} air`)
  bot.chat(marker)
  await markerPromise
  await bot.test.setBlock({
    x: targetPosition.x,
    y: targetPosition.y,
    z: targetPosition.z,
    blockName: 'air',
    force: true
  })
  // The bot can drift several blocks while the exhaustive matrix runs. The
  // reusable superflat floor is deliberately small, so keep the current test
  // cell supported even after the player has moved beyond its original edge.
  // Grass is also the broadest valid support for ground plants such as
  // saplings and flowers; stone would make those item-placement cases fail.
  await bot.test.setBlock({
    x: targetPosition.x,
    y: targetPosition.y - 1,
    z: targetPosition.z,
    blockName: 'grass_block',
    force: true
  })
  await restoreBotGround(bot)
}

async function clearSilverfish (bot) {
  const marker = `clear-silverfish-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const markerPromise = onceWithCleanup(bot, 'messagestr', {
    timeout: 5000,
    checkCondition: message => message.includes(marker)
  })
  bot.chat('/kill @e[type=minecraft:silverfish]')
  bot.chat(marker)
  await markerPromise
}

async function clearWaterPlantArea (bot, targetPosition) {
  const marker = `clear-water-plant-area-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const markerPromise = onceWithCleanup(bot, 'messagestr', {
    timeout: 5000,
    checkCondition: message => message.includes(marker)
  })
  const { x, y, z } = targetPosition
  bot.chat(`/fill ${x - 8} ${y - 1} ${z - 8} ${x + 8} ${y + 1} ${z + 8} air`)
  bot.chat(marker)
  await markerPromise
  await bot.test.setBlock({ x, y, z, blockName: 'air', force: true })
  // Keep a deterministic non-fluid block below the water cell. It also keeps
  // the bot's reusable fixture valid after it has drifted beyond the original
  // superflat floor.
  await bot.test.setBlock({ x, y: y - 1, z, blockName: 'grass_block', force: true })
  await restoreBotGround(bot)
}

async function restoreBotGround (bot) {
  const playerPosition = bot.entity.position.floored()
  const groundPosition = playerPosition.offset(0, -1, 0)
  await bot.test.setBlock({
    x: groundPosition.x,
    y: groundPosition.y,
    z: groundPosition.z,
    blockName: 'grass_block',
    force: true
  })
}

async function createLowLightEnclosure (bot, targetPosition) {
  const marker = `low-light-enclosure-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const markerPromise = onceWithCleanup(bot, 'messagestr', {
    timeout: 5000,
    checkCondition: message => message.includes(marker)
  })
  const { x, y, z } = targetPosition
  bot.chat(`/fill ${x - 1} ${y} ${z - 1} ${x + 1} ${y} ${z + 1} stone`)
  bot.chat(`/setblock ${x} ${y} ${z} air`)
  bot.chat(`/fill ${x - 1} ${y + 1} ${z - 1} ${x + 1} ${y + 1} ${z + 1} stone`)
  bot.chat(marker)
  await markerPromise
}

async function setAdjacentWaterPlant (bot, targetPosition, blockName) {
  // Keep the target solid while the source is installed. If the target is
  // empty, 26.2's fluid tick can fill it before the sugar cane survival check
  // sees the adjacent water, and the cane is immediately removed.
  await bot.test.setBlock({
    x: targetPosition.x,
    y: targetPosition.y,
    z: targetPosition.z,
    blockName: 'stone',
    force: true
  })
  // 26.2 checks the horizontal neighbors of the support block (the block
  // below the cane), so the water source must be one level below the cane.
  const waterPosition = targetPosition.offset(0, -1, 1)
  await bot.test.setBlock({
    x: waterPosition.x,
    y: waterPosition.y,
    z: waterPosition.z,
    blockName: 'water',
    force: true
  })
  await bot.test.setBlock({
    x: targetPosition.x,
    y: targetPosition.y,
    z: targetPosition.z,
    blockName,
    force: true
  })
  await withTimeout(bot.test.wait(200), 1000)
}

async function setFarmlandWithCrop (bot, targetPosition, blockName) {
  const marker = `set-farmland-with-crop-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const markerPromise = onceWithCleanup(bot, 'messagestr', {
    timeout: 5000,
    checkCondition: message => message.includes(marker)
  })
  // Farmland's survival rule accepts crops above it. Send both states before
  // the scheduled survival tick runs, otherwise a bare farmland setblock is
  // converted to dirt by vanilla immediately. Wheat itself also needs this
  // support below the target or it is removed before dig() can start.
  const farmlandPosition = blockName === 'farmland' ? targetPosition : targetPosition.offset(0, -1, 0)
  const cropPosition = blockName === 'farmland' ? targetPosition.offset(0, 1, 0) : targetPosition
  bot.chat(`/setblock ${farmlandPosition.x} ${farmlandPosition.y} ${farmlandPosition.z} farmland`)
  bot.chat(`/setblock ${cropPosition.x} ${cropPosition.y} ${cropPosition.z} wheat`)
  bot.chat(marker)
  await markerPromise
  await withTimeout(bot.test.wait(200), 1000)
}

function getDigToolId (block, registry) {
  // Some 26.2 materials keep legacy names (for example `coweb`) instead of
  // using the `mineable/<tool>` convention.  Prefer the block's authoritative
  // harvestTools map so cobweb, wool, leaves, and similar blocks are dug with
  // a tool the server actually accepts rather than a slow fallback pickaxe.
  const preferredTools = [
    'shears',
    'netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'golden_pickaxe', 'wooden_pickaxe',
    'netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'golden_axe', 'wooden_axe',
    'netherite_shovel', 'diamond_shovel', 'iron_shovel', 'stone_shovel', 'golden_shovel', 'wooden_shovel',
    'netherite_hoe', 'diamond_hoe', 'iron_hoe', 'stone_hoe', 'golden_hoe', 'wooden_hoe',
    'netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'golden_sword', 'wooden_sword'
  ]
  for (const toolName of preferredTools) {
    const tool = registry.itemsByName[toolName]
    if (tool && block.harvestTools?.[tool.id]) return tool.id
  }

  const toolName = typeof block.material === 'string' && block.material.startsWith('mineable/')
    ? block.material.slice('mineable/'.length)
    : 'pickaxe'
  // When the registry does not expose a harvestTools entry, use the fastest
  // material available so hard blocks such as ender_chest still finish within
  // the bounded dig timeout. This is a test fixture choice, not a gameplay
  // claim about which tool preserves drops.
  const preferredTool = registry.itemsByName[`netherite_${toolName}`] ?? registry.itemsByName[`diamond_${toolName}`]
  const fallbackTool = registry.itemsByName.netherite_pickaxe ?? registry.itemsByName.diamond_pickaxe
  assert(fallbackTool, 'a pickaxe is required by the digEverything fixture')
  return preferredTool ? preferredTool.id : fallbackTool.id
}
