/**
 * @module index
 * @description Lofter-Plugin 插件入口
 *
 * 扫描 apps/ 目录下的所有 .js 模块文件，异步导入并注册为云崽插件。
 * 加载失败的模块会被记录到日志中并跳过，不影响其他模块的正常运行。
 */

import fs from 'node:fs'

// 扫描 apps 目录下所有 .js 文件
const files = fs.readdirSync('./plugins/Lofter-Plugin/apps').filter(file => file.endsWith('.js'))

// 异步导入所有模块
let ret = files.map(file => import(`./apps/${file}`))
ret = await Promise.allSettled(ret)

// 提取成功加载的模块，记录失败信息
let apps = {}
for (let i in files) {
  const name = files[i].replace('.js', '')

  if (ret[i].status !== 'fulfilled') {
    logger.error(`[Lofter解析] 载入插件错误：${name}`)
    logger.error(ret[i].reason)
    continue
  }

  // 取模块的第一个导出作为插件类
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}

logger.mark('[Lofter解析] 插件已就绪')

export { apps }
