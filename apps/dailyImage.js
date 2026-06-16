/**
 * @module apps/dailyImage
 * @description 每日一图订阅与推送插件，处理 #lofter每日一图订阅、#lofter每日一图取消订阅、#lofter每日一图状态 命令
 */

import plugin from '../../../../lib/plugins/plugin.js'
import { loadConfig } from '../lib/core/configLoader.js'
import { addSubscription, removeSubscription, getSubscription } from '../lib/dailyImage/subscription.js'
import { startScheduler, stopScheduler } from '../lib/dailyImage/scheduler.js'

const VALID_SORTS = ['new', 'hot', 'month', 'week', 'date', 'total']

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
          reg: '^#lofter每日一图取消订阅$',
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
   * 订阅每日一图
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async subscribe(e) {
    if (!e.isGroup) {
      await e.reply('每日一图功能仅限群聊使用')
      return false
    }

    const config = loadConfig()
    if (!config?.dailyImageEnabled) {
      await e.reply('每日一图功能未启用')
      return false
    }

    const match = e.msg.match(/^#lofter每日一图订阅\s+(\S+)(?:\s+(\S+))?$/)
    const tagName = match[1]
    const sort = match[2] || 'new'

    if (!VALID_SORTS.includes(sort)) {
      await e.reply('不支持的排序方式，可选：new/hot/month/week/date/total')
      return false
    }

    const groupId = String(e.group_id || e.group?.group_id || e.group?.id || '')
    const result = await addSubscription(groupId, tagName, sort, config.dailyImageMaxSubscriptions || 50)

    if (result.success === false && result.reason === 'limit') {
      await e.reply('订阅数量已达上限')
      return false
    }

    await e.reply(`已${result.isNew ? '订阅' : '更新订阅'}：标签 [${tagName}]，排序 [${sort}]，推送时间 [${config.dailyImagePushTime || '08:00'}]`)
    return true
  }

  /**
   * 取消订阅每日一图
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async unsubscribe(e) {
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
    const result = await removeSubscription(groupId)

    if (result.success === false) {
      await e.reply('当前群未订阅每日一图')
      return false
    }

    await e.reply('已取消每日一图订阅')
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

    if (!sub) {
      await e.reply('当前群未订阅每日一图')
      return true
    }

    await e.reply(`每日一图订阅状态：\n标签：${sub.tagName}\n排序：${sub.sort}\n推送时间：${config.dailyImagePushTime || '08:00'}`)
    return true
  }
}
