// 整合并导出对锅巴插件系统（Guoba Support）的支持机制
import pluginInfo from './pluginInfo.js'
import configInfo from './configInfo.js'

// 向锅巴（Guoba）面板暴露本插件的元信息以及对应的配置界面结构
export function supportGuoba () {
  return {
    pluginInfo,
    configInfo
  }
}
