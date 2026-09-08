const { spawnSync } = require('child_process')

const DEFAULT_STOP_TIMEOUT = 10000

function forceKillProcessTree (server) {
  if (!server) return
  const pid = Number(server.pid)
  if (process.platform === 'win32' && Number.isInteger(pid) && pid > 0) {
    try {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      })
    } catch (err) {
      // The direct kill below is still useful if taskkill is unavailable.
    }
  }
  try {
    if (typeof server.kill === 'function' && !server.killed) server.kill('SIGKILL')
  } catch (err) {
    // The process may have exited between the taskkill and direct kill.
  }
}

function stopExternalServer (wrap, { timeout = DEFAULT_STOP_TIMEOUT, kill = forceKillProcessTree } = {}) {
  const server = wrap?.mcServer
  if (!server) return Promise.resolve()

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutHandle)
      if (err) reject(err)
      else resolve()
    }
    const timeoutHandle = setTimeout(() => {
      try {
        kill(server)
      } catch (err) {
        finish(err)
        return
      }
      // A slow Java shutdown is still a successful cleanup once the process
      // tree has been force-killed. Reporting the timeout as a test failure
      // made otherwise passing CI runs fail in their after hook.
      finish()
    }, timeout)

    try {
      wrap.stopServer((err) => {
        if (err) {
          try { kill(server) } catch (killError) {}
        }
        finish(err)
      })
    } catch (err) {
      try { kill(server) } catch (killError) {}
      finish(err)
    }
  })
}

function deleteExternalServerData (wrap) {
  if (!wrap?.deleteServerData) return Promise.resolve()
  return new Promise((resolve, reject) => {
    try {
      wrap.deleteServerData(err => err ? reject(err) : resolve())
    } catch (err) {
      reject(err)
    }
  })
}

const cleanupPromises = new WeakMap()

function cleanupExternalTest ({ wrap, getBot = () => null, deleteServerData = true, stopTimeout = DEFAULT_STOP_TIMEOUT }) {
  if (cleanupPromises.has(wrap)) return cleanupPromises.get(wrap)

  const cleanup = (async () => {
    let firstError
    const bot = getBot()
    try {
      if (bot?.quit) bot.quit()
      else if (bot?.end) bot.end()
    } catch (err) {
      firstError = err
    }

    try {
      await stopExternalServer(wrap, { timeout: stopTimeout })
    } catch (err) {
      firstError ??= err
    }

    if (deleteServerData) {
      try {
        await deleteExternalServerData(wrap)
      } catch (err) {
        firstError ??= err
      }
    }

    if (firstError) throw firstError
  })()
  cleanupPromises.set(wrap, cleanup)
  return cleanup
}

module.exports = {
  DEFAULT_STOP_TIMEOUT,
  forceKillProcessTree,
  stopExternalServer,
  cleanupExternalTest
}
