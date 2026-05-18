/**
 * @module guoba/index
 * @description 锅巴插件（Guoba-Plugin）支持入口
 *
 * 整合并导出对锅巴插件系统的支持机制，
 * 向锅巴面板暴露本插件的元信息以及对应的配置界面结构。
 */

import pluginInfo from './pluginInfo.js'
import configInfo from './configInfo.js'

/**
 * 向锅巴面板提供本插件的完整支持信息
 * @returns {object} 包含 pluginInfo 和 configInfo 的对象
 */
export function supportGuoba() {
  return {
    pluginInfo,
    configInfo
  }
}
