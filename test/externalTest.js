/* eslint-env mocha */

const assert = require('assert')
const mineflayer = require('../')
const commonTest = require('./externalTests/plugins/testCommon')
const mc = require('minecraft-protocol')
const fs = require('fs')
const path = require('path')

const { getPort } = require('./common/util')
const trace = require('./common/trace')
const { once } = require('../lib/promise_utils')
const { cleanupExternalTest, forceKillProcessTree } = require('./common/externalTestCleanup')

// set this to false if you want to test without starting a server automatically
const START_THE_SERVER = true
// if you want to have time to look what's happening increase this (milliseconds)
const TEST_TIMEOUT_MS = 90000

// The block matrix creates one test for almost every diggable block. Keep it
// out of the normal external run: 26.2 expands it to more than 1,000 cases
// and can take tens of minutes. Run it explicitly with
// MINEFLAYER_RUN_EXHAUSTIVE_BLOCK_TESTS=1.
const runExhaustiveBlockTests = /^(1|true|yes)$/i.test(process.env.MINEFLAYER_RUN_EXHAUSTIVE_BLOCK_TESTS ?? '')
const excludedTests = runExhaustiveBlockTests ? [] : ['digEverything']

// Mocha's normal exit path runs the after hook, but Ctrl+C and a hard test
// timeout can bypass it. Keep every wrapper reachable so interrupted runs do
// not leave a Java server (or its Windows child process tree) behind.
const activeExternalRuns = new Set()
let signalCleanupPromise

async function cleanupActiveExternalRuns () {
  const failures = []
  await Promise.all([...activeExternalRuns].map(async (activeRun) => {
    const { wrap, getBot } = activeRun
    try {
      // Do not remove the test world while handling a signal; preserving it
      // makes an interrupted run diagnosable.
      await cleanupExternalTest({ wrap, getBot, deleteServerData: false })
    } catch (err) {
      failures.push(err)
    } finally {
      activeExternalRuns.delete(activeRun)
    }
  }))
  if (failures.length > 0) throw failures[0]
}

function handleExternalSignal (exitCode) {
  if (signalCleanupPromise) return
  signalCleanupPromise = cleanupActiveExternalRuns()
    .catch(err => console.error('external test cleanup failed:', err))
    .finally(() => {
      process.exitCode = exitCode
      process.exit(exitCode)
    })
}

process.prependListener('SIGINT', () => handleExternalSignal(130))
process.prependListener('SIGTERM', () => handleExternalSignal(143))
process.on('exit', () => {
  for (const { wrap } of activeExternalRuns) forceKillProcessTree(wrap.mcServer)
})

const propOverrides = {
  'level-type': 'FLAT',
  'spawn-npcs': 'true',
  'spawn-animals': 'false',
  'online-mode': 'false',
  gamemode: '1',
  'spawn-monsters': 'false',
  'generate-structures': 'false',
  'enable-command-block': 'true',
  // 8 is the floor: nether portal travel force-generates ±128 blocks (8 chunks)
  // regardless, and blockfinder.js findBlocks uses maxDistance 128
  'view-distance': '8',
  'use-native-transport': 'false' // java 16 throws errors without this, https://www.spigotmc.org/threads/unable-to-access-address-of-buffer.311602
}

const Wrap = require('minecraft-wrap').Wrap
const download = require('minecraft-wrap').download

const MC_SERVER_PATH = path.join(__dirname, 'server')

// wrap's start callback fires on the server's "Done" log line, which precedes
// the server answering status requests — by ~80ms on 26.1. That gap is version
// dependent, so retry rather than sleep a fixed time, and keep closeTimeout well
// under the 120s hook budget so the retries fit.
async function pingUntilReady (port, host, version, attempts = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await mc.ping({ port, host, version, closeTimeout: 5 * 1000 })
    } catch (err) {
      console.log(`ping attempt ${attempt} failed: ${err.message}`)
      if (attempt === attempts) throw err
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
}

for (const supportedVersion of mineflayer.testedVersions) {
  let PORT = 25565
  const registry = require('prismarine-registry')(supportedVersion)
  const version = registry.version
  const MC_SERVER_JAR_DIR = process.env.MC_SERVER_JAR_DIR || `${process.cwd()}/server_jars`
  const MC_SERVER_JAR = `${MC_SERVER_JAR_DIR}/minecraft_server.${version.minecraftVersion}.jar`
  const wrap = new Wrap(MC_SERVER_JAR, `${MC_SERVER_PATH}_${supportedVersion}`)
  wrap.on('line', (line) => {
    console.log(line)
  })

  describe(`mineflayer_external ${supportedVersion}v`, function () {
    let bot
    const activeRun = { wrap, getBot: () => bot }
    activeExternalRuns.add(activeRun)
    this.timeout(10 * 60 * 1000)
    before(async function () {
      PORT = await getPort()
      console.log(`Port chosen: ${PORT}`)
    })
    before(function (done) {
      this.timeout(1000 * 120)
      function begin () {
        bot = mineflayer.createBot({
          username: 'flatbot',
          viewDistance: 'tiny',
          port: PORT,
          host: '127.0.0.1',
          version: supportedVersion
        })
        commonTest(bot, wrap)
        bot.test.port = PORT

        console.log('starting bot')
        trace.log('bot created')
        bot._client.on('connect', () => trace.log('bot tcp connected'))
        bot._client.on('error', err => trace.log('bot client error', { error: err?.message ?? String(err) }))
        bot._client.on('end', reason => trace.log('bot client ended', { reason }))
        bot.once('login', () => trace.log('bot logged in'))
        bot.once('spawn', () => {
          console.log('bot spawned, opping...')
          trace.log('bot spawned, opping')
          wrap.writeServer('op flatbot\n')
          if (bot.supportFeature('gameRuleUsesResourceLocation')) {
            wrap.writeServer('gamerule minecraft:spawn_monsters false\n')
          } else {
            wrap.writeServer('gamerule spawnMonsters false\n')
          }
          bot.once('messagestr', msg => {
            if (msg.includes('Made flatbot a server operator') || msg === '[Server: Opped flatbot]') {
              trace.log('bot opped, setup done')
              done()
            }
          })
        })
      }

      if (START_THE_SERVER) {
        console.log('downloading and starting server')
        trace.log('downloading server jar', { version: version.minecraftVersion, port: PORT })
        download(version.minecraftVersion, MC_SERVER_JAR, (err) => {
          if (err) {
            console.log(err)
            done(err)
            return
          }
          trace.log('server jar downloaded, starting server')
          propOverrides['server-port'] = PORT
          if (process.env.LEVEL_SEED) propOverrides['level-seed'] = process.env.LEVEL_SEED
          wrap.startServer(propOverrides, (err) => {
            if (err) return done(err)
            // The seed is otherwise unrecoverable from a failed run: the log never
            // prints it and the login packet only carries a hash of it.
            wrap.writeServer('seed\n')
            console.log(`pinging ${version.minecraftVersion} port : ${PORT}`)
            trace.log('server started, pinging')
            pingUntilReady(PORT, '127.0.0.1', supportedVersion).then(results => {
              console.log('pong')
              trace.log('pong', { latency: results.latency })
              assert.ok(results.latency >= 0)
              assert.ok(results.latency <= 1000)
              begin()
            }).catch(err => {
              trace.log('ping failed', { error: err?.message ?? String(err) })
              done(err)
            })
          })
        })
      } else begin()
    })

    after(async function () {
      try {
        await cleanupExternalTest({ wrap, getBot: () => bot })
      } catch (err) {
        console.error('external test cleanup failed:', err)
        throw err
      } finally {
        // Do not retain a stopped child process in the exit-time kill set: a
        // later process could otherwise reuse the same PID on Windows.
        activeExternalRuns.delete(activeRun)
      }
    })

    let suiteAborted = false
    // mocha doesn't cancel a test it kills at its timeout, it just stops waiting
    // for it: the attempt's example keeps running and its listeners keep
    // reacting to the shared bot, so the next test (or retry) would run the
    // example twice at once. This hook runs after every attempt, retries too.
    afterEach(function () {
      bot?.test?.abortRunningExample?.()
      if (this.currentTest?.state === 'failed') {
        // A timed-out test is no longer awaited by Mocha, but its async body
        // can otherwise continue issuing packets against the shared bot.
        // Disconnect it and make teardown the only remaining activity.
        try { bot?.end('external test failed') } catch (err) { /* already closed */ }
        suiteAborted = true
      }
    })

    async function reconnectBot () {
      console.log('  Bot disconnected, reconnecting...')
      try { bot.end() } catch (e) { /* ignore */ }
      await new Promise(resolve => setTimeout(resolve, 1000))
      bot = mineflayer.createBot({
        username: 'flatbot',
        viewDistance: 'tiny',
        port: PORT,
        host: '127.0.0.1',
        version: supportedVersion
      })
      commonTest(bot, wrap)
      bot.test.port = PORT
      await once(bot, 'spawn')
      console.log('  Bot reconnected')
      wrap.writeServer('op flatbot\n')
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    const externalTestsFolder = path.resolve(__dirname, './externalTests')
    let distinctFailures = 0
    let exhaustiveBlockStateReady = false
    // Sort test files so example tests (which spawn child processes and can
    // crash/disconnect the bot) run last, limiting their blast radius.
    const dangerousTests = ['exampleBee', 'exampleDigger', 'exampleInventory']
    fs.readdirSync(externalTestsFolder)
      .filter(file => fs.statSync(path.join(externalTestsFolder, file)).isFile())
      .sort((a, b) => {
        const aName = path.basename(a, '.js')
        const bName = path.basename(b, '.js')
        const aDangerous = dangerousTests.includes(aName) ? 1 : 0
        const bDangerous = dangerousTests.includes(bName) ? 1 : 0
        return aDangerous - bDangerous
      })
      .forEach((test) => {
        test = path.basename(test, '.js')
        const testFunctions = require(`./externalTests/${test}`)(supportedVersion)
        const runTest = (testName, testFunction) => {
          return function (done) {
            this.timeout(TEST_TIMEOUT_MS)
            if (suiteAborted) {
              this.skip()
              return
            }
            // Disable retries if too many different tests have already failed
            // on their first attempt (indicates a systemic issue, not flakiness)
            if (distinctFailures >= 3) this.retries(0)
            if (this.test._currentRetry > 0) {
              console.log(`  [retry ${this.test._currentRetry}] ${testName}`)
            }
            const isBatchableExhaustiveBlockTest = runExhaustiveBlockTests && test === 'digEverything'
            const resetState = !isBatchableExhaustiveBlockTest || !exhaustiveBlockStateReady
            // Reconnect if bot got disconnected by a previous test
            const reconnect = !bot.entity
              ? reconnectBot()
              : Promise.resolve()
            reconnect.then(() => resetState ? bot.test.resetState() : undefined)
              .then(() => {
                if (isBatchableExhaustiveBlockTest) exhaustiveBlockStateReady = true
                bot.test.sayEverywhere(`### Starting ${testName}`)
                return testFunction(bot, done)
              })
              .then(res => done())
              .catch(e => {
                if (this.test._currentRetry === 0) {
                  distinctFailures++
                }
                done(e)
              })
          }
        }
        if (excludedTests.indexOf(test) === -1) {
          if (typeof testFunctions === 'object') {
            for (const testFunctionName in testFunctions) {
              if (testFunctions[testFunctionName] !== undefined) {
                it(`${test} ${testFunctionName}`, (testFunctionName => runTest(`${test} ${testFunctionName}`, testFunctions[testFunctionName]))(testFunctionName))
              }
            }
          } else {
            it(test, runTest(test, testFunctions))
          }
        }
      })
  })
}
