
import lofter from './lofter.js'
import Config from '../../components/Config.js'

const config = new Config()

export const schemas = [
  ...lofter
]

export function getConfigData () {
  return {
    lofter: config.getDefSet('lofter')
  }
}

export function setConfigData (data, { Result }) {
  let lofterConfig = data.lofter

  // 兼容性处理方案：如果锅巴回传的数据中未能找到规范的 data.lofter 嵌套结构，
  // 则尝试去遍历匹配并还原出扁平化的属性结构，赋值给 lofterConfig
  if (!lofterConfig) {
    lofterConfig = {}
    let hasConfig = false
    for (const key in data) {
      if (key.startsWith('lofter.')) {
        lofterConfig[key.replace('lofter.', '')] = data[key]
        hasConfig = true
      }
    }
    
    // 如果经过上面的遍历依然没有找到相关配置，则继续检查传入的 data 本体是否就是我们需要的配置项（即直接抛弃了前缀的纯净配置）
    if (!hasConfig && data.autoParse !== undefined) {
      lofterConfig = data
    }
  }
  
  config.set('lofter', lofterConfig)
  
  return Result.ok({}, '保存成功~')
}
