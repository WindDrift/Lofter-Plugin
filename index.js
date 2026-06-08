/**
 * @module index
 * @description Lofter-Plugin 插件入口
 *
 * 扫描 apps/ 目录下的所有 .js 模块文件，异步导入并注册为云崽插件。
 * 加载失败的模块会被记录到日志中并跳过，不影响其他模块的正常运行。
 *
 * 智能识别插件类（防御性）：
 *  - 优先找 extends plugin 的类（最常见）
 *  - 退回找原型链上带 plugin 的类
 *  - 最后退化到第一个导出（向后兼容）
 */

import fs from 'node:fs'

// 扫描 apps 目录下所有 .js 文件
const files = fs.readdirSync('./plugins/Lofter-Plugin/apps').filter(file => file.endsWith('.js'))

// 异步导入所有模块
let ret = files.map(file => import(`./apps/${file}`))
ret = await Promise.allSettled(ret)

/**
 * 从模块导出中智能识别插件类
 * @param {object} mod 模块命名空间
 * @returns {Function|null} 插件类 / 构造函数，找不到则 null
 */
function pickPluginClass(mod) {
  if (!mod || typeof mod !== 'object') return null
  const candidates = Object.values(mod)
  // 优先级 1：原型链上明确有 plugin 的类
  for (const c of candidates) {
    if (typeof c === 'function' && c.prototype && isSubclassOf(c, 'plugin')) return c
  }
  // 优先级 2：原型链上含 pluginBase / 任何 plugin* 的类
  for (const c of candidates) {
    if (typeof c === 'function' && c.prototype) {
      const protoChain = getProtoChain(c.prototype)
      if (protoChain.some(p => typeof p?.constructor?.name === 'string' && p.constructor.name.toLowerCase().includes('plugin'))) {
        return c
      }
    }
  }
  // 优先级 3：带构造函数的导出
  for (const c of candidates) {
    if (typeof c === 'function' && /^class\s/.test(Function.prototype.toString.call(c))) {
      return c
    }
  }
  // 优先级 4：退化到第一个非对象的导出（向后兼容旧版）
  for (const c of candidates) {
    if (typeof c === 'function') return c
  }
  return null
}

/**
 * 判断类是否继承自指定父类（按类名匹配）
 * @param {Function} cls
 * @param {string} ancestorName
 * @returns {boolean}
 */
function isSubclassOf(cls, ancestorName) {
  let proto = cls.prototype
  while (proto && proto !== Object.prototype) {
    if (proto.constructor?.name === ancestorName) return true
    proto = Object.getPrototypeOf(proto)
  }
  return false
}

/**
 * 收集原型链上所有节点
 * @param {object} proto
 * @returns {object[]}
 */
function getProtoChain(proto) {
  const chain = []
  let p = proto
  while (p && p !== Object.prototype) {
    chain.push(p)
    p = Object.getPrototypeOf(p)
  }
  return chain
}

// 提取成功加载的模块，记录失败信息
let apps = {}
for (let i in files) {
  const name = files[i].replace('.js', '')

  if (ret[i].status !== 'fulfilled') {
    logger.error(`[Lofter解析] 载入插件错误：${name}`)
    logger.error(ret[i].reason)
    continue
  }

  // 智能识别插件类
  const PluginClass = pickPluginClass(ret[i].value)
  if (!PluginClass) {
    logger.error(`[Lofter解析] 未能在 ${name} 中找到可用的插件类，跳过`)
    continue
  }

  // 记录实际使用的导出（便于排查）
  const exportsList = Object.keys(ret[i].value).join(', ')
  logger.debug?.(`[Lofter解析] ${name} 识别到插件类: ${PluginClass.name}（模块导出: ${exportsList}）`)

  apps[name] = PluginClass
}

const loadedNames = Object.keys(apps).join(', ') || '(空)'
logger.mark(`[Lofter解析] 插件已就绪：${loadedNames}`)

export { apps }
