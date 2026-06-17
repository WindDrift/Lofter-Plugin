/**
 * @module lib/dailyImage/subscription
 * @description 每日图片订阅管理模块（支持每群多标签）
 *
 * 职责：
 *  - 管理群订阅数据的增删查改
 *  - 持久化到 JSON 文件，内存缓存加速读取
 *  - 每个群可订阅多个标签
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const DATA_FILE = path.join(process.cwd(), 'plugins', 'Lofter-Plugin', 'data', 'daily_image_subscriptions.json')

let cachedSubscriptions = null

/**
 * 从 JSON 文件加载订阅数据，首次读取后缓存到内存
 * @returns {Promise<Array<{groupId: string, tags: Array<{tagName: string, sort: string}>}>>} 订阅数组
 */
export async function loadSubscriptions() {
  if (cachedSubscriptions !== null) {
    return cachedSubscriptions
  }
  try {
    const content = await fsp.readFile(DATA_FILE, 'utf-8')
    cachedSubscriptions = JSON.parse(content)
    // 兼容旧格式：迁移 {groupId, tagName, sort} 到新格式
    cachedSubscriptions = migrateOldFormat(cachedSubscriptions)
    logger.debug?.(`[Lofter解析] 订阅数据已从文件加载，共 ${cachedSubscriptions.length} 个群`)
  } catch (err) {
    if (err.code === 'ENOENT') {
      cachedSubscriptions = []
      logger.debug?.('[Lofter解析] 订阅文件不存在，初始化为空数组')
    } else {
      logger.error('[Lofter解析] 读取订阅文件失败', err)
      cachedSubscriptions = []
    }
  }
  return cachedSubscriptions
}

/**
 * 迁移旧格式数据到新格式
 * @param {Array} data - 原始数据
 * @returns {Array} 新格式数据
 */
function migrateOldFormat(data) {
  if (!Array.isArray(data)) return []
  return data.map(item => {
    // 旧格式：{groupId, tagName, sort}
    if (item.tagName && !item.tags) {
      return {
        groupId: item.groupId,
        tags: [{ tagName: item.tagName, sort: item.sort || 'new' }]
      }
    }
    // 新格式：{groupId, tags: [...]}
    return item
  })
}

/**
 * 将订阅数据持久化到 JSON 文件，并同步更新内存缓存
 * @param {Array<{groupId: string, tags: Array<{tagName: string, sort: string}>}>} subscriptions - 订阅数组
 */
export async function saveSubscriptions(subscriptions) {
  const dir = path.dirname(DATA_FILE)
  await fsp.mkdir(dir, { recursive: true })
  await fsp.writeFile(DATA_FILE, JSON.stringify(subscriptions, null, 2), 'utf-8')
  cachedSubscriptions = subscriptions
  const totalTags = subscriptions.reduce((sum, s) => sum + (s.tags?.length || 0), 0)
  logger.debug?.(`[Lofter解析] 订阅数据已保存，共 ${subscriptions.length} 个群，${totalTags} 个标签`)
}

/**
 * 添加标签到群订阅
 * @param {string} groupId - 群号
 * @param {string} tagName - 标签名
 * @param {string} sort - 排序方式
 * @param {number} maxSubscriptions - 最大订阅数上限（按群计算）
 * @returns {Promise<{success: boolean, isNew?: boolean, reason?: string}>}
 */
export async function addSubscription(groupId, tagName, sort, maxSubscriptions) {
  const subscriptions = await loadSubscriptions()
  const existing = subscriptions.find(s => s.groupId === groupId)

  if (existing) {
    // 检查是否已订阅该标签
    const tagExists = existing.tags.find(t => t.tagName === tagName)
    if (tagExists) {
      // 更新排序方式
      tagExists.sort = sort
      await saveSubscriptions(subscriptions)
      return { success: true, isNew: false }
    }
    // 新增标签到已有群
    existing.tags.push({ tagName, sort })
    await saveSubscriptions(subscriptions)
    return { success: true, isNew: true }
  }

  // 新群订阅
  if (maxSubscriptions > 0 && subscriptions.length >= maxSubscriptions) {
    return { success: false, reason: 'limit' }
  }

  subscriptions.push({ groupId, tags: [{ tagName, sort }] })
  await saveSubscriptions(subscriptions)
  return { success: true, isNew: true }
}

/**
 * 移除群订阅的指定标签
 * @param {string} groupId - 群号
 * @param {string} [tagName] - 标签名，不传则移除该群所有订阅
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
export async function removeSubscription(groupId, tagName) {
  const subscriptions = await loadSubscriptions()
  const index = subscriptions.findIndex(s => s.groupId === groupId)

  if (index === -1) {
    return { success: false, reason: 'not_found' }
  }

  if (tagName) {
    // 移除指定标签
    const groupSub = subscriptions[index]
    const tagIndex = groupSub.tags.findIndex(t => t.tagName === tagName)
    if (tagIndex === -1) {
      return { success: false, reason: 'tag_not_found' }
    }
    groupSub.tags.splice(tagIndex, 1)
    // 如果群没有标签了，移除整个群订阅
    if (groupSub.tags.length === 0) {
      subscriptions.splice(index, 1)
    }
  } else {
    // 移除整个群订阅
    subscriptions.splice(index, 1)
  }

  await saveSubscriptions(subscriptions)
  return { success: true }
}

/**
 * 获取指定群的订阅信息
 * @param {string} groupId - 群号
 * @returns {Promise<{groupId: string, tags: Array<{tagName: string, sort: string}>}|null>}
 */
export async function getSubscription(groupId) {
  const subscriptions = await loadSubscriptions()
  return subscriptions.find(s => s.groupId === groupId) || null
}

/**
 * 获取所有订阅
 * @returns {Promise<Array<{groupId: string, tags: Array<{tagName: string, sort: string}>}>>}
 */
export async function getAllSubscriptions() {
  return loadSubscriptions()
}
