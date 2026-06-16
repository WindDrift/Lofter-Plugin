/**
 * @module lib/dailyImage/scheduler
 * @description 基于 setTimeout 的每日定时调度器，在配置的时间点触发推送
 */

import { fetchTagPageByAPI } from '../fetch/fetcher.js'
import { parseAPIResponse } from '../parse/tagParser.js'
import { executeParsePipeline } from '../message/pipeline.js'
import { loadConfig } from '../core/configLoader.js'
import { getAllSubscriptions } from './subscription.js'
import { categorizeError } from '../core/errors.js'

let schedulerTimer = null

/**
 * 计算距下次推送时间的毫秒数
 * @param {string} pushTimeStr - 推送时间，格式 HH:mm
 * @returns {number} 距下次推送的毫秒数
 */
export function calculateNextDelay(pushTimeStr) {
  const [hours, minutes] = pushTimeStr.split(':').map(Number)
  const now = new Date()
  const target = new Date()
  target.setHours(hours, minutes, 0, 0)

  let delay = target.getTime() - now.getTime()
  if (delay <= 0) {
    target.setDate(target.getDate() + 1)
    delay = target.getTime() - now.getTime()
  }
  return delay
}

/**
 * 启动每日一图调度器
 */
export function startScheduler() {
  const config = loadConfig()
  const pushTime = config?.dailyImagePushTime || '08:00'
  const delay = calculateNextDelay(pushTime)

  const nextTime = new Date(Date.now() + delay)
  const timeStr = nextTime.toLocaleString('zh-CN', { hour12: false })

  logger.info(`[Lofter解析] 每日一图调度器已启动，下次推送时间: ${timeStr}`)

  schedulerTimer = setTimeout(async () => {
    try {
      await executeDailyPush()
    } catch (err) {
      logger.error(`[Lofter解析] 每日推送执行异常: ${err.message}`)
    }
    startScheduler()
  }, delay)
}

/**
 * 停止每日一图调度器
 */
export function stopScheduler() {
  if (schedulerTimer !== null) {
    clearTimeout(schedulerTimer)
    schedulerTimer = null
    logger.info('[Lofter解析] 每日一图调度器已停止')
  }
}

/**
 * 执行每日推送：遍历所有订阅，随机推送一篇博文
 */
export async function executeDailyPush() {
  const subscriptions = getAllSubscriptions()
  if (!subscriptions || subscriptions.length === 0) {
    logger.debug?.('[Lofter解析] 无订阅，跳过每日推送')
    return
  }

  const config = loadConfig()
  if (!config) {
    logger.error('[Lofter解析] 配置加载失败，跳过每日推送')
    return
  }

  for (const sub of subscriptions) {
    try {
      const apiData = await fetchTagPageByAPI(sub.tagName, sub.sort, 0, config)
      const { items } = parseAPIResponse(apiData, sub.tagName, sub.sort)

      if (!items || items.length === 0) {
        const group = Bot.pickGroup(sub.groupId)
        await group.sendMsg(`今日标签 [${sub.tagName}] 下暂无博文`)
        continue
      }

      const randomItem = items[Math.floor(Math.random() * items.length)]
      const url = randomItem.permalink

      if (!url) {
        logger.debug?.(`[Lofter解析] 标签 [${sub.tagName}] 随机博文缺少 permalink，跳过`)
        continue
      }

      const group = Bot.pickGroup(sub.groupId)
      const fakeE = {
        reply: async (msg) => group.sendMsg(msg),
        isGroup: true,
        group_id: sub.groupId,
        group,
        bot: Bot
      }

      await executeParsePipeline(fakeE, {
        url,
        config,
        recordParse: () => ({ today: 0, group: 0 }),
        onDeveloperMode: async () => {}
      })
    } catch (err) {
      const { category, hint } = categorizeError(err)
      logger.error(`[Lofter解析] 群 ${sub.groupId} 标签 [${sub.tagName}] 每日推送失败 [${category}]: ${err.message}`)
    }
  }
}
