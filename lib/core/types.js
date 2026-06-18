/**
 * @module lib/types
 * @description 集中类型定义模块，统一管理所有 JSDoc typedef
 */

/**
 * @typedef {object} ImageLink
 * @property {string} [orign]  原图 URL（首选）
 * @property {string} [raw]    原图 URL（备选）
 */

/**
 * @typedef {object} BloggerInfo
 * @property {string} nickname  博主昵称
 * @property {string} blogName  博客名（子域名前缀）
 * @property {string} blogId    博主 ID
 * @property {string} avatarUrl 头像 URL
 */

/**
 * @typedef {object} PostInfo
 * @property {string}        title        博文标题
 * @property {number}        publishTime  发布时间戳（毫秒）
 * @property {string}        postId       博文 ID
 * @property {string}        url          博文原始链接
 * @property {string}        digest       正文（HTML 原文）
 * @property {boolean}       hasImages    是否为图文博文
 * @property {ImageLink[]}   photoLinks   图片链接对象列表
 * @property {string[]}      tagList      标签列表
 */

/**
 * @typedef {object} InteractionInfo
 * @property {number} responseCount   回复数
 * @property {number} favoriteCount   点赞数
 * @property {number} shareCount      推荐数
 * @property {number} subscribeCount  收藏数
 * @property {number} hotCount        热度
 */

/**
 * @typedef {object} CollectionPostItem
 * @property {number|string} postId      博文 ID
 * @property {string}        title       博文标题
 * @property {number}        publishTime 发布时间戳
 */

/**
 * @typedef {object} CollectionInfo
 * @property {number}        id           合集 ID
 * @property {string}        name         合集名称
 * @property {string}        description  合集描述
 * @property {number}        postCount    合集总篇数
 * @property {number|null}   currentIndex 当前博文在合集中的序号（从 1 开始）
 * @property {CollectionPostItem[]} posts 合集中的博文列表
 */

/**
 * @typedef {object} PostExtracted
 * @property {BloggerInfo}     blogger      博主信息
 * @property {PostInfo}        post         博文信息
 * @property {InteractionInfo} interaction  互动数据
 * @property {CollectionInfo|null} collection 合集信息（可能为空）
 */

/**
 * @typedef {object} LofterConfig
 * @property {boolean} [autoParse]                     自动解析开关
 * @property {boolean} [smartIndent]                   智能首行缩进
 * @property {'forward'|'normal'} [sendMode]           发送模式
 * @property {'single'|'multi'|'image'} [pureTextSendMode]  纯文发送模式
 * @property {number} [timeout]                        请求超时（秒）
 * @property {boolean} [lofterLoginEnabled]            启用 Lofter 登录认证
 * @property {string}  [lofterLoginKey]                Lofter 登录 Cookie Key
 * @property {string}  [lofterLoginAuth]               Lofter 登录 Cookie 值
 * @property {boolean} [sendBloggerInfo]               发送博主信息
 * @property {boolean} [sendPostInfo]                  发送博文基础信息
 * @property {boolean} [sendTagLinks]                  发送标签链接
 * @property {boolean} [sendInteraction]               发送互动数据
 * @property {boolean} [sendPostTitle]                 发送正文标题
 * @property {boolean} [sendPostBody]                  发送正文
 * @property {boolean} [sendImages]                    发送图片本体
 * @property {boolean} [sendImageLinks]                发送原图链接
 * @property {boolean} [sendImageLimitTip]             发送图片大小限制全局提示
 * @property {boolean} [sendParseStats]                发送解析统计
 * @property {boolean} [tagLinks]                      旧配置：标签链接
 * @property {boolean} [sendOriginal]                  原图文件发送
 * @property {boolean} [sendFirstImage]                合并转发时单发首图
 * @property {boolean} [imageCountPrompt]              首图后数量提示
 * @property {boolean} [enableImageSizeLimit]          启用图片大小限制
 * @property {number}  [imageSizeLimit]                限制阈值（MB）
 * @property {boolean} [sendThumbnail]                 超限发送缩略图
 * @property {boolean} [enablePureTextImageFooterStats] 纯文图片页脚统计
 * @property {string}  [imageFont]                     图片模式字体
 * @property {string}  [imageBgColor]                  图片背景色
 * @property {string}  [imageFontColor]                正文字体色
 * @property {number}  [imageFontSize]                 正文字号
 * @property {number}  [imageLineHeight]               正文行高
 * @property {string}  [imageTitleColor]               标题颜色
 * @property {number}  [imageTitleSize]                标题字号
 * @property {number}  [imagePadding]                  内边距
 * @property {number}  [imageWidth]                    布局宽度
 * @property {number}  [imageDeviceScale]              渲染倍率
 * @property {number}  [imageTextLimit]                单图最大字数
 * @property {string}  [forwardTitle]                  合并转发标题
 * @property {string}  [forwardNickname]               合并转发昵称
 * @property {number}  [blogListPageSize]              博主主页列表数量
 * @property {number}  [tagListPageSize]               标签页列表数量
 * @property {number}  [listCacheTTL]                  列表缓存有效期（秒）
 * @property {boolean} [sendBlogInfo]                  发送博主主页信息
 * @property {boolean} [sendTagInfo]                    发送标签页信息
 * @property {'new'|'hot'} [tagDefaultSort]            标签默认排序
 * @property {boolean} [dailyImageEnabled]              每日一图功能开关
 * @property {string}  [dailyImagePushTime]              每日推送时间（HH:mm）
 * @property {number}  [dailyImageMaxSubscriptions]      最大订阅数量
 * @property {number}  [dailyImagePushInterval]          多标签推送间隔（分钟）
 */

/**
 * @typedef {object} BlogPageExtracted
 * @property {BlogPageBlogger} blogger - 博主信息
 * @property {BlogPagePost[]} postList - 博文列表
 * @property {number} offset - 下一页偏移量
 * @property {string} sourceUrl - 原始博主主页链接
 */

/**
 * @typedef {object} BlogPageBlogger
 * @property {string} nickname - 博主昵称
 * @property {string} blogName - 博客名
 * @property {string} blogId - 博主ID
 * @property {string} avatarUrl - 头像URL
 * @property {string} selfIntro - 个人简介
 * @property {boolean} imageProtected - 是否图片保护
 * @property {number} extraBits - 额外标志位
 * @property {boolean} isAuth - 是否认证
 * @property {number} publicPostCount - 公开博文数
 * @property {number} followerCount - 粉丝数
 */

/**
 * @typedef {object} BlogPagePost
 * @property {string} title - 博文标题
 * @property {string} type - 博文类型
 * @property {number} publishTime - 发布时间戳
 * @property {number} photoCount - 图片数量
 * @property {number} ccType - CC协议类型
 * @property {string} permalink - 永久链接
 * @property {string[]} tagList - 标签列表
 * @property {boolean} forbidShare - 是否禁止分享
 * @property {boolean} fansVipPost - 是否粉丝专属
 * @property {object} blogInfo - 博主信息
 * @property {string} blogInfo.blogName - 博客名
 * @property {object} postCountView - 互动数据
 * @property {number} postCountView.responseCount - 回复数
 * @property {number} postCountView.favoriteCount - 点赞数
 * @property {number} postCountView.shareCount - 推荐数
 * @property {number} postCountView.hotCount - 热度
 */

/**
 * @typedef {object} TagPageExtracted
 * @property {TagInfo} tag - 标签信息
 * @property {TagPagePost[]} items - 博文列表
 * @property {number} page - 当前页码
 * @property {number} offset - 下一页偏移量
 * @property {string} sort - 排序方式
 * @property {string} sourceUrl - 原始标签页链接
 */

/**
 * @typedef {object} TagInfo
 * @property {string} name - 标签名
 * @property {number} postCount - 帖子总数
 */

/**
 * @typedef {object} TagPagePost
 * @property {string} title - 博文标题
 * @property {string} digest - 博文摘要
 * @property {string} type - 博文类型
 * @property {string} blogNickName - 博主昵称
 * @property {number} publishTime - 发布时间戳
 * @property {number} photoCount - 图片数量
 * @property {number} ccType - CC协议类型
 * @property {string} permalink - 永久链接
 * @property {string[]} tagList - 标签列表
 * @property {boolean} forbidShare - 是否禁止分享
 * @property {boolean} fansVipPost - 是否粉丝专属
 * @property {object} blogInfo - 博主信息
 * @property {string} blogInfo.blogNickName - 博主昵称
 * @property {string} blogInfo.blogName - 博客名
 * @property {string} blogInfo.blogId - 博主ID
 * @property {boolean} blogInfo.imageProtected - 是否图片保护
 * @property {number} blogInfo.extraBits - 额外标志位
 * @property {boolean} blogInfo.isAuth - 是否认证
 * @property {object} postCountView - 互动数据
 * @property {number} postCountView.responseCount - 回复数
 * @property {number} postCountView.favoriteCount - 点赞数
 * @property {number} postCountView.shareCount - 推荐数
 * @property {number} postCountView.hotCount - 热度
 */

/**
 * @typedef {object} ListCacheValue
 * @property {'blog'|'tag'} type - 列表类型
 * @property {Array} items - 标准列表项数组
 * @property {object} pageState - 分页状态
 */

/**
 * @typedef {object} DailyImageSubscription
 * @property {string} groupId - 群号
 * @property {string} tagName - 标签名
 * @property {string} sort - 排序方式（new/hot/month/week/date/total）
 */
