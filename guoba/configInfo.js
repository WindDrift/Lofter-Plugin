/**
 * @module guoba/configInfo
 * @description 锅巴面板配置信息导出
 *
 * 导出本插件在锅巴面板中对应的表单结构定义及读写配置的存取方法。
 */

import { schemas, getConfigData, setConfigData } from './schemas/index.js'

export default {
  /** 配置项的具体结构描述（表单组件模型） */
  schemas,
  /** 获取当前配置的回调 */
  getConfigData,
  /** 保存用户配置的回调 */
  setConfigData
}
