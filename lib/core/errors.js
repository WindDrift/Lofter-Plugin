/**
 * @module lib/errors
 * @description 错误分类与自定义错误类，统一异常处理逻辑
 */

/**
 * 错误分类：将异常归类为可操作类别
 * @param {Error} err
 * @returns {{category: string, hint: string}}
 */
export function categorizeError(err) {
  const msg = String(err?.message || '')
  if (/fetchPage 失败|ENOTFOUND|ETIMEDOUT|ECONNRESET|超时|HTTP 5\d{2}/i.test(msg)) {
    return { category: 'network', hint: '网络请求失败，请稍后重试（已自动重试 2 次）。' }
  }
  if (/JSON 解析失败|未能在页面中找到解析数据|获取博文数据失败|获取博主主页数据失败|获取标签页数据失败/.test(msg)) {
    return { category: 'parse', hint: '页面结构已变更，请前往 github 提 issue。' }
  }
  if (/Puppeteer|Chromium/.test(msg)) {
    return { category: 'render', hint: 'Puppeteer 渲染失败，请确认 Chromium 已正确安装。' }
  }
  return { category: 'unknown', hint: 'Lofter 解析时发生未知错误。' }
}

/**
 * Lofter 插件基础错误类
 */
export class LofterError extends Error {
  /**
   * @param {string} message
   * @param {{category?: string, cause?: Error}} options
   */
  constructor(message, { category = 'unknown', cause } = {}) {
    super(message, { cause })
    this.name = 'LofterError'
    this.category = category
  }
}

/**
 * 网络错误
 */
export class NetworkError extends LofterError {
  constructor(message, { cause } = {}) {
    super(message, { category: 'network', cause })
    this.name = 'NetworkError'
  }
}

/**
 * 解析错误
 */
export class ParseError extends LofterError {
  constructor(message, { cause } = {}) {
    super(message, { category: 'parse', cause })
    this.name = 'ParseError'
  }
}

/**
 * 配置错误
 */
export class ConfigError extends LofterError {
  constructor(message, { cause } = {}) {
    super(message, { category: 'config', cause })
    this.name = 'ConfigError'
  }
}
