/**
 * @module lib/dailyImage/scheduler
 * @description 基于 setTimeout 的每日定时调度器，支持多标签间隔推送
 */

import { fetchTagPageByAPI } from '../fetch/fetcher.js'
import { parseAPIResponse } from '../parse/tagParser.js'
import { executeParsePipeline } from '../message/pipeline.js'
import { loadConfig } from '../core/configLoader.js'
import { getAllSubscriptions } from './subscription.js'
import { categorizeError } from '../core/errors.js'
import { sleep } from '../core/utils.js'

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
 * 执行单个标签的推送
 * @param {string} groupId - 群号
 * @param {string} tagName - 标签名
 * @param {string} sort - 排序方式
 * @param {object} config - 配置对象
 */
async function pushSingleTag(groupId, tagName, sort, config) {
  const apiData = await fetchTagPageByAPI(tagName, sort, 0, config)
  const { items } = parseAPIResponse(apiData, tagName, sort)

  if (!items || items.length === 0) {
    const group = Bot.pickGroup(groupId)
    await group.sendMsg(`今日标签 [${tagName}] 下暂无博文`)
    return
  }

  const randomItem = items[Math.floor(Math.random() * items.length)]
  const url = randomItem.permalink

  if (!url) {
    logger.debug?.(`[Lofter解析] 标签 [${tagName}] 随机博文缺少 permalink，跳过`)
    return
  }

  const group = Bot.pickGroup(groupId)
  const fakeE = {
    reply: async (msg) => group.sendMsg(msg),
    isGroup: true,
    group_id: groupId,
    group,
    bot: Bot
  }

  await executeParsePipeline(fakeE, {
    url,
    config,
    recordParse: () => ({ today: 0, group: 0 }),
    onDeveloperMode: async () => {}
  })
}

/**
 * 执行每日推送：遍历所有订阅，支持多标签间隔推送
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

  const pushInterval = (config.dailyImagePushInterval || 3) * 60 * 1000

  for (const sub of subscriptions) {
    if (!sub.tags || sub.tags.length === 0) continue

    for (let i = 0; i < sub.tags.length; i++) {
      const tag = sub.tags[i]
      try {
        await pushSingleTag(sub.groupId, tag.tagName, tag.sort, config)
      } catch (err) {
        const { category } = categorizeError(err)
        logger.error(`[Lofter解析] 群 ${sub.groupId} 标签 [${tag.tagName}] 每日推送失败 [${category}]: ${err.message}`)
      }

      // 多标签间隔推送
      if (i < sub.tags.length - 1) {
        logger.debug?.(`[Lofter解析] 群 ${sub.groupId} 等待 ${config.dailyImagePushInterval || 3} 分钟后推送下一个标签`)
        await sleep(pushInterval)
      }
    }
  }
}
