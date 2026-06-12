/**
 * @module lib/configLoader
 * @description 统一配置加载模块，消除 lofter.js 中重复的配置加载逻辑
 *
 * 职责：
 *  - 防御性加载 Config 单例
 *  - 从 fields.js 生成默认值并合并用户配置（normalizeConfig）
 *  - fields.js 为唯一默认值来源
 */

import Config from '../../components/Config.js'
import { buildDefaultLofterConfig } from '../../config/fields.js'

/**
 * 防御性加载配置：优先单例，失败时回退到 new Config()
 * @returns {object|null} 配置对象，加载异常时返回 null
 */
export function loadConfig() {
  let config
  try {
    const ConfigClass = Config
    if (typeof ConfigClass.getInstance === 'function') {
      config = ConfigClass.getInstance().getDefSet('lofter')
    } else {
      config = new ConfigClass().getDefSet('lofter')
    }
  } catch (cfgErr) {
    logger.error('[Lofter解析] 配置加载失败，使用空配置继续', cfgErr)
    config = {}
  }
  if (!config || typeof config !== 'object') {
    logger.error('[Lofter解析] 配置加载结果异常')
    return null
  }
  return normalizeConfig(config)
}

/**
 * 规范化配置：以 fields.js 注册表生成的默认值为底，用用户配置覆盖
 * 确保所有配置项都有有效值，消除默认值三源问题
 * @param {object} rawConfig - 从 Config 模块读取的原始配置
 * @returns {object} 规范化后的配置对象
 */
export function normalizeConfig(rawConfig) {
  const defaults = buildDefaultLofterConfig()
  return {
    ...defaults,
    ...rawConfig,
    // 以下字段需要特殊兼容逻辑
    sendTagLinks: rawConfig.sendTagLinks ?? rawConfig.tagLinks ?? defaults.sendTagLinks
  }
}
