/**
 * @module lib/listCache
 * @description 列表缓存模块，基于 TtlCache 实现按群/私聊维度的列表数据缓存
 */

import { TtlCache } from './cache.js'

/** @typedef {import('../core/types.js').ListCacheValue} ListCacheValue */

/** 列表缓存实例：上限 100 条，默认 TTL 600 秒 */
const listCache = new TtlCache({ maxSize: 100, defaultTtl: 600 })

/**
 * 生成列表缓存键
 * @param {object} e - 云崽消息事件对象
 * @returns {string} 缓存键（格式：group:xxx 或 private:xxx）
 */
export function getListCacheKey(e) {
  if (e.isGroup) {
    return `group:${e.group_id || e.group?.group_id || e.group?.id || 'unknown'}`
  }
  return `private:${e.user_id || e.user?.user_id || 'unknown'}`
}

/**
 * 写入列表缓存
 * @param {object} e - 云崽消息事件对象
 * @param {ListCacheValue} value - 缓存值
 * @param {number} [ttl=600] - 缓存有效期（秒）
 */
export function setListCache(e, value, ttl = 600) {
  const key = getListCacheKey(e)
  listCache.set(key, value, ttl)
}

/**
 * 读取列表缓存
 * @param {object} e - 云崽消息事件对象
 * @returns {ListCacheValue|null} 缓存值，不存在或过期时返回 null
 */
export function getListCache(e) {
  const key = getListCacheKey(e)
  return listCache.get(key)
}

/**
 * 清理所有过期缓存项
 * @returns {number} 清理的条目数
 */
export function clearExpiredListCache() {
  return listCache.cleanup()
}
