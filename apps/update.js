/**
 * @module apps/update
 * @description Lofter 插件更新模块
 *
 * 增强点（F-07）：scheduleRestart 优先尝试 Yunzai 优雅退出钩子，
 * 失败时回退到 npm run restart，最差情况硬退 process.exit(0)
 */

import plugin from '../../../lib/plugins/plugin.js'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const execAsync = promisify(exec)

/** 插件根目录（Lofter-Plugin） */
const __dirname = dirname(fileURLToPath(import.meta.url))
const pluginPath = dirname(__dirname)

/** 更新日志最大输出长度，防止合并消息超出 QQ 长度限制 */
const MAX_LOG_LENGTH = 2000

/** 错误消息最大输出长度 */
const MAX_ERROR_LENGTH = 500

export class LofterUpdate extends plugin {
  constructor() {
    super({
      name: 'Lofter插件更新',
      dsc: '通过发送 #更新Lofter 来拉取最新代码更新此插件',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: /^#?(更新lofter|lofter更新|更新lofter插件|lofter插件更新)$/i,
          fnc: 'updatePlugin',
          permission: 'master'
        }
      ]
    })
  }

  /**
   * 执行插件更新操作
   * @param {object} e
   * @returns {Promise<boolean>}
   */
  async updatePlugin(e) {
    if (!e.isMaster) {
      await e.reply('只有主人才能更新 Lofter 插件哦~')
      return true
    }

    await e.reply('🍼开始尝试拉取 Lofter-Plugin 最新代码...')

    try {
      try {
        await execAsync('git fetch origin --prune', { cwd: pluginPath })
      } catch (fetchErr) {
        logger.debug('[Lofter插件更新] fetch origin 失败，继续执行 pull', fetchErr)
      }

      const { stdout } = await execAsync('git pull', { cwd: pluginPath })

      if (stdout.includes('Already up to date.') || stdout.includes('已经是最新')) {
        await e.reply('目前已经是最新版本了，无需更新~')
        return true
      }

      const logMsg = await this.fetchUpdateLog()

      let msg = '✅ Lofter-Plugin 更新成功！'
      if (logMsg) {
        msg += '\n\n【最新更新日志】\n' + logMsg
      }
      msg += '\n\n🔄正在为您重启 Bot...'

      await e.reply(msg)
      this.scheduleRestart()
      return true
    } catch (err) {
      logger.error('[Lofter插件更新] 更新失败', err)
      let errorMsg = '❌ 更新失败！请检查控制台日志。\n' + err.message
      if (errorMsg.length > MAX_ERROR_LENGTH) {
        errorMsg = errorMsg.substring(0, MAX_ERROR_LENGTH) + '...'
      }
      await e.reply(errorMsg)
      return true
    }
  }

  /**
   * 获取本次更新的 git 提交日志
   * @returns {Promise<string|null>}
   */
  async fetchUpdateLog() {
    try {
      const { stdout } = await execAsync(
        'git log ORIG_HEAD..HEAD --pretty=format:"* %h - %s"',
        { cwd: pluginPath }
      )
      if (!stdout) return null
      let logMsg = stdout.trim()
      if (logMsg.length > MAX_LOG_LENGTH) {
        logMsg = logMsg.substring(0, MAX_LOG_LENGTH) + '\n...（及更多内容）'
      }
      return logMsg
    } catch (logErr) {
      return null
    }
  }

  /**
   * 延迟 1 秒后重启 Bot 进程（F-07 优雅退出）
   * 优先级：
   *  1) 尝试 Yunzai 全局退出钩子（global.Bot?.exit / process.emit('exit')）
   *  2) 尝试 npm run restart
   *  3) 硬退 process.exit(0)（依赖外部守护程序重启）
   */
  scheduleRestart() {
    setTimeout(async () => {
      // 方式 1：尝试 Yunzai 优雅退出
      try {
        if (typeof global.Bot?.exit === 'function') {
          logger.mark('[Lofter插件更新] 调用 Yunzai 优雅退出钩子')
          global.Bot.exit()
          return
        }
        if (typeof global.process.send === 'function') {
          // 通过 IPC 通知父进程重启
          global.process.send({ type: 'restart' })
          return
        }
      } catch (err) {
        logger.debug('[Lofter插件更新] 优雅退出失败，回退 npm restart', err)
      }

      // 方式 2：npm run restart
      try {
        await execAsync('npm run restart', { cwd: process.cwd() })
        return
      } catch (err) {
        logger.debug('[Lofter插件更新] npm run restart 失败，回退 process.exit', err)
      }

      // 方式 3：硬退（依赖 pm2/systemd 等守护）
      logger.mark('[Lofter插件更新] 硬退进程，请确保有守护程序')
      process.exit(0)
    }, 1000)
  }
}
