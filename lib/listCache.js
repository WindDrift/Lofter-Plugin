/**
 * @module lib/listCache
 * @description 列表缓存模块，为 #lofter解析 序号 提供短期列表上下文缓存
 */

/** 缓存清理阈值：超过此数量时触发过期清理 */
const CACHE_CLEANUP_THRESHOLD = 100

/** 模块级缓存：Map<cacheKey, { value, expireAt }> */
const listCache = new Map()

/**
 * 获取缓存 key
 * @param {object} e - 消息事件对象
 * @returns {string} 缓存 key
 */
export function getListCacheKey(e) {
  if (e.group_id) {
    return `group:${e.group_id}`
  }
  return `private:${e.user_id}`
}

/**
 * 设置列表缓存
 * @param {object} e - 消息事件对象
 * @param {object} value - 缓存值
 * @param {number} [ttlSeconds=600] - 缓存有效期（秒）
 */
export function setListCache(e, value, ttlSeconds = 600) {
  const key = getListCacheKey(e)
  const expireAt = Date.now() + ttlSeconds * 1000
  listCache.set(key, { value, expireAt })

  // 简易过期回收：缓存超过阈值时清理一次
  if (listCache.size > CACHE_CLEANUP_THRESHOLD) {
    clearExpiredListCache()
  }
}

/**
 * 获取列表缓存
 * @param {object} e - 消息事件对象
 * @returns {object|null} 缓存值，过期或不存在时返回 null
 */
export function getListCache(e) {
  const key = getListCacheKey(e)
  const entry = listCache.get(key)

  if (!entry) return null

  // 检查是否过期
  if (Date.now() > entry.expireAt) {
    listCache.delete(key)
    return null
  }

  return entry.value
}

/**
 * 清理过期的缓存项
 */
export function clearExpiredListCache() {
  const now = Date.now()
  for (const [key, entry] of listCache) {
    if (now > entry.expireAt) {
      listCache.delete(key)
    }
  }
}

/**
 * @typedef {object} ListCacheValue
 * @property {'blog'|'tag'} type - 列表类型
 * @property {Array} items - 标准列表项数组
 * @property {object} pageState - 分页状态
 */
