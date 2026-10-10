const { Vec3 } = require('vec3')
const assert = require('assert')
const { onceWithCleanup } = require('../../lib/promise_utils')

async function clickWithComponentHash (bot, window, slot, componentType, hash) {
  const originalWrite = bot._client.write
  const responses = []
  const responseListeners = ['set_slot', 'set_cursor_item', 'window_items'].map(name => {
    const listener = packet => responses.push({ name, packet })
    bot._client.on(name, listener)
    return { name, listener }
  })
  bot._client.write = function (name, packet) {
    if (name === 'window_click' && packet.windowId === window.id && packet.slot === slot && packet.cursorItem) {
      const component = packet.cursorItem.components.find(component => component.type === componentType)
      if (!component) throw new Error(`window_click is missing ${componentType}`)
      component.hash = hash
    }
    return originalWrite.call(this, name, packet)
  }
  try {
    await bot.clickWindow(slot, 0, 0)
    await bot.test.wait(250)
    return responses
  } finally {
    bot._client.write = originalWrite
    for (const { name, listener } of responseListeners) bot._client.removeListener(name, listener)
  }
}

module.exports = () => async (bot) => {
  // Closing a container while holding an item on the cursor makes the server
  // return it through Inventory.placeItemBackInInventory, synced on 1.21.3+
  // via set_player_inventory. Its slotId counts the vanilla player inventory
  // hotbar-first (0-8), which must be translated to the inventory menu slot
  // space. Applied raw, a return into hotbar slot 0 writes the crafting
  // result slot 0 instead of window slot 36.
  await bot.test.becomeCreative()
  await bot.test.clearInventory()
  await bot.test.wait(100)

  // A stone in hotbar slot 0 to pick up on the cursor
  const stoneId = bot.registry.itemsByName.stone.id
  await bot.test.setInventorySlot(bot.inventory.hotbarStart, new (require('prismarine-item')(bot.registry))(stoneId, 1))

  // Place a chest next to the bot and open it
  const chestPos = new Vec3(1, bot.test.groundY, 0)
  await bot.test.setBlock({ x: chestPos.x, y: chestPos.y, z: chestPos.z, blockName: 'chest' })
  const chest = await bot.openContainer(bot.blockAt(chestPos))

  // Pick the stone up onto the cursor (hotbar slot 0 = chest.hotbarStart)
  await bot.clickWindow(chest.hotbarStart, 0, 0)
  assert.ok(chest.selectedItem, 'stone should be on the cursor')

  // Closing with the cursor occupied makes the server return the stone via
  // set_player_inventory into hotbar slot 0 -> inventory slot 36
  const returned = onceWithCleanup(bot.inventory, 'updateSlot:36', {
    timeout: 5000,
    checkCondition: (oldItem, newItem) => newItem?.type === stoneId
  })
  await Promise.all([bot.closeWindow(chest), returned])

  assert.strictEqual(bot.inventory.slots[bot.inventory.hotbarStart].type, stoneId, 'returned stone should be back in hotbar slot 0')
  assert.strictEqual(bot.inventory.slots[0], null, 'set_player_inventory slotId 0 must not write into the crafting result slot')

  if (bot.version === '26.3') {
    await bot.test.clearInventory()
    const cushionReceived = onceWithCleanup(bot.inventory, 'updateSlot', {
      timeout: 5000,
      checkCondition: (_slot, _oldItem, newItem) => newItem?.name === 'white_cushion'
    })
    bot.chat('/give @s minecraft:white_cushion[minecraft:cushion/color=blue] 1')
    await cushionReceived

    const cushion = bot.inventory.slots.find(item => item?.name === 'white_cushion')
    assert.ok(cushion, 'the server must provide the 26.3 cushion item with its component data')
    const cushionColor = cushion.components.find(component => component.type === 'cushion/color')
    assert.ok(cushionColor, `expected the server cushion stack to carry cushion/color; components: ${JSON.stringify(cushion.components)}`)
    assert.strictEqual(cushionColor.data, 'blue', 'the server-created cushion should retain the requested blue color')

    const chestPos = new Vec3(1, bot.test.groundY, 0)
    await bot.test.setBlock({ x: chestPos.x, y: chestPos.y, z: chestPos.z, blockName: 'chest' })
    const componentChest = await bot.openContainer(bot.blockAt(chestPos))
    const cushionSlot = cushion.slot
    const chestHotbarSlot = componentChest.hotbarStart + (cushionSlot - bot.inventory.hotbarStart)

    // Compare a known-bad and known-good component fingerprint before the
    // explicit full-window sync to learn whether the server exposes hash
    // mismatches through a correction packet.
    const wrongHashResponses = await clickWithComponentHash(bot, componentChest, chestHotbarSlot, 'cushion/color', 1)
    await bot._syncWindow(componentChest)
    assert.strictEqual(componentChest.slots[chestHotbarSlot], null, 'the server-side click should move the cushion to the cursor')
    assert.strictEqual(componentChest.selectedItem?.name, 'white_cushion')
    await bot.clickWindow(chestHotbarSlot, 0, 0)
    await bot._syncWindow(componentChest)
    const matchingHashResponses = await clickWithComponentHash(bot, componentChest, chestHotbarSlot, 'cushion/color', 199633461)
    await bot._syncWindow(componentChest)
    assert.ok(wrongHashResponses.some(({ name }) => name === 'set_cursor_item'), 'Vanilla should correct the cursor when its component hash is wrong')
    assert.deepStrictEqual(matchingHashResponses, [], 'Vanilla should not correct the cursor when the component hash matches')

    // Chest clicks can be accepted without a per-slot response. Force a full
    // server-authoritative sync after each click so the next click uses a
    // current stateId and the assertions do not treat silence as acceptance.
    assert.strictEqual(componentChest.slots[chestHotbarSlot], null, 'the Vanilla server should clear the cushion source slot after pickup')
    assert.strictEqual(componentChest.selectedItem?.name, 'white_cushion', 'the Vanilla server should place the colored cushion on the cursor')
    assert.deepStrictEqual(componentChest.selectedItem.components, cushion.components)

    await bot.clickWindow(0, 0, 0)
    await bot._syncWindow(componentChest)
    assert.strictEqual(componentChest.slots[0]?.name, 'white_cushion', 'the Vanilla server should accept the component-bearing cushion click')
    assert.deepStrictEqual(componentChest.slots[0].components, cushion.components)
    assert.strictEqual(componentChest.selectedItem, null, 'the Vanilla server should clear the cursor after placement')
    await bot.closeWindow(componentChest)

    const Item = require('prismarine-item')(bot.registry)
    const newComponents = [
      { type: 'attack_animation', component: '{type:"whack",duration:1}', expectedData: { type: 'whack', duration: 1 }, expectedHash: 38245613 },
      { type: 'interact_animation', component: '{type:"stab",duration:2}', expectedData: { type: 'stab', duration: 2 }, expectedHash: 941234370 },
      { type: 'block_transformer', itemName: 'iron_axe', component: 'hoe', expectedData: 1, expectedHash: 217335778 },
      { type: 'villager_food', component: '{nutrition:1}', expectedData: 1, expectedHash: -326140849 },
      { type: 'compostable', component: '{layers:1}', expectedData: { isConstant: true, value: 1 }, expectedHash: 1290316976 },
      {
        type: 'cooking_fuel',
        component: '{burn_time:200,speed_multiplier:1.0f}',
        expectedData: { burnTime: { isConstant: true, value: 200 }, speedMultiplier: { isConstant: true, value: 1 } },
        expectedHash: -700345918
      },
      {
        type: 'brewing_fuel',
        component: '{uses:1,speed_multiplier:1.0f}',
        expectedData: { uses: { isConstant: true, value: 1 }, speedMultiplier: { isConstant: true, value: 1 } },
        expectedHash: -1885970260
      },
      {
        type: 'mob_visibility',
        itemName: 'zombie_spawn_egg',
        component: '{targeting_entity_types:["minecraft:zombie"],visibility:10.0f}',
        expectedData: { targetingEntityTypes: { ids: [bot.registry.entitiesByName.zombie.id] }, visibility: 10 },
        expectedHash: -1013627476
      },
      { type: 'provides_pottery_pattern', itemName: 'stone', component: 'angler', expectedData: 0, expectedHash: 920506421 },
      {
        type: 'sign_text_front',
        itemName: 'oak_sign',
        component: '{messages:["front one","front two","front three","front four"],color:"white",has_glowing_text:true}',
        expectedData: {
          messages: ['front one', 'front two', 'front three', 'front four'].map(value => ({ type: 'string', value })),
          filteredMessages: undefined,
          color: 'white',
          hasGlowingText: true
        },
        expectedHash: 1016378249
      },
      {
        type: 'sign_text_back',
        itemName: 'oak_sign',
        component: '{messages:["back one","back two","back three","back four"],color:"white",has_glowing_text:true}',
        expectedData: {
          messages: ['back one', 'back two', 'back three', 'back four'].map(value => ({ type: 'string', value })),
          filteredMessages: undefined,
          color: 'white',
          hasGlowingText: true
        },
        expectedHash: 425765776
      },
      { type: 'waxed', itemName: 'waxed_copper_block', component: '{}', expectedData: undefined, expectedHash: -982207288 }
    ]
    // One server-created component from each T09 family. Hashes were captured
    // against official offline Vanilla 26.3 and are independent wire evidence.
    const t09FamilyComponents = [
      { type: 'enchantable', family: 'records', itemName: 'iron_pickaxe', component: '{value:10}', expectedData: 10, expectedHash: -554861910 },
      { type: 'damage_resistant', family: 'combat', itemName: 'shield', component: '{types:"#minecraft:is_fire"}', expectedData: { name: 'minecraft:is_fire' }, expectedHash: 1644159004 },
      {
        type: 'consumable',
        family: 'consumption',
        itemName: 'stone',
        component: '{consume_seconds:2.0f,animation:"drink",sound:"minecraft:entity.generic.drink",has_consume_particles:false,on_consume_effects:[{type:"minecraft:clear_all_effects"}]}',
        expectedData: {
          consume_seconds: 2,
          animation: 'drink',
          sound: { soundId: 701 },
          makes_particles: false,
          effects: [{ type: 'clear_all_effects' }]
        },
        expectedHash: -1465966464
      },
      {
        type: 'can_break',
        family: 'predicates',
        itemName: 'diamond_pickaxe',
        component: '[{blocks:"minecraft:stone"}]',
        expectedData: {
          predicates: [{ blockSet: { blockIds: [1] }, components: { exactMatchers: [], partialMatchers: [] }, nbt: undefined, properties: undefined }]
        },
        expectedHash: -1161294463
      },
      {
        type: 'can_break',
        family: 'predicates',
        itemName: 'diamond_pickaxe',
        component: '[{blocks:"minecraft:stone",predicates:{"minecraft:damage":{damage:{min:5}}}}]',
        expectedData: {
          predicates: [{
            blockSet: { blockIds: [1] },
            components: {
              exactMatchers: [],
              partialMatchers: [{
                isPredicate: true,
                type: 'damage',
                data: { type: 'compound', value: { damage: { type: 'compound', value: { min: { type: 'int', value: 5 } } } } }
              }]
            },
            nbt: undefined,
            properties: undefined
          }]
        },
        expectedHash: -1070546865
      },
      { type: 'trim', family: 'registries', itemName: 'diamond_chestplate', component: '{material:"minecraft:amethyst",pattern:"minecraft:bolt"}', expectedData: { material: { materialId: 0 }, pattern: { patternId: 0 } }, expectedHash: 544463191 },
      {
        type: 'use_remainder',
        family: 'nested_items',
        itemName: 'golden_apple',
        component: '{id:"minecraft:glass_bottle"}',
        expectedData: { itemId: 1270, itemCount: 1, addedComponentCount: 0, removedComponentCount: 0, components: [], removeComponents: [] },
        expectedHash: -1613294730
      },
      { type: 'wolf/variant', family: 'variants', itemName: 'wolf_spawn_egg', component: '"minecraft:ashen"', expectedData: 0, expectedHash: 699442439 }
    ]
    assert.deepStrictEqual([...new Set(t09FamilyComponents.map(candidate => candidate.family))].sort(), ['combat', 'consumption', 'nested_items', 'predicates', 'records', 'registries', 'variants'])

    const rejectedCandidates = []
    for (const [index, candidate] of [...newComponents, ...t09FamilyComponents].entries()) {
      const itemName = candidate.itemName ?? 'stone'
      const commandMessages = []
      const onMessage = message => commandMessages.push(message)
      bot.on('messagestr', onMessage)
      try {
        const componentArgument = `minecraft:${candidate.type}=${candidate.component}`
        bot.chat(`/give @s minecraft:${itemName}[${componentArgument}] 1`)
        await bot._syncWindow(bot.inventory)
      } finally {
        bot.removeListener('messagestr', onMessage)
      }

      const item = bot.inventory.slots.find(item => item?.name === itemName && item.components?.some(component => component.type === candidate.type))
      const componentStacks = bot.inventory.slots
        .flatMap((stack, slot) => stack ? [{ slot, name: stack.name, componentTypes: stack.components.map(component => component.type) }] : [])
      if (!item) {
        rejectedCandidates.push({
          type: candidate.type,
          itemName,
          observed: componentStacks,
          response: commandMessages.join(' | ')
        })
        continue
      }

      const component = item.components.find(component => component.type === candidate.type)
      assert.ok(component, `the server-created stack should preserve ${candidate.type}`)
      const hashed = Item.toHashedNotch(item).components.find(entry => entry.type === candidate.type)
      assert.deepStrictEqual(component.data, candidate.expectedData, `Vanilla should decode the exact requested value for ${candidate.type}`)

      assert.ok(hashed && Number.isInteger(hashed.hash), `${candidate.type} should produce a hashed-slot entry`)
      assert.strictEqual(hashed.hash, candidate.expectedHash, `${candidate.type} hash should match its independently observed Vanilla 26.3 value`)

      const componentChest = await bot.openContainer(bot.blockAt(chestPos))
      const sourceWindowSlot = item.slot >= bot.inventory.hotbarStart
        ? componentChest.hotbarStart + item.slot - bot.inventory.hotbarStart
        : componentChest.inventoryStart + item.slot - bot.inventory.inventoryStart
      const chestSlot = index + 1

      const incorrectHash = candidate.expectedHash ^ 1
      const incorrectHashResponses = await clickWithComponentHash(bot, componentChest, sourceWindowSlot, candidate.type, incorrectHash)
      await bot._syncWindow(componentChest)
      assert.ok(incorrectHashResponses.some(({ name }) => name === 'set_cursor_item'), `Vanilla should correct an incorrect ${candidate.type} component hash`)
      if (componentChest.selectedItem) {
        await bot.clickWindow(sourceWindowSlot, 0, 0)
        await bot._syncWindow(componentChest)
      }
      assert.strictEqual(componentChest.slots[sourceWindowSlot]?.name, itemName, `incorrect ${candidate.type} hash probe should leave the item in its source slot`)
      assert.strictEqual(componentChest.selectedItem, null, `incorrect ${candidate.type} hash probe should leave the cursor empty`)

      const matchingHashResponses = await clickWithComponentHash(bot, componentChest, sourceWindowSlot, candidate.type, candidate.expectedHash)
      await bot._syncWindow(componentChest)
      assert.ok(!matchingHashResponses.some(({ name }) => name === 'set_cursor_item'), `Vanilla should not correct the matching ${candidate.type} component hash`)
      assert.strictEqual(componentChest.slots[sourceWindowSlot], null, `Vanilla should clear the source slot for ${candidate.type}`)
      assert.strictEqual(componentChest.selectedItem?.name, itemName, `Vanilla should accept the matching ${candidate.type} hash`)
      assert.deepStrictEqual(componentChest.selectedItem?.components, item.components, `Vanilla should preserve the exact ${candidate.type} data after pickup`)

      await bot.clickWindow(chestSlot, 0, 0)
      await bot._syncWindow(componentChest)
      assert.strictEqual(componentChest.slots[chestSlot]?.name, itemName, `Vanilla should accept placement for ${candidate.type}`)
      assert.deepStrictEqual(componentChest.slots[chestSlot].components, item.components, `Vanilla should preserve ${candidate.type} in the chest`)
      assert.strictEqual(componentChest.selectedItem, null, `Vanilla should clear the cursor after placing ${candidate.type}`)
      await bot.closeWindow(componentChest)
    }

    assert.deepStrictEqual(rejectedCandidates, [], `Vanilla 26.3 must create all probe components: ${JSON.stringify(rejectedCandidates)}`)
  }
}
