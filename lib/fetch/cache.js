/**
 * @module lib/cache
 * @description 通用 TTL 内存缓存，统一 fetcher.js HTML缓存与 listCache.js 的同构实现
 */

/**
 * 通用 TTL 内存缓存类
 * 基于 Map + expireAt 实现，超过阈值时自动清理过期项
 */
export class TtlCache {
  /**
   * @param {object} options
   * @param {number} [options.maxSize=200] - 缓存条目上限，超过时触发过期清理
   * @param {number} [options.defaultTtl=300] - 默认 TTL（秒）
   */
  constructor({ maxSize = 200, defaultTtl = 300 } = {}) {
    this._map = new Map()
    this._maxSize = maxSize
    this._defaultTtlMs = defaultTtl * 1000
  }

  /**
   * 获取缓存值，过期时自动删除并返回 null
   * @param {string} key
   * @returns {*} 缓存值，不存在或过期时返回 null
   */
  get(key) {
    const entry = this._map.get(key)
    if (!entry) return null
    if (Date.now() > entry.expireAt) {
      this._map.delete(key)
      return null
    }
    return entry.value
  }

  /**
   * 写入缓存
   * @param {string} key
   * @param {*} value
   * @param {number} [ttlSeconds] - TTL（秒），不传则使用构造时的 defaultTtl
   */
  set(key, value, ttlSeconds) {
    const ttlMs = ttlSeconds !== undefined ? ttlSeconds * 1000 : this._defaultTtlMs
    this._map.set(key, { value, expireAt: Date.now() + ttlMs })
    // 超过阈值时清理过期项
    if (this._map.size > this._maxSize) {
      this.cleanup()
    }
  }

  /**
   * 删除指定缓存项
   * @param {string} key
   * @returns {boolean} 是否成功删除
   */
  delete(key) {
    return this._map.delete(key)
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this._map.clear()
  }

  /**
   * 清理所有过期项
   * @returns {number} 清理的条目数
   */
  cleanup() {
    const now = Date.now()
    let count = 0
    for (const [key, entry] of this._map) {
      if (now > entry.expireAt) {
        this._map.delete(key)
        count++
      }
    }
    return count
  }

  /**
   * 当前缓存条目数
   * @type {number}
   */
  get size() {
    return this._map.size
  }
}
