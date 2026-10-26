# 知识库自定义事件清单

更新：2026-09-28。当前代码共 **18 个显式自定义事件：原有 2 个 + KB 事件 16 个**。邮箱表单已接入现有 SendGrid 订阅接口，原预览提交事件已停用。

## 接入与统计口径

- 这些自定义事件均发送给现有 **Umami**，并未同步发送给 GA4。GA4 `G-WVH440CNZ3` 的现有接入保持不变；自动 pageview / enhanced measurement 事件不包含在本清单中。Twitter pixel 仅保留原初始化。
- 仅 `NEXT_PUBLIC_VERCEL_ENV === 'production'` 时启用。开发和预览环境不发送；Umami 未加载、被拦截或发送失败时，不影响按钮、表单或导航。不缓存补发。
- 新增事件入口为 `src/components/KnowledgeHub/analytics.ts`：逐事件参数白名单，舍弃未知字段；不读取邮箱，不传搜索原文、文章标题、目标完整 URL。搜索仅传长度区间。
- 新事件使用 Umami 自定义 payload 回调，页面上下文只保留当前 `pathname`（去 query/hash）、固定标题 `Knowledge Base`、空 referrer，以及 SDK 的 website/hostname/language/screen。接口依据：[Umami Tracker functions](https://docs.umami.is/docs/tracker-functions)。
- 上述清理只针对新增 `kb_*` 事件。**原有 GA/Umami 自动采集和两个旧事件未在本次改造中调整，不能据此认定所有历史埋点都已过滤 URL 查询参数。**
- 普通左键、触摸、键盘激活走相同 React 处理器；不专门捕获右键菜单或中键打开。一个链接可能同时触发通用 `link_click` 和一个业务 `kb_*` 事件，二者分析维度不同，不能相加当作点击人数。
- 埋点不更改 UI、文章旧地址、内容筛选、推荐排序或点赞／分享开关。两个邮箱表单复用原有 SendGrid 订阅服务和同一名单，详见 [订阅接入说明](./kb-newsletter-integration.md)。

## 全部事件

| 事件名                 | 状态 | 触发时机／覆盖位置                                                                                                               | 自定义参数                                                                                                                       |
| ---------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `link_click`           | 原有 | 全站 HTTP(S) 锚点点击（包括站内锚点解析为 HTTP(S) 后的点击）                                                                     | `destination_category`: internal / documentation / community / source_repository / other                                         |
| `scroll_depth`         | 原有 | 整页滚动达到 25 / 50 / 75 / 90 / 100%，每个 `router.asPath` 生命周期各一次                                                       | `percent_scrolled`, `page_path`, `page_title`                                                                                    |
| `kb_cta_click`         | 新增 | Take the guide、See all articles、Browse all articles、Discover CKB、面包屑返回 KB                                               | `cta_id`, `placement`                                                                                                            |
| `kb_hub_click`         | 新增 | 首页 Hub 标题／文章数、Related hubs、文章侧栏 Hub 分类                                                                           | `hub_id`, `placement`                                                                                                            |
| `kb_subject_select`    | 新增 | Hub 页实际切换 Subject（含 View all）、文章侧栏 Subject 跳转                                                                     | `hub_id`, `subject_id`, `placement`                                                                                              |
| `kb_article_click`     | 新增 | 首页 Hub 精选、Recommended reading、搜索建议／结果、Start here 延伸阅读、Hub 文章列表、All articles、More from CKB、Recent posts | `article_id`, `placement`；有相应上下文时加 `hub_id`, `subject_id`, `step`                                                       |
| `kb_search_submit`     | 新增 | 首页搜索提交／View all results、搜索页表单提交；实时输入本身不触发                                                               | `placement`, `query_length_bucket`: empty / 1-10 / 11-30 / 31-plus（trim 后长度）                                                |
| `kb_layout_change`     | 新增 | Hub／All articles 列数实际变更，搜索页 Grid/List 实际切换；恢复本地偏好不触发                                                    | `placement`, `layout`: grid / list；列数变化另加 `columns`: 3 / 4 / 5                                                            |
| `kb_filter_open`       | 新增 | Hub／All articles 的 Filter 菜单从关闭变为打开（含键盘）；关闭和重渲染不触发                                                     | `placement`                                                                                                                      |
| `kb_pagination_click`  | 新增 | All articles／搜索结果的上一页或下一页                                                                                           | `placement`, `page`（目标页码）                                                                                                  |
| `kb_step_select`       | 新增 | Start here 的步骤导航点击；随滚动自动激活不触发                                                                                  | `step`: 1–4                                                                                                                      |
| `kb_toc_click`         | 新增 | 文章桌面目录点击或移动端目录选择；滚动高亮不触发                                                                                 | `article_id`, `section_index`（目录项序号，从 1 开始）, `placement`: desktop / mobile                                            |
| `kb_resource_click`    | 新增 | Build on CKB、Join the CKB Community、Become a CKBA Member、Write an article                                                     | `resource_id`, `placement`                                                                                                       |
| `kb_footer_link_click` | 新增 | 页脚 24 个导航链接（含可点击栏目标题）                                                                                           | `group`, `link_id`（固定标签的小写下划线 ID，栏目标题加 `_heading`）                                                             |
| `kb_social_click`      | 新增 | 页脚 7 个社交图标点击                                                                                                            | `network`: twitter / discord / telegram / linkedin / reddit / youtube / talk；`placement`: footer                                |
| `kb_newsletter_submit` | 新增 | 两个邮箱表单校验通过、实际调用既有 `newsLetter.signup` 前；请求中重复点击不触发                                                  | `placement`: signal / footer；不包含邮箱                                                                                         |
| `kb_newsletter_result` | 新增 | 实际订阅请求返回或失败                                                                                                           | `placement`: signal / footer；`outcome`: accepted / error；accepted 仅表示 SendGrid 已受理异步导入，不代表邮件送达或最终订阅状态 |
| `kb_back_to_top`       | 新增 | 真实文章页返回顶部链接点击                                                                                                       | `article_id`                                                                                                                     |

旧 `scroll_depth` 包括首屏高度，针对整个文档而非文章正文；目录 hash 变化可能重置旧事件档位。不能把 100% 直接当作全文阅读完成。

已停用的 `kb_newsletter_submit_preview` 只代表旧版本的本地预览点击；不要将其历史数据与真实订阅请求合并。客户端校验失败不发送订阅事件；服务端校验或服务错误归为 `error`，不上传具体错误、邮箱或名字。

## 来源参数对照

### 文章点击 `placement`

| 值                       | 对应模块                 | 附加上下文                                  |
| ------------------------ | ------------------------ | ------------------------------------------- |
| `hub_featured`           | 首页 6 个 Hub 内精选文章 | `hub_id`                                    |
| `recommended_reading`    | 首页 Recommended reading | —                                           |
| `home_search_suggestion` | 首页实时搜索建议         | —                                           |
| `search_results`         | 搜索结果页文章           | —                                           |
| `start_here_reading`     | Start here / Go deeper   | `step`                                      |
| `topic_articles`         | Hub / Subject 下文章     | `hub_id`, `subject_id`（View all 为 `all`） |
| `archive_articles`       | All articles             | —                                           |
| `more_from_ckb`          | 正文下 More from CKB     | —                                           |
| `recent_posts`           | 文章侧栏 Recent posts    | —                                           |

`article_id` 是内容仓库现有稳定 ID。`hub_id`、`subject_id` 是分类目录 ID，不改变文章地址。

### 其他来源

- CTA：`start_here` / `home_hero`；`all_articles` / `home_recommended` 或 `search`；`discover_ckb` / `article_sidebar_banner` 或 `article_bottom_banner`；`kb_home` / `breadcrumb`。
- Hub：`home_hub_heading`、`home_hub_count`、`related_hubs`、`article_categories`。
- Subject：`topic`、`article_categories`。
- 搜索：`home_search`、`home_all_search_results`、`search`。
- 列表控件／分页：`topic`、`archive`、`search`（只在存在对应控件的页面触发）。
- 资源：`developer_docs`、`community`、`ckba_membership` 对应 `signal_resources`；`write_article` 对应 `article_nav`。

## 如何用于内容分析

- 对 `kb_article_click` 按 `placement` 和 `article_id` 聚合，可以分别比较 Start here、Hub 精选、Recommended reading、More from CKB 的点击量。
- 点击量不是收藏数，也不是点击率：当前没有启用真正的收藏／点赞功能，没有卡片曝光分母，不能称为收藏排行榜或 CTR。
- 订阅可按 `kb_newsletter_submit` 和 `kb_newsletter_result` 的 `accepted` / `error` 分析请求漏斗。`accepted` 不等于已确认订阅、发信或送达；SendGrid 最终导入结果、退订及投递状态仍需后台核对。没有分享成功、收藏、下载、搜索成功或搜索无结果事件。
- 首页此区域已使用 2025-09-28 至 2026-09-27 的 GA4 Views 快照，标题按用户确认的设计文案显示 Most read this year（数据仍为近 12 个月，不是自然年累计）；按文章归并历史路径和语言版本后排序。为保持统计连续性，`recommended_reading`、`home_recommended` placement 不改名。详见 `kb-most-read.md`，当前不自动刷新榜单。

## 验证

本地单元测试使用隔离的 SDK、tRPC 和 SendGrid mock，覆盖环境开关、参数白名单、URL 上下文清理、失败隔离、文章卡片两种布局、步骤链接、页脚导航／社交／邮箱、Subject 切换、布局变化、Filter 打开、搜索提交和翻页。订阅测试还覆盖邮箱校验、姓名省略兼容、并发点击、成功受理、失败和超时；未向生产统计库注入测试事件，也未创建真实订阅。

```sh
node --test src/components/KnowledgeHub/*.test.cjs src/components/KnowledgeHub/*.test.mjs
node --test src/server/api/routers/newsletter.test.mjs
```

上线后还需在 Umami 后台用真实交互核对事件名称、参数及数量。SDK 被拦截时会漏报；本地通过不等于后台已经收到事件。
