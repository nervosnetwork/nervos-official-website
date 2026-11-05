# 知识库自定义事件清单

更新：2026-10-23（D-20）。**GA4 共 17 个自定义事件**，另有标准 `page_view`；原有 Umami 保留兼容上报及 `kb_newsletter_result` 诊断事件。代码和本地 mock 测试不代表 GA 管理后台已经配置或收到事件。

## 接入与环境

- `src/utils/ga.ts` 负责 GA4 初始化、页面浏览和公共上下文；`src/components/KnowledgeHub/analytics.ts` 使用逐事件白名单，将现有调用参数映射成下面的 GA4 参数。未知字段不会被原样展开到事件。
- 生产沿用 `G-WVH440CNZ3`，可通过 `NEXT_PUBLIC_GA_MEASUREMENT_ID` 显式配置。预览必须配置 `NEXT_PUBLIC_GA_PREVIEW_MEASUREMENT_ID`，并拒绝与正式 ID 相同；本地还需 `NEXT_PUBLIC_GA_DEBUG=true`。未配置时不加载 SDK、不请求额外搜索计数。预览事件带 `debug_mode: true`，生产不带。
- **预览 ID 必须属于独立测试属性。** 不同数据流可能仍属于同一属性；`debug_mode` 不是数据隔离。独立属性配置由 GA 管理员确认。本轮没有向 GA 发送测试流量。
- GA SDK 使用 `afterInteractive` 加载，加载前的交互进入标准 `dataLayer` 队列。不存在、被拦截或同步抛错时，不影响导航和订阅。既有 Umami / Twitter 仍只在 production 初始化；没有添加新的 GTM 容器。
- GA 初始化设置 `send_page_view: false`，初次页面和 SPA 路由变化由统一组件发送一次 `page_view`；StrictMode 重跑及 hash-only 变化不重复发送。Query 导航仍是独立浏览，但不会原样发送查询参数。
- **部署时必须关闭重复的增强衡量 history page view，并检查 Site search / Form interactions 自动采集。** 自定义输入清理不控制其他自动标签；不能因此声称所有历史埋点均已过滤敏感信息。[Google 页面浏览文档](https://developers.google.com/analytics/devguides/collection/ga4/views)，[增强衡量文档](https://support.google.com/analytics/answer/9216061)。

## GA4 全部自定义事件

| 事件                   | 触发位置 / 时机                                                                       | GA4 自定义参数                                    |
| ---------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `kb_article_click`     | Hub 精选、Most read、搜索建议/结果、Start here、文章列表、More from CKB、Recent posts | `article_slug`, `hub`, `click_source`, `position` |
| `kb_hub_click`         | 首页 Hub 标题/文章数、Related hubs、文章侧栏 Hub                                      | `hub`, `click_source`                             |
| `kb_subject_select`    | Hub Subject 实际切换、文章侧栏 Subject                                                | `hub`, `subject`                                  |
| `kb_cta_click`         | Take the guide、See/Browse all articles、Discover CKB、KB 面包屑                      | `cta_name`, `cta_location`                        |
| `kb_step_select`       | Start here 步骤导航点击，非滚动自动高亮                                               | `step_number`, `step_name`                        |
| `kb_resource_click`    | Build on CKB、Join the CKB Community、Become a CKBA Member、Write an article          | `resource`, `link_url`                            |
| `kb_social_click`      | 页脚 7 个社交入口                                                                     | `network`, `link_url`                             |
| `kb_search_submit`     | 搜索提交 / View all results，非逐字输入                                               | `search_term`, `results_count`                    |
| `kb_pagination_click`  | 文章列表和搜索结果上一页/下一页                                                       | `direction`, `page_number`, `page_type`           |
| `link_click`           | 全站 HTTP(S) 锚点激活                                                                 | `link_url`, `link_domain`, `outbound`             |
| `scroll_depth`         | 整个页面达到 25 / 50 / 75 / 90 / 100%                                                 | `percent_scrolled`                                |
| `kb_footer_link_click` | 页脚 24 个导航链接，含可点击栏目标题                                                  | `link_text`, `link_url`                           |
| `kb_toc_click`         | 桌面目录点击、移动端目录选择                                                          | `article_slug`, `heading_text`                    |
| `kb_layout_change`     | 列数实际变化、搜索 Grid/List 实际切换                                                 | `layout`, `columns`                               |
| `kb_filter_open`       | Filter 从关闭变为打开                                                                 | `page_type`, `hub`                                |
| `kb_back_to_top`       | 文章返回顶部                                                                          | `article_slug`                                    |
| `kb_newsletter_submit` | 实际订阅接口成功受理后；失败、校验失败、等待中不发送                                  | `form_location`, `status: accepted`               |

参数细则：

- `position` 为当前展示列表从 1 开始的位置，不是整个目录的全局排名。`hub` 来自被点击文章的分类；无分类使用 `unassigned`，无 Hub 上下文的 Filter 使用 `none`。
- `direction` 为 `previous` / `next`；`page_number` 为目标页。`page_type` 为 `hub` / `all_articles` / `search`；它与上文导航来源、下文页面分组是不同维度。Subject 的 View all 保留 `all`。
- `layout` 为 `grid` / `list`；列表列数为 1，搜索网格为 4，现有列数控件按实际选中的 3 / 4 / 5 上报。恢复本地偏好不算用户切换。
- `resource` 使用 `docs` / `github` / `community` / `membership` / `write_article` / `explorer`；页脚 Documentation / Github / Explorer 在保留 `kb_footer_link_click` 的同时上报资源事件，没有增加新入口。
- `results_count` 为完整匹配数，不能使用最多 5 条的建议列表长度。首页通过既有搜索 API 的 `X-Total-Count` 获取；搜索页可复用同一查询的服务端总数。计数异步进行，不阻塞导航；失败或缺少可靠计数时省略该字段，不伪造 0。每次提交独立捕获查询，避免快速提交后的计数串用。
- `form_location` 为 `signal` / `footer`。`accepted` 仅表示现有 SendGrid 接口已受理异步导入，**不是订阅已确认、导入已完成或邮件已送达**。详见 [订阅说明](./kb-newsletter-integration.md)。

## 页面分组与隐私边界

每个手动 `page_view` 均含 `content_group`：

| 值             | 页面                                          |
| -------------- | --------------------------------------------- |
| `kb_home`      | KB 首页                                       |
| `hub`          | Hub 页面（含当前 query 路由与未来 path 路由） |
| `article`      | 文章正文                                      |
| `start_here`   | Start here                                    |
| `all_articles` | All articles 与搜索结果                       |
| `core`         | 其他官网页面                                  |

- 事件的 `page_location`、`page_referrer` 和 `link_url` 去除 query/hash，拒绝非 HTTP(S)、URL credentials 和明显邮箱路径。SPA referrer 使用上一个已报告页面的安全地址，直接进入且无来源时为空。已有公开页面标题保留；搜索页固定为 Knowledge Base，不将搜索内容混入页面标题。
- `search_term` trim / 合并空白，最多 100 个字符。明显邮箱、URL、常见钱包地址、长数字序列或控制字符改为 `[redacted]`；其他文字参数也做长度限制及常见敏感格式过滤。**这是尽力过滤，不是任意个人信息检测器**；管理员仍需核对自动采集和数据政策。
- 不读取/上报邮箱表单值、姓名、API 响应错误内容或凭据。GA4 和 Umami 均不使用任意传入对象作为事件 payload。
- 一个点击可能同时产生通用 `link_click` 与业务事件，不能相加当作人数。当前普通点击、触摸、键盘激活沿用现有事件处理器；不专门捕获右键菜单或中键打开。
- 滚动深度包含首屏、针对整个文档，不等于文章读完。每个路由/query 浏览周期每档一次；目录 hash 不重置，真实路由切换重置。StrictMode 的 RAF 清理不会阻止后续滚动上报。

## Umami 兼容与分析口径

生产继续使用原来的 `placement`、`article_id`、`hub_id`、`subject_id`、`step`、`cta_id`、`resource_id` 等字段。GA4 才使用上表的映射字段；不要将两套参数名混为一谈。Umami 搜索仍只发送 `query_length_bucket`，不发搜索原文。通用链接只保留 `destination_category`，滚动只保留百分比；显式事件上下文去 query/hash，使用固定标题与空 referrer。

`kb_newsletter_result {placement, outcome: accepted|error}` 仅作为 Umami 诊断；它不属于 GA4 的 17 个事件。`kb_newsletter_submit` 的历史口径由“请求前尝试”变为“成功受理后”，分析跨版本数据必须分段，不能直接计算同口径转化。原 `kb_newsletter_submit_preview` 不再发送。

GA4 `click_source` 保留原 placement 值：`hub_featured`、`recommended_reading`、`home_search_suggestion`、`search_results`、`start_here_reading`、`topic_articles`、`archive_articles`、`more_from_ckb`、`recent_posts`。其中 `recommended_reading` 对应当前 Most read this year 模块，保留名字用于统计连续性。

本轮不更改 UI、推荐名单、榜单排序、地址或文章内容。Most Read 的既有近 12 个月 GA4 Views 快照不因接入事件而自动刷新。点击不是收藏数，没有卡片曝光分母，也不能计算真实 CTR；具体榜单口径见 [Most Read 数据说明](./kb-most-read.md)。

## 验证与上线待办

隔离测试使用真实组件/Hook/映射函数及 SDK、tRPC mock，覆盖 17 项 payload、环境切换、页面分组、SPA/hash 去重、参数清理、SDK 阻断、搜索总数、订阅时机、滚动 RAF 和原有链接行为。没有连接 GA 或创建真实订阅。

```sh
node --test src/utils/ga.test.mjs src/components/GoogleAnalytics/*.test.mjs
node --test src/components/KnowledgeHub/*.test.cjs src/components/KnowledgeHub/*.test.mjs
node --test src/server/api/routers/newsletter.test.mjs
```

预览属性 DebugView 验收、GA 自定义维度/指标及 key event 配置、重复自动事件排查和正式统计抽查均待有权限人员完成，见 [上线清单](./kb-release-checklist.md)。
