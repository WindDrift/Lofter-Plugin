/**
 * @module apps/dailyImage
 * @description 每日一图订阅与推送插件（支持每群多标签）
 *
 * 命令：
 *  - #lofter每日一图订阅 标签名 [排序] — 添加标签订阅
 *  - #lofter每日一图取消订阅 [标签名] — 取消订阅（不传标签名则取消全部）
 *  - #lofter每日一图状态 — 查看当前订阅状态
 */

import plugin from '../../../lib/plugins/plugin.js'
import { loadConfig } from '../lib/core/configLoader.js'
import { addSubscription, removeSubscription, getSubscription } from '../lib/dailyImage/subscription.js'
import { startScheduler, stopScheduler } from '../lib/dailyImage/scheduler.js'

const VALID_SORTS = ['new', 'hot', 'month', 'week', 'date', 'total']

/**
 * 英文排序到中文显示名称的映射
 */
const SORT_DISPLAY_MAP = {
  'new': '最新',
  'hot': '热门',
  'date': '日榜',
  'week': '周榜',
  'month': '月榜',
  'total': '总榜'
}

/**
 * 中文排序名称映射
 */
const SORT_NAME_MAP = {
  '最新': 'new',
  '热门': 'hot',
  '日榜': 'date',
  '周榜': 'week',
  '月榜': 'month',
  '总榜': 'total'
}

/**
 * 检查发送者是否有管理权限（群主、管理员或 Bot 主人）
 * @param {object} e - 消息事件对象
 * @returns {boolean}
 */
function hasManagePermission(e) {
  // Bot 主人
  if (e.isMaster) return true
  // 群聊权限检查
  if (e.isGroup && e.sender) {
    const role = e.sender.role
    // owner=群主, admin=管理员
    return role === 'owner' || role === 'admin'
  }
  return false
}

export class DailyImage extends plugin {
  constructor() {
    super({
      name: 'Lofter每日一图',
      dsc: '每日一图订阅与推送',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^#lofter每日一图订阅\\s+(\\S+)(?:\\s+(\\S+))?$',
          fnc: 'subscribe'
        },
        {
          reg: '^#lofter每日一图取消订阅(?:\\s+(\\S+))?$',
          fnc: 'unsubscribe'
        },
        {
          reg: '^#lofter每日一图状态$',
          fnc: 'status'
        }
      ]
    })

    this._initScheduler()
  }

  /**
   * 根据配置决定是否启动调度器
   */
  _initScheduler() {
    try {
      const config = loadConfig()
      if (config?.dailyImageEnabled) {
        startScheduler()
      }
    } catch (err) {
      logger.error(`[Lofter解析] 每日一图调度器初始化失败: ${err.message}`)
    }
  }

  /**
   * 订阅每日一图（添加标签到群订阅）
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async subscribe(e) {
    if (!e.isGroup) {
      await e.reply('每日一图功能仅限群聊使用')
      return false
    }

    if (!hasManagePermission(e)) {
      await e.reply('仅群主、管理员或 Bot 主人可操作订阅')
      return false
    }

    const config = loadConfig()
    if (!config?.dailyImageEnabled) {
      await e.reply('每日一图功能未启用')
      return false
    }

    const match = e.msg.match(/^#lofter每日一图订阅\s+(\S+)(?:\s+(\S+))?$/)
    const tagName = match[1]
    let sort = match[2] || 'new'

    // 支持中文排序名称映射
    if (SORT_NAME_MAP[sort]) {
      sort = SORT_NAME_MAP[sort]
    }

    if (!VALID_SORTS.includes(sort)) {
      await e.reply('不支持的排序方式，可选：最新/热门/日榜/周榜/月榜/总榜 或 new/hot/date/week/month/total')
      return false
    }

    const groupId = String(e.group_id || e.group?.group_id || e.group?.id || '')
    const result = await addSubscription(groupId, tagName, sort, config.dailyImageMaxSubscriptions || 50)

    if (result.success === false && result.reason === 'limit') {
      await e.reply('订阅数量已达上限')
      return false
    }

    await e.reply(`已${result.isNew ? '订阅' : '更新'}标签 [${tagName}]，排序 [${SORT_DISPLAY_MAP[sort] || sort}]，推送时间 [${config.dailyImagePushTime || '08:00'}]`)
    return true
  }

  /**
   * 取消订阅每日一图（支持取消指定标签或全部）
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async unsubscribe(e) {
    if (!e.isGroup) {
      await e.reply('每日一图功能仅限群聊使用')
      return false
    }

    if (!hasManagePermission(e)) {
      await e.reply('仅群主、管理员或 Bot 主人可操作订阅')
      return false
    }

    const config = loadConfig()
    if (!config?.dailyImageEnabled) {
      await e.reply('每日一图功能未启用')
      return false
    }

    const match = e.msg.match(/^#lofter每日一图取消订阅(?:\s+(\S+))?$/)
    const tagName = match[1]

    const groupId = String(e.group_id || e.group?.group_id || e.group?.id || '')
    const result = await removeSubscription(groupId, tagName)

    if (result.success === false) {
      if (result.reason === 'not_found') {
        await e.reply('当前群未订阅每日一图')
      } else if (result.reason === 'tag_not_found') {
        await e.reply(`当前群未订阅标签 [${tagName}]`)
      }
      return false
    }

    await e.reply(tagName ? `已取消订阅标签 [${tagName}]` : '已取消全部每日一图订阅')
    return true
  }

  /**
   * 查看每日一图订阅状态
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async status(e) {
    if (!e.isGroup) {
      await e.reply('每日一图功能仅限群聊使用')
      return false
    }

    const config = loadConfig()
    if (!config?.dailyImageEnabled) {
      await e.reply('每日一图功能未启用')
      return false
    }

    const groupId = String(e.group_id || e.group?.group_id || e.group?.id || '')
    const sub = await getSubscription(groupId)

    if (!sub || !sub.tags || sub.tags.length === 0) {
      await e.reply('当前群未订阅每日一图')
      return true
    }

    const tagsList = sub.tags.map((t, i) => `${i + 1}. ${t.tagName} (${SORT_DISPLAY_MAP[t.sort] || t.sort})`).join('\n')
    const pushInterval = config.dailyImagePushInterval || 3
    const intervalNote = sub.tags.length > 1 ? `\n标签间隔：${pushInterval}分钟` : ''

    await e.reply(`每日一图订阅状态：\n${tagsList}\n推送时间：${config.dailyImagePushTime || '08:00'}${intervalNote}`)
    return true
  }
}
