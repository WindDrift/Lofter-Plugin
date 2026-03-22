import plugin from '../../../lib/plugins/plugin.js'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const execAsync = promisify(exec)
// 获取当前文件所在目录，即 apps 目录
const __dirname = dirname(fileURLToPath(import.meta.url))
// 插件根目录，即 Lofter-Plugin 目录
const pluginPath = dirname(__dirname)

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

  async updatePlugin(e) {
    // 权限校验：仅允许 Bot 主人执行更新操作
    if (!e.isMaster) {
      await e.reply('只有主人才能更新 Lofter 插件哦~')
      return true
    }

    await e.reply('🍼开始尝试拉取 Lofter-Plugin 最新代码...')

    try {
      // 执行 git pull 命令，工作目录设置在插件根目录
      const { stdout, stderr } = await execAsync('git pull', { cwd: pluginPath })

      if (stdout.includes('Already up to date.') || stdout.includes('已经是最新')) {
        await e.reply('目前已经是最新版本了，无需更新~')
        return true
      }

      // 获取此次拉取的所有更新提交记录作为更新日志（使用 ORIG_HEAD..HEAD 获取本次拉取合并的所有提交）
      let logMsg = ''
      try {
        const { stdout: logStdout } = await execAsync('git log ORIG_HEAD..HEAD --pretty=format:"* %h - %s"', { cwd: pluginPath })
        if (logStdout) {
          logMsg = logStdout.trim()
          // 限制输出最大长度，防止一次更新产生过多日志导致合并消息超出长度限制发送失败
          if (logMsg.length > 2000) {
            logMsg = logMsg.substring(0, 2000) + '\n...（及更多内容）'
          }
        }
      } catch (logErr) {}

      let msg = '✅ Lofter-Plugin 更新成功！'
      if (logMsg) {
        msg += '\n\n【最新更新日志】\n' + logMsg
      }
      msg += '\n\n🔄正在为您重启 Bot...'
      
      await e.reply(msg)

      // 延迟 1 秒后重启，优先尝试 npm run restart，若失败且环境不受支持则直接退出依赖外部守护程序重启
      setTimeout(async () => {
        try {
          await execAsync('npm run restart', { cwd: process.cwd() })
        } catch (error) {
          process.exit(0)
        }
      }, 1000)

      return true
    } catch (err) {
      logger.error('[Lofter插件更新] 更新失败', err)
      let errorMsg = '❌ 更新失败！请检查控制台日志。\n' + err.message
      if (errorMsg.length > 500) {
        errorMsg = errorMsg.substring(0, 500) + '...'
      }
      await e.reply(errorMsg)
      return true
    }
  }
}
