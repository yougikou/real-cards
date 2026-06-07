# Real Cards 产品功能蓝图

## 1. 产品定位

Real Cards 不是传统线上卡牌游戏，也不是带自动裁判的规则引擎。它的核心定位是：

> 手机当手牌，大屏当牌桌，玩家像玩真牌一样自由操作。

这个项目要解决的是“实体纸牌桌数字化”的问题，而不是“把某一种扑克规则搬到线上”。系统应尽量少判断规则，尽量多还原真实牌桌上的自由动作：摸牌、发牌、出牌、退牌、拿回、偷牌、洗牌、清桌、整理和口头协商。

当前技术方向是正确的：

- Host 是公共牌桌和权威状态源。
- Client 是玩家私密手牌和输入面板。
- Phaser + Matter.js 负责桌面物理手感。
- React 负责房间、手牌、事件流、设置和 PWA 体验。
- PeerJS 负责轻量 P2P 联机，适合线下聚会和小规模房间。

短中期产品目标不是做“大而全”的线上游戏平台，而是先让 4-6 人可以稳定玩完一局真实纸牌局。

## 2. 北极星体验指标

产品体验应围绕以下指标优化：

- 30 秒内完成开桌，并让第一个玩家成功入局。
- 玩家不看说明也能完成摸牌、出牌、退牌、拿回和从别人暗牌中抽牌。
- 一局过程中刷新或短线重连后，玩家手牌和座位不会丢失。
- Host 桌面动作和 Client 私密动作都能通过事件流解释清楚。
- 误操作有撤销、拿回或可逆路径。
- 游戏过程的第一感受应像“在摸牌和甩牌”，而不是在操作表单。

## 3. 产品原则

### 3.1 无规则优先

Real Cards 的默认模式必须是沙盒。系统不主动判断玩家是否能出某张牌，也不判断胜负。规则由玩家通过线下习惯、语音和桌面共识管理。

规则辅助可以存在，但必须是可关闭、可配置的 overlay，不能侵入核心牌流。

### 3.2 Host 权威

所有耐久状态变化必须由 Host 确认。Client 可以乐观展示动作，但最终状态必须以 Host 为准。

核心状态包括：

- 真实牌堆顺序。
- 每个玩家的私密手牌。
- 公共出牌区。
- 弃牌堆。
- 事件记录。
- 玩家身份与座位。

### 3.3 牌流容器化

所有卡牌移动都应表达为容器转移，而不是散落在 UI 事件里的特例逻辑。

目标转移模型：

- `deck -> hand`
- `deck -> playStack`
- `deck -> discardPile`
- `hand -> playStack`
- `hand -> deckTop`
- `hand -> deckBottom`
- `hand -> hand`
- `playStack -> hand`
- `playStack -> deckTop`
- `playStack -> deckBottom`
- `playStack -> discardPile`
- `discardPile -> deck`

这会让撤销、事件记录、重连恢复、回放和未来 Game Pack 扩展都更稳定。

### 3.4 物理手感是核心壁垒

没有自动规则结算时，产品壁垒必须来自“把玩卡牌”的沉浸感：

- 拖拽时有重量、阻尼和微小延迟。
- 出牌时有惯性、旋转、碰撞和落桌反馈。
- 抽牌、洗牌、退牌、重甩落桌有音效。
- 移动端关键动作有短促震动反馈。
- 桌面牌不是死板网格，而是像真实桌面一样有轻微随机角度和堆叠层次。

## 4. 当前产品判断

当前项目已经不是单纯技术 demo，而是一个可玩的多人牌桌雏形。

已具备的产品能力：

- Host 创建房间。
- QR Code 入桌。
- Client 输入名字加入。
- Host 保存权威牌堆和玩家手牌。
- Client 只渲染自己可见的手牌。
- 摸牌、出牌、退牌、从别人暗牌抽牌。
- 撤销部分个人动作。
- Host 通过 Phaser 操作桌面牌。
- 公共出牌区和弃牌堆。
- 事件流。
- move ledger 记录主要牌流容器转移。
- Host 可分配座位，玩家断线时保留离线状态。
- Client 支持按花色、点数、抽牌序整理手牌。
- Client 支持选中牌组后左右移动，进行本地手牌排序。
- 三语界面。
- 本地预览模式。

主要短板：

- README 和首页已完成第一轮产品化，但仍需要后续加入真实部署说明和动图/截图。
- 座位和玩家身份已开始产品化，Host 可选择玩家后直接点击桌边座位完成入座或交换；后续还需要踢出玩家和更丰富的离线管理。
- 新玩家对牌顶、牌底、弃牌堆、公共区的理解成本已降低，但 Host 桌面也需要继续强化区域文案。
- move ledger 已覆盖当前主要牌流，但还需要演进为可回放、可审计的统一动作模型。
- Client 手牌整理已有第一版排序和手动移动，但长按多选、滑动连选和大手牌密度仍需打磨。
- Host 桌面动作需要更多防误触和可解释反馈。
- PWA、刷新恢复、版本更新提示还需要补齐。

因此产品路线应优先打通“真实牌局闭环”，然后再做规则包和高级扩展。

### 4.1 本轮已实现更新

以下近期 issue 已完成第一版：

- `Home: replace Vite template landing with real table launcher`
- `Host: add explicit seat assignment and stable reconnect mapping`
- `Client: improve hand sorting and manual order`
- `State: define reversible move ledger for all card transfers`
- `UX: clarify deck top / deck bottom / discard interactions`
- `Docs: rewrite README as product and playtest guide`

当前实现边界：

- 座位分配通过 Host 面板选择玩家，再在 Phaser 桌边座位点击完成；已占座会自动交换，释放座位可从 Host 面板完成。
- 同名重连会迁移手牌、历史和座位；断线连接保留为离线状态。
- `moveLedger` 覆盖摸牌、出牌、退牌、偷牌、撤销、Host 发牌、Host 抽牌到桌面、Host 清桌、Host 弃牌等主要容器转移。
- 撤销请求已改为从 `moveLedger` 查找最近可逆动作。
- 撤销影响公共容器时，需要 Host/table confirm。
- 从其他玩家暗牌抽牌、供牌给其他玩家，以及撤销相关 `hand -> hand` 动作时，需要 counterparty confirm。
- Client 手牌排序是本地展示顺序，不改变 Host 的权威牌归属。
- 牌顶/牌底/弃牌堆在 Client 操作区已经分离文案，降低误退牌概率。
- 选择其他玩家时会先进入动作选择，玩家可请求抽对方暗牌，也可将已选手牌供给对方；两者都必须由对方确认。

## 5. MVP 1：稳定牌桌闭环

### 目标

支持真实线下聚会替代实体牌桌。4-6 人可以开桌、入局、摸牌、出牌、退牌、拿回、清桌、重开，并能理解每一步发生了什么。

### 关键功能

#### 5.1 开桌流程

- 首页改成真实产品入口，不再保留 Vite 模板感。
- Host 点击创建牌桌后，直接进入桌面。
- Host 首屏展示 QR Code、房号、玩家数、牌堆数和连接状态。
- Client 扫码后只需输入名字，不需要理解 Peer ID。
- 加入失败时给明确原因：
  - 房间不存在。
  - Host 离线。
  - 名字重复。
  - 网络连接失败。
  - 重连超时。

#### 5.2 座位与玩家身份

- 玩家加入后进入未入座状态或自动分配座位。
- Host 可以拖动、点击或菜单方式分配座位。
- 10 个边缘区域必须可控，不能只依赖连接顺序。
- Client 显示自己的座位位置。
- Host 显示每个座位的玩家名、手牌数和在线状态。
- 玩家断线后保留座位。
- 玩家用同名重连时，回到原手牌和原座位。
- Host 可释放离线座位。

#### 5.3 基础牌流

- Client 摸 1 张。
- Client 摸 N 张。
- Client 选择多张并出到公共区。
- Client 将手牌退回牌顶。
- Client 将手牌塞入牌底。
- Client 从其他玩家暗牌中抽取 1 张。
- Client 或 Host 从公共区最新批次拿回。
- Host 将公共区清到弃牌堆。
- Host 重置全局牌局并重新洗牌。

#### 5.4 操作可解释

事件流必须能回答“刚才谁做了什么”：

- 谁加入了房间。
- 谁摸了几张。
- 谁出了哪些公开牌。
- 谁退回了几张牌。
- 谁从谁那里抽了牌。
- Host 给谁发了牌。
- Host 抽牌到桌面。
- Host 清理了公共区。
- 谁撤销了最近动作。

Client 应有底部事件条，Host 桌面也应有简洁的最近事件提示。

#### 5.5 撤销边界

短期撤销规则应保持简单：

- 玩家只能撤销自己的最近一次可撤销动作。
- 摸牌撤销：从手牌移除并放回牌顶。
- 出牌撤销：仅当对应批次仍在公共区顶部时可拿回。
- 退牌撤销：从牌顶或牌底找回对应牌并回到手牌。
- 偷牌撤销：将牌归还给原玩家。
- 清桌和重置属于危险动作，应通过 Host 明确确认，不默认允许普通撤销。

### 验收标准

- 1 台 Host + 4 台 Client 可以完整跑 20 分钟。
- 中途有 1 台 Client 刷新后可恢复手牌和座位。
- 新玩家不看说明也能完成摸牌、出牌、退牌。
- 事件流足以解释所有主要牌流变化。
- 重置整局不会留下残留桌面牌或错误手牌数。

## 6. MVP 2：手感与误操作控制

### 目标

让产品从“能玩”变成“像真的在玩牌”。重点是手牌整理、Host 桌面物理反馈和防误触。

### 关键功能

#### 6.2 Host 物理桌面

- 桌面牌拖动、碰撞和停靠要稳定。
- 公共牌区区分当前出牌批次和历史批次。
- 桌面牌支持多选后拖动。
- 桌面牌可拖到玩家座位、弃牌堆、牌顶和牌底。
- 桌面提供整理按钮：
  - 收拢公共区。
  - 清到弃牌堆。
  - 洗回牌堆。
  - 重置整局。

#### 6.3 防误触

- 重置整局必须二次确认。
- 清空公共区必须二次确认或可撤销。
- Client 拖拽时目标区必须明确高亮。
- 牌顶、牌底、弃牌堆的文案和位置必须清楚区分。
- 网络失败时，乐观 UI 不能永久错位，应回滚或提示重新同步。

### 验收标准

- 玩家误把牌退错位置的概率明显降低。
- Host 不需要频繁口头解释桌面区域。
- 20 张以上手牌仍能顺畅选择、排序、出牌。
- 物理桌面操作不会绕过 Host 权威状态。

## 7. MVP 3：局管理与 PWA

### 目标

让 Real Cards 成为可以被收藏、安装和重复使用的聚会工具。

### 关键功能

#### 7.1 PWA 完整体验

- 安装提示。
- 移动端全屏体验优化。
- 横屏和竖屏适配。
- Host 离开页面前确认，避免误关房间。
- Service Worker 更新提示，避免旧版本缓存影响联机。
- root-level 旧 Service Worker 清理逻辑持续保留。

#### 7.2 房间恢复

- Host 刷新后尽量恢复局面。
- Client 重连时显示“正在恢复手牌”。
- 玩家在线状态包括：
  - 在线。
  - 重连中。
  - 离线保留。
- Host 可踢出离线玩家。
- Host 可转移或释放座位。

#### 7.3 局设置

- 牌组类型：
  - 标准 52 张。
  - 标准 54 张。
  - 无大小王。
- 起始发牌数。
- 是否允许从别人暗牌抽牌。
- 是否允许 Client 清桌。
- 是否在事件流公开具体牌面。
- 是否允许普通玩家撤销。

### 验收标准

- 玩家可以把应用安装到手机桌面。
- 第二次使用不需要重新学习开桌流程。
- 短暂断线不会让玩家丢失手牌。
- Host 有足够控制能力处理线下聚会中的异常情况。

## 8. MVP 4：Game Pack 配置化

### 目标

支持不同纸牌和桌游牌组，但仍然保持无规则沙盒，不硬编码具体游戏规则。

### 关键功能

#### 8.1 Game Pack JSON

每个游戏包至少包含：

- 包 ID。
- 包名称。
- 牌面资源。
- 牌背资源。
- 牌库列表和 card id 映射。
- 桌面容器定义。
- 默认玩家人数。
- 默认座位布局。
- 默认发牌数。
- 可选的排序规则。

#### 8.2 容器配置

桌面容器应可配置：

- 主牌堆。
- 弃牌堆。
- 公共出牌区。
- 当前批次区。
- 装备区。
- 判定区。
- 临时展示区。
- 玩家个人公开区。

复杂游戏可以拥有更多桌面区域，但底层仍然是容器转移。

#### 8.3 内置游戏包

优先内置：

- 标准扑克 52。
- 标准扑克 54。
- UNO 风格牌组。
- 三国杀基础占位包。
- 空白自定义包。

#### 8.4 资源导入

- Host 可上传本地图片包。
- 图片和配置保存到浏览器本地。
- Host 选择 Game Pack 后同步给 Client。
- Client 不需要手动安装同一个资源包。

### 验收标准

- 新增一个牌组不需要改核心代码。
- 标准扑克和 UNO 风格牌组能共用同一套牌流。
- Game Pack 只改变牌和区域，不改变核心 Host 权威模型。

## 9. MVP 5：规则辅助插件

### 目标

在不破坏沙盒定位的情况下，为常见游戏提供“辅助裁判”和桌面提示。

### 原则

- 规则辅助默认可关闭。
- 规则辅助不应阻止玩家强行动作。
- 规则辅助只提示、标记、计数和记录。
- Host 拥有最终控制权。

### 可做功能

- 当前玩家标记。
- 回合顺序。
- 倒计时。
- 出牌批次标记。
- 简单计分。
- 血量、装备、身份等公开状态计数。
- 出牌提示。
- 非法动作软提示。

### 游戏模板方向

- 争上游/斗地主：
  - 发牌辅助。
  - 地主/当前玩家标记。
  - 当前轮次提示。
- UNO：
  - 当前颜色。
  - 出牌方向。
  - 摸牌提示。
- 三国杀：
  - 身份区。
  - 装备区。
  - 判定区。
  - 血量计数。
  - 当前回合提示。

## 10. 明确不做清单

短期不要做：

- 自动判断牌型胜负。
- 完整账号系统。
- 排位。
- 匹配。
- 排行榜。
- 大型中心化服务端房间架构。
- AI 玩家。
- 商城。
- 社交关系链。
- 每种游戏单独写一套硬编码规则。

这些方向会把项目拖向普通线上卡牌游戏，削弱当前最有差异化的“实体牌桌数字替身”定位。

## 11. 推荐近期 Issue 拆分

第一批已完成第一版：

- `[done] Home: replace Vite template landing with real table launcher`
- `[done] Host: add explicit seat assignment and stable reconnect mapping`
- `[done] Client: improve hand sorting and manual order`
- `[done] State: define reversible move ledger for all card transfers`
- `[done] UX: clarify deck top / deck bottom / discard interactions`
- `[done] Docs: rewrite README as product and playtest guide`
- `[done] Host: add recent event overlay on table`
- `[partial] Room: show online reconnecting offline player states`
- `[done] Undo: use ledger-backed confirmation for public and counterparty-sensitive moves`
- `[done] Client: add give-card flow using counterparty confirmation`

第二批应优先创建和实现：

- `Client: add draw N cards action`
- `Client: add long press multi-select and clear selection`
- `Host: confirm dangerous reset and clear actions`
- `PWA: add update available prompt`
- `Room: add host controls for offline players and reconnect messaging`
- `[done] Host: replace seat dropdown with tap-table seat assignment and release-seat controls`
- `MoveLedger: make ledger replayable beyond undo and expose a debug timeline`
- `Client: improve pending action state and undo count accuracy for unapproved requests`

第三批：

- `GamePack: define JSON schema`
- `GamePack: support standard 52 and 54 card presets`
- `GamePack: make table containers configurable`
- `Assets: load custom card faces and backs`
- `RulesAssist: add optional turn marker overlay`

## 12. 产品路线总览

| 阶段 | 目标 | 主要产出 |
| --- | --- | --- |
| MVP 1 | 稳定牌桌闭环 | 开桌、入桌、座位、基础牌流、事件解释、撤销边界 |
| MVP 2 | 手牌和物理手感 | 手牌整理、桌面物理、多选、防误触 |
| MVP 3 | 可重复使用 | PWA、房间恢复、连接状态、局设置 |
| MVP 4 | 游戏包配置化 | Game Pack JSON、牌面资源、容器配置、内置牌组 |
| MVP 5 | 规则辅助插件 | 回合、计数、提示、游戏模板 overlay |

最终目标是形成一个稳定、可安装、可扩展的数字牌桌沙盒。它应该先成为玩家愿意在真实聚会中打开使用的工具，再逐步变成可承载多种卡牌和桌游体验的平台。
