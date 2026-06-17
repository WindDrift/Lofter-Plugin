/**
 * @module guoba/schemas/index
 * @description 锅巴面板 Schema 与配置读写统一导出
 *
 * 增强点（F-10）：
 *  - 收集 schema 中实际声明的字段名，作为权威白名单
 *  - 写入时仅接受白名单内字段，过滤掉未知/遗留字段
 *  - 同时兼容扁平化 `lofter.xxx` 与嵌套 `data.lofter` 两种形态
 */

import lofter from './lofter.js'
import Config from '../../components/Config.js'

const config = Config.getInstance()

/** 解析 schema field="lofter.xxx" 得到配置项短名集合 */
const LOFTER_FIELD_KEYS = new Set()
for (const item of lofter) {
  if (item.field && item.field.startsWith('lofter.')) {
    LOFTER_FIELD_KEYS.add(item.field.replace('lofter.', ''))
  }
}

/** 配置项的具体结构描述（表单组件模型） */
export const schemas = [...lofter]

/**
 * 获取当前配置数据
 * @returns {object}
 */
export function getConfigData() {
  return {
    lofter: config.getDefSet('lofter')
  }
}

/**
 * 提取并校验 lofter 配置
 * @param {object} data
 * @returns {object|null}
 */
function extractLofterConfig(data) {
  if (!data || typeof data !== 'object') return null

  // 形态 1：嵌套结构 { lofter: {...} }
  if (data.lofter && typeof data.lofter === 'object') {
    return filterBySchema(data.lofter)
  }

  // 形态 2：扁平化结构 { 'lofter.autoParse': true, ... }
  const lofterConfig = {}
  let hasKey = false
  for (const key of Object.keys(data)) {
    if (key.startsWith('lofter.')) {
      const shortKey = key.replace('lofter.', '')
      if (LOFTER_FIELD_KEYS.has(shortKey)) {
        lofterConfig[shortKey] = data[key]
        hasKey = true
      }
    }
  }
  if (hasKey) return lofterConfig

  // 形态 3：data 本身就是 lofter 配置（且至少含一个 schema 字段）
  for (const k of Object.keys(data)) {
    if (LOFTER_FIELD_KEYS.has(k)) {
      return filterBySchema(data)
    }
  }
  return null
}

/**
 * 基于 schema 白名单过滤配置对象
 * @param {object} obj
 * @returns {object}
 */
function filterBySchema(obj) {
  const out = {}
  for (const k of Object.keys(obj)) {
    if (LOFTER_FIELD_KEYS.has(k)) {
      out[k] = obj[k]
    }
  }
  return out
}

/**
 * 保存用户通过锅巴面板修改的配置数据
 * @param {object} data
 * @param {object} context
 * @returns {Promise<object>}
 */
export async function setConfigData(data, { Result }) {
  const lofterConfig = extractLofterConfig(data)
  if (!lofterConfig || Object.keys(lofterConfig).length === 0) {
    return Result.error('未发现合法的 Lofter 配置项，请确认表单已填写或锅巴版本兼容。')
  }
  const ok = await config.set('lofter', lofterConfig)
  return ok ? Result.ok({}, '保存成功~') : Result.error('保存失败，请查看控制台日志。')
}
