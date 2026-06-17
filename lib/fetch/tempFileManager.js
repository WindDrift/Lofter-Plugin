/**
 * @module lib/fetch/tempFileManager
 * @description 临时文件管理模块，负责清理图片下载产生的临时文件
 *
 * 从 fetcher.js 拆分而来，将临时文件清理职责独立为单一模块。
 * 依赖方向：叶子模块，不依赖其他 fetch 子模块。
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

/**
 * 异步删除指定临时目录下以指定前缀开头的所有文件
 * @param {string} tempDir - 临时目录路径
 * @param {string} prefix - 文件名前缀
 * @returns {Promise<number>} 成功删除的文件数
 */
export async function cleanupTempFiles(tempDir, prefix) {
  try {
    if (!fs.existsSync(tempDir)) return 0
    const files = await fsp.readdir(tempDir)
    const targets = files.filter((f) => f.startsWith(prefix))
    await Promise.all(
      targets.map((f) =>
        fsp.unlink(path.join(tempDir, f)).catch((err) => {
          logger.debug?.(`[Lofter解析] 删除临时文件失败: ${f}`, err)
        })
      )
    )
    return targets.length
  } catch (err) {
    logger.debug?.(`[Lofter解析] cleanupTempFiles 失败: ${tempDir}`, err)
    return 0
  }
}

/**
 * 异步删除单个临时文件
 * @param {string} filePath - 待删除的文件完整路径
 * @returns {Promise<boolean>} 是否成功
 */
export async function cleanupFile(filePath) {
  try {
    await fsp.unlink(filePath)
    return true
  } catch (err) {
    // ENOENT 表示文件不存在，属于正常情况（可能已被清理），不记录日志
    if (err?.code !== 'ENOENT') {
      logger.debug?.(`[Lofter解析] cleanupFile 失败: ${filePath}`, err)
    }
    return false
  }
}
