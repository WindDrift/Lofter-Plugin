// 导出本插件在锅巴面板中对应的表单结构定义及读写配置的存取方法
import { schemas, getConfigData, setConfigData } from './schemas/index.js'

export default {
  schemas,       // 配置项的具体结构描述
  getConfigData, // 获取当前配置的回调
  setConfigData  // 保存用户配置的回调
}
