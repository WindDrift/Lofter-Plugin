/**
 * @module apps/lofter
 * @description Lofter 链接解析插件主入口，仅保留博文解析和快速解析
 *
 * 博主浏览 → apps/blogBrowser.js
 * 标签浏览 → apps/tagBrowser.js
 */

import plugin from '../../../lib/plugins/plugin.js'
import { execFileSync } from 'child_process'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { getListCache } from '../lib/fetch/listCache.js'
import { formatDate } from '../lib/core/utils.js'
import { categorizeError } from '../lib/core/errors.js'
import { loadConfig } from '../lib/core/configLoader.js'
import { executeParsePipeline } from '../lib/message/pipeline.js'

/** @typedef {import('../lib/core/types.js').LofterConfig} LofterConfig */

/** Lofter 博文链接正则表达式（模块内私有） */
const LOFTER_URL_REGEX = /https?:\/\/[a-zA-Z0-9-]+\.lofter\.com\/post\/[a-zA-Z0-9_]+/i

/** 与 LOFTER_URL_REGEX 等价的字符串模式（供 Yunzai rule.reg 使用，模块内私有） */
const LOFTER_URL_PATTERN = 'https?:\\/\\/[a-zA-Z0-9-]+\\.lofter\\.com\\/post\\/[a-zA-Z0-9_]+'

/** 开发者模式提示 */
const DEVELOPER_MODE_MESSAGE = '你正处于开发者模式，较正式版有以下新功能：'

/** 开发者模式无差异提示 */
const DEVELOPER_MODE_SAME_MESSAGE = '你正处于开发者模式，当前与正式版一致。'

/** 插件仓库路径 */
const pluginPath = dirname(dirname(fileURLToPath(import.meta.url)))

/** 当日内存解析计数（无需持久化） */
const parseCounter = {
  date: '',
  today: 0,
  groups: new Map()
}

/**
 * 从文本中提取第一个 Lofter 博文 URL
 * @param {string} text
 * @returns {string|null}
 */
const extractLofterUrl = (text) => {
  const m = text.match(LOFTER_URL_REGEX)
  return m ? m[0] : null
}

export class LofterPlugin extends plugin {
  constructor() {
    super({
      name: 'Lofter解析',
      dsc: '解析Lofter链接并发送图文',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: LOFTER_URL_PATTERN,
          fnc: 'parseLofter'
        },
        {
          reg: '^#lofter解析\\s*(\\d+)$',
          fnc: 'parseCachedListItem'
        }
      ]
    })
  }

  /**
   * 主入口：博文链接自动解析
   * @param {object} e
   * @returns {Promise<boolean>}
   */
  async parseLofter(e) {
    logger.debug?.(`[Lofter解析] parseLofter 已触发, msg=${String(e?.msg).slice(0, 80)}`)

    const config = loadConfig()
    if (!config) return false
    if (!config.autoParse) {
      logger.debug?.('[Lofter解析] autoParse=false，跳过')
      return false
    }

    const url = extractLofterUrl(e.msg)
    if (!url) {
      logger.debug?.('[Lofter解析] 未能从消息中提取 Lofter URL')
      return false
    }
    logger.info(`[Lofter解析] 检测到链接: ${url}`)
    if (config.lofterLoginEnabled === true) {
      logger.info('[Lofter解析] 已启用 Lofter 登录认证')
    }

    return executeParsePipeline(e, {
      url,
      config,
      recordParse: (e) => this.recordSuccessfulParse(e),
      onDeveloperMode: (e) => this.sendDeveloperModeMessage(e)
    })
  }

  /**
   * 从缓存列表中解析指定序号的帖子
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async parseCachedListItem(e) {
    const config = loadConfig()
    if (!config) return false

    const cache = getListCache(e)
    if (!cache || !cache.items || cache.items.length === 0) {
      await e.reply('当前没有可解析的列表，请先使用 #lofter 博主名 或 #lofter标签 标签名 浏览列表')
      return false
    }

    const match = e.msg.match(/^#lofter解析\s*(\d+)$/)
    if (!match) return false

    const index = parseInt(match[1], 10)
    if (index < 1 || index > cache.items.length) {
      await e.reply(`序号超出范围，请输入 1 到 ${cache.items.length} 之间的数字`)
      return false
    }

    const item = cache.items[index - 1]
    const blogName = item.blogInfo?.blogName
    const permalink = item.permalink

    const url = permalink?.startsWith('http') ? permalink : (blogName && permalink ? `https://${blogName}.lofter.com/post/${permalink}` : '')
    if (!url) {
      await e.reply('该帖子信息不完整，无法解析')
      return false
    }

    logger.info(`[Lofter解析] 快速解析: ${url}`)

    return executeParsePipeline(e, {
      url,
      config,
      recordParse: (e) => this.recordSuccessfulParse(e),
      onDeveloperMode: (e) => this.sendDeveloperModeMessage(e)
    })
  }

  // ============== 解析计数 ==============

  recordSuccessfulParse(e) {
    const today = formatDate(Date.now())
    if (parseCounter.date !== today) {
      parseCounter.date = today
      parseCounter.today = 0
      parseCounter.groups.clear()
    }
    parseCounter.today++

    const groupKey = e.isGroup ? String(e.group_id || e.group?.group_id || e.group?.id || 'unknown') : 'private'
    const groupCount = (parseCounter.groups.get(groupKey) || 0) + 1
    parseCounter.groups.set(groupKey, groupCount)

    return { today: parseCounter.today, group: groupCount }
  }

  // ============== 开发者模式 ==============

  isDeveloperMode() {
    try {
      const branch = execFileSync('git', ['branch', '--show-current'], {
        cwd: pluginPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
      return branch === 'dev'
    } catch (err) {
      logger.debug?.(`[Lofter解析] 获取当前 Git 分支失败: ${err.message}`)
      return false
    }
  }

  getDeveloperCommitMessages() {
    try {
      const baseRef = this.resolveMainRef()
      const output = execFileSync('git', ['log', '--format=%cd%x09%H%x09%s', '--date=format:%Y-%m-%d %H:%M:%S', `${baseRef}..dev`], {
        cwd: pluginPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
      if (!output) return []
      return output.split('\n').map(line => {
        const [time, hash, ...subjectParts] = line.split('\t')
        const shortHash = hash.slice(-7)
        return `${time} ${shortHash} ${subjectParts.join('\t')}`
      })
    } catch (err) {
      logger.debug?.(`[Lofter解析] 对比 dev 与 main 分支失败: ${err.message}`)
      return []
    }
  }

  resolveMainRef() {
    try {
      execFileSync('git', ['rev-parse', '--verify', 'origin/main'], {
        cwd: pluginPath,
        encoding: 'utf8',
        stdio: ['ignore', 'ignore', 'ignore']
      })
      return 'origin/main'
    } catch (err) {
      return 'main'
    }
  }

  async sendDeveloperModeMessage(e) {
    if (!this.isDeveloperMode()) return
    try {
      const commits = this.getDeveloperCommitMessages()
      const message = commits.length > 0
        ? `${DEVELOPER_MODE_MESSAGE}\n${commits.join('\n')}`
        : DEVELOPER_MODE_SAME_MESSAGE
      await e.reply(message)
    } catch (err) {
      logger.error('[Lofter解析] 发送开发者模式提示失败', err)
    }
  }
}
