/**
 * @module guoba/schemas/index
 * @description 锅巴面板 Schema 与配置读写统一导出
 *
 * 整合 lofter 配置的表单结构定义、配置读取与配置保存方法，
 * 供 guoba/configInfo.js 统一引用。
 */

import lofter from './lofter.js'
import Config from '../../components/Config.js'

const config = new Config()

/** 配置项表单结构定义 */
export const schemas = [
  ...lofter
]

/**
 * 获取当前配置数据
 * @returns {object} 包含 lofter 配置的对象
 */
export function getConfigData() {
  return {
    lofter: config.getDefSet('lofter')
  }
}

/**
 * 保存用户通过锅巴面板修改的配置数据
 *
 * 兼容性处理：锅巴回传的数据格式可能为嵌套结构（data.lofter）
 * 或扁平结构（data['lofter.autoParse']），此方法统一处理这两种情况。
 *
 * @param {object} data - 锅巴面板回传的配置数据
 * @param {object} context - 上下文对象
 * @param {object} context.Result - 锅巴提供的响应构造器
 * @returns {object} 操作结果
 */
export function setConfigData(data, { Result }) {
  let lofterConfig = data.lofter

  // 兼容扁平化结构：遍历匹配 lofter. 前缀的键
  if (!lofterConfig) {
    lofterConfig = {}
    let hasConfig = false
    for (const key in data) {
      if (key.startsWith('lofter.')) {
        lofterConfig[key.replace('lofter.', '')] = data[key]
        hasConfig = true
      }
    }

    // 如果仍未找到，检查 data 本体是否就是配置对象
    if (!hasConfig && data.autoParse !== undefined) {
      lofterConfig = data
    }
  }

  config.set('lofter', lofterConfig)

  return Result.ok({}, '保存成功~')
}
