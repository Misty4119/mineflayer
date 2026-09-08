# Minecraft Java 26.2 完整支援、最佳化與硬化計畫

> 狀態：Phase 0–7 已完成主要 private-fork gate；Phase 8–10 持續硬化與驗證中
>
> 更新日期：2026-09-08
>
> 目標：建立可重現、可驗證、可長期維護的 Mineflayer private fork，完整支援 Minecraft Java 26.2，同時維持既有 1.8.8–26.1 相容性。

## 1. 已確認的範圍

本計畫採用以下決策：

- 交付目標是 private fork，但品質標準採 upstream-grade。
- 保留目前 Mineflayer 公開 API 與 1.8.8–26.1 支援。
- 核心範圍包含 Vanilla 26.2、Paper/Spigot 26.2、offline-mode 與 online-mode。
- Sulfur、Cinnabar、Sulfur Cube 等新內容必須能透過既有 generic block/item/entity API 正確暴露。
- 只有確實需要時才新增特殊高階 API，不為單一新生物任意增加 API 表面。
- 硬化包含 dependency、reproducibility、malformed packet、資源耗盡、錯誤恢復與可觀測性。
- 效能先建立 baseline，再依 profile 結果最佳化。
- 不包含重新實作 Minecraft client 的渲染、原版 AI 或所有原版內部邏輯。

## 2. 目前基線與重要判定

目前核心底層 repository 都可在本機修改：

| 層級 | Repository | 角色 |
| --- | --- | --- |
| 整合層 | `C:\Users\margo\IdeaProjects\mineflayer-master` | Mineflayer API、plugins、CI、end-to-end tests |
| 資料／schema 層 | `C:\Users\margo\IdeaProjects\minecraft-data` | 版本資料、registry、block states、protocol schema、generated data |
| 協定實作層 | `C:\Users\margo\IdeaProjects\node-minecraft-protocol` | serializer/deserializer、login/configuration/play server/client adapter |
| 世界解析層 | `C:\Users\margo\IdeaProjects\prismarine-chunk` | chunk section、palette、lighting、height/world layout |
| 物理層 | `C:\Users\margo\IdeaProjects\prismarine-physics` | gravity、collision、liquid、climbing、movement |
| 物品／component 層 | `C:\Users\margo\IdeaProjects\prismarine-item` | 26.2 typed components、enchantments、anvil item semantics |

Minecraft Java 26.2 的核心常數為 protocol `776`、data version `4903`、Java 25；官方版本內容包含 Sulfur Cube、Sulfur Caves 與 Sulfur/Cinnabar 系列。[官方 26.2 公告](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-2)；[minecraft-data issue #1197](https://github.com/PrismarineJS/minecraft-data/issues/1197)

目前已完成 native data、協定 schema、chunk/physics mapping、Mineflayer adapter、clean install、26.2 pure/loopback，以及官方 Vanilla 26.2 offline smoke。外部測試 runner 已修正 listener/child/server cleanup、失敗後 cascade 與長時間 block matrix 的明確 opt-in；`anvil`、`placeEntity`、28 個 Sulfur/Cinnabar 新方塊案例，以及完整 `digEverything` 矩陣均已通過。原始 registry 展開為 1,159 個 block 名稱；按 resource name 去重後，1,016 個具同名可放置 item 的案例構成通用矩陣，完整 run 為 `1016 passing (30m)`。尚未完成的證據包括：

1. Paper/Spigot 26.2 offline/online 矩陣。
2. online-mode 真實 session/auth 流程。
3. 官方 binary capture 的完整 chunk lighting/heightmap/global-palette fixture。
4. fuzz、resource-limit、長時間 reconnect/leak 與正式 load profile。
5. `node-minecraft-protocol` 與 `prismarine-item` 目前仍是 working-tree source fork；發布或交付前需整理成可追溯的 commit SHA，不能依賴 dirty `master`。

研究與來源紀錄位於：[minecraft-26.2-research.md](C:/Users/margo/IdeaProjects/mineflayer-master/docs/minecraft-26.2-research.md)。

## 3. Repository 協作策略

### 3.1 分支與版本固定

各 repository 使用獨立的 `codex/` 工作分支，建議名稱：

- `codex/minecraft-26-2-data`
- `codex/minecraft-26-2-protocol`
- `codex/minecraft-26-2-chunk`
- `codex/minecraft-26-2-physics`
- `codex/minecraft-26-2-item`
- `codex/minecraft-26-2-mineflayer`

Mineflayer 以明確 commit SHA 依賴其他 repository；不依賴會漂移的 branch head。目前 data/chunk/physics 已在專用分支，protocol/item 的 26.2 變更仍在本機 `master` working tree，必須在發布前拆出並固定 commit。每次底層 commit 更新，都必須重新執行資料、schema、chunk、physics、item、Mineflayer integration 與 Vanilla 測試。

### 3.2 Source of truth 原則

- protocol 變更先修改 `minecraft-data` 的 YAML/DSL，再生成 `protocol.json`；禁止直接手改 generated JSON。
- registry、block state、entity metadata 以官方 26.2 server reports/generator 為來源。
- chunk 與 physics 行為以官方 server 實際封包、世界資料與可重現測試 fixture 為準。
- Mineflayer 只負責把底層資料與封包轉成穩定的高階 API。
- 任何 workaround 都要有來源、原因、版本範圍、測試與移除條件。

## 4. 分階段執行計畫

### Phase 0：基線、工作區與可重現性

**目的**：先固定目前狀態，避免四個 repository 的變更互相污染或無法回溯。

工作項目：

- 記錄四個 repository 的 HEAD、branch、Node/Java 版本與官方 server jar checksum。
- 清點目前 vendor data、Git dependency、postinstall workaround 與測試排除項目。
- 為 Mineflayer 建立 lockfile，改用 `npm ci` 驗證 clean install。
- 增加一個明確的 26.2 test configuration，避免依賴開發者本機殘留的 `node_modules`。
- 建立測試 artifacts 目錄，保存 packet fixture、server reports 摘要、profile 與 failure log。

**Exit gate**：四個 repository 可各自 clean install/test；Mineflayer 的依賴版本與來源可由 lockfile 完整重建。

### Phase 1：`minecraft-data` 原生 26.2

**目的**：移除以 26.1 alias 冒充 26.2 registry 的風險。

工作項目：

- 以官方 26.2 server jar 與既有 generator pipeline 產生 `data/pc/26.2/`。
- 更新 `dataPaths.json`、common version metadata 與相關 generated index。
- 產生並驗證：
  - blocks、block states、items
  - entities 與 entity metadata
  - biomes、particles、sounds
  - collision shapes、materials、tints
  - recipes、foods、instruments、effects、attributes
  - login packet 與 protocol schema
- 將 `sulfur_cube` metadata 落實到正式資料；若 generator 無法抽出，建立明確且可重跑的 extractor，不直接手改產物。
- 以官方 `registries.json`、`blocks.json` 與 reports 做數量、名稱、ID、state range 比對。
- 對 26.1→26.2 的 registry shift 建立 regression test，特別抽驗 state IDs `24687`–`24689`。
- 只允許經證明完全相同的非 registry 資料使用 alias；blocks/items/entities/block states 不接受未驗證 alias。

PR #1219 已指出 26.2 有大量 registry 與 block-state 重排，不能只複製 26.1 資料。[minecraft-data PR #1219](https://github.com/PrismarineJS/minecraft-data/pull/1219)

**Exit gate**：`data/pc/26.2/` 為可由 source 重新生成的原生資料；資料 validation、registry diff、Sulfur content 與 entity metadata tests 全部通過。

### Phase 2：protocol schema 與 `node-minecraft-protocol`

**目的**：讓 serializer/deserializer 與官方 26.2 wire format 一致。

工作項目：

- 在 `minecraft-data` protocol YAML/DSL 修正並重新生成：
  - `login_success.sessionId`
  - play `login.onlineMode`
  - `update_time.gameTime` 與 clock entries
  - teams 欄位順序、optional TeamColor、flags
  - `spectator_action` rename 與 optional entity ID
  - `use_entity.usingSecondaryAction`
  - game rule values/entries
  - advancements item display
  - low-disk packet
  - recipe display/slot display 相關 packet
- 在 protocol library 修正 server/client writer 與 packet mapping。
- 移除 Mineflayer `postinstall` 對 `node_modules` 原始碼的文字替換。
- 將必要修正放在 `C:\Users\margo\IdeaProjects\node-minecraft-protocol` 的正式 fork/commit，或待 upstream merge 後改用發行版本。
- 建立 encode/decode golden fixtures，測試必要欄位、optional 欄位、欄位順序與錯誤資料。
- 保留舊版本 packet schema，使用 capability/version mapping 隔離 26.2。

目前 `node-minecraft-protocol` 的 26.2 內容仍在專用 branch，主線尚未完整列入 26.2。[主線版本表](https://raw.githubusercontent.com/PrismarineJS/node-minecraft-protocol/master/src/version.js)；[26.2 branch](https://raw.githubusercontent.com/PrismarineJS/node-minecraft-protocol/pc26_2/src/version.js)

**Exit gate**：所有已知 26.2 packet fixture 與 protocol round-trip 通過，協定 server helper 已在 source fork 補上 `login_success.sessionId`，且不再需要修改 `node_modules`。

### Phase 3：`prismarine-chunk`

**目的**：確保 chunk 能「解碼成功且 block 名稱正確」，而不是只避免 exception。

工作項目：

- 將 26.2 version mapping 與 section format 納入正式 source。
- 明確確認 `fluidCount` 的版本起點與 26.2 guard。
- 以官方 Vanilla 26.2 capture 建立 binary fixtures：
  - empty section
  - single-value palette
  - indirect palette
  - global palette
  - fluid count
  - lighting
  - heightmap
  - minY/maxY 與多維度 chunk
- 驗證 global palette 的實際位寬，不以互相矛盾的 upstream 推測直接定案。
- 對 state IDs 做 decode → block name → encode round-trip。
- 增加 malformed section、截斷 buffer、超大 palette、非法 bits-per-block 的安全失敗測試。
- 驗證 chunk implementation 對 26.1 及更舊版本沒有回歸。

目前 upstream 對 `fluidCount` 與 palette 仍有未合併討論，必須以 fixture 定案。[Mineflayer issue #3952](https://github.com/PrismarineJS/mineflayer/issues/3952)；[prismarine-chunk PR #331](https://github.com/PrismarineJS/prismarine-chunk/pull/331)

**Exit gate**：所有官方 fixture 能正確解析，state name 與 state ID 一致，malformed input 不會造成越界或資源失控。

### Phase 4：`prismarine-physics`

**目的**：提供 26.2 正確且不破壞舊版的 movement/collision 行為。

工作項目：

- 將 26.2 feature set 納入正式 source。
- 測試 proportional liquid gravity、climb/jump、ground friction、collision 與新 block shapes。
- 使用 Vanilla 26.2 世界 fixture 驗證 Sulfur 區域及新方塊的碰撞。
- 測試 tick determinism：同一輸入與初始狀態必須產生相同結果。
- 建立 physics microbench，保存每 tick CPU 與 allocation baseline。
- 檢查 26.1 以前的 feature gates 與 world height 行為。

**Exit gate**：physics unit tests、determinism tests、Mineflayer movement tests 與 26.2 server smoke 全部通過。

### Phase 5：Mineflayer integration

**目的**：把底層 26.2 支援整合成穩定、向後相容的 Mineflayer API。

工作項目：

- `game`：configuration/play transition、respawn payload、game rule。
- `health`：spawn、player loaded、respawn 與 death flow。
- `time`：gameTime、clock map、多維度與 daylight cycle。
- `team`：新欄位順序、optional color、flags、舊 API 映射。
- `entities`：attack split、use entity、entity metadata、Sulfur Cube。
- `inventory`：26.2 item components、recipe display、container sync。
- `world`：chunk、lighting、block states、block entities、dimension transition。
- `physics`：26.2 capability、world height、碰撞與液體。
- `spectator`：封包 rename、optional target、public API compatibility。
- 將散落的 `majorVersion === '26.2'` 判斷改為集中 capability/feature flag。
- 所有新增 API、事件與欄位補上文件與 TypeScript declarations。

**Exit gate**：Mineflayer pure/integration tests 通過，且未出現舊版本 packet shape regression。

### Phase 6：真實伺服器驗證

**目的**：消除同 schema loopback 測試無法發現的錯誤。

測試矩陣：

| 伺服器 | 模式 | 用途 |
| --- | --- | --- |
| 官方 Vanilla 26.2 | offline | 基礎 wire、世界、chunk、entity、inventory |
| 官方 Vanilla 26.2 | online-mode | session/auth semantics |
| Paper/Spigot 26.2 | offline | 常見第三方 server 行為 |
| Paper/Spigot 26.2 | online-mode | 實際部署相容性 |
| 舊版 Vanilla/現有 fixture | offline | 1.8.8–26.1 regression |

26.2 必測場景：

- login/configuration/play 全流程
- spawn/player loaded
- chunk、lighting、heightmap、跨 dimension
- blockAt、挖掘、放置、碰撞、液體
- inventory、crafting、furnace、trade、recipe book
- entity spawn、metadata、attack、use entity
- time、team、game rule、advancement
- spectator、respawn、reconnect
- chat、command、malformed packet、server kick
- Sulfur/Cinnabar 方塊、物品、particle 與 Sulfur Cube

目前 external suite 的 `anvil`、`placeEntity` 已在預設矩陣重新納入並通過；`digEverything` 不再是永久排除，而是透過 `MINEFLAYER_RUN_EXHAUSTIVE_BLOCK_TESTS=1` 明確啟用的長時間 gate。新增方塊的 28 個代表性挖掘案例、36-case batch，以及完整 1,016-case item-backed run 均已通過。完整矩陣會保留為 nightly/長時間 gate，避免一般 pull-request 被 30 分鐘測試阻塞。

**Exit gate**：Vanilla 26.2 與 Paper/Spigot 26.2 核心 session 全流程通過，且 packet trace 無未知 packet、schema error 或 parser drift。

### Phase 7：跨版本回歸與 CI

**目的**：確保 26.2 修正不會破壞歷史版本。

- 對 1.8.8、1.12、1.16、1.19、1.20.4、1.20.5、1.21.1、1.21.4、1.21.5、1.21.8、1.21.11、26.1、26.2 建立 representative matrix。
- 對完整 `lib/version.testedVersions` 執行分片測試。
- CI 使用已維護的 checkout/setup-node actions，固定 Node 22 與 Node 24 測試環境。
- Java 25 僅用於需要的 26.2 server tests，避免舊版測試環境互相干擾。
- 將 Vanilla server 測試分為 pull-request smoke 與 nightly full suite。
- 失敗時保存 server log、packet trace、fixture、Node/Java/commit metadata。
- 建立 performance regression gate，但先排除外部 server 啟動時間等非穩定因素。

**Exit gate**：所有既有版本 regression 通過；CI 可從 clean checkout 重建並產出可診斷的失敗 artifacts。

### Phase 8：安全硬化

**目的**：讓 bot 在不可信伺服器環境中安全失敗，避免 parser 與資源型攻擊。

- 封包總長度、字串長度、陣列數量、NBT 深度與 compound entry 數量上限。
- chunk section、palette、entity metadata 的數量與配置限制。
- malformed/truncated packet 的 bounded parsing 與資源釋放。
- 避免 chunk、entity、listener、cache、reconnect timer 無限增長。
- socket timeout、backpressure、abort、reconnect 與半開連線處理。
- 伺服器送來的 chat、NBT、sign text、book text 一律視為不可信資料。
- 針對 parser 做 fuzz/property tests；錯誤輸入不得造成 process crash。
- lockfile、Git SHA、vendor manifest、official jar checksum 與 generator provenance。
- dependency audit、license 檢查與定期安全更新流程。
- 文件化 online-mode token/session 的保存與清理方式。

**目前進度**：外部 server/child cleanup、abort、timeout、listener cleanup、clean install 與 audit baseline 已落地；仍需完成 malformed packet fuzz、resource-limit、長時間 reconnect/leak 與依賴漏洞收斂。

**Exit gate**：fuzz、資源限制、reconnect、dependency audit 與 clean-install security checks 通過。

### Phase 9：效能最佳化

**目的**：在正確性完成後，降低單 bot 與多 bot 負載。

baseline workload：

- 單 bot login → spawn → 移動 → chunk streaming。
- 10/50/100 bot 同時連線。
- 大量 chunk 載入與卸載。
- 大量 entity metadata 更新。
- inventory/recipe 操作。
- physics/pathfinding 持續 tick。

量測：

- login/startup latency
- packet throughput
- chunk decode throughput
- `blockAt` throughput
- physics tick CPU
- heap、RSS、GC、allocation rate
- reconnect 後的資源回收

優先檢查 chunk allocation、registry lookup、metadata event fan-out、timer scheduling、cache eviction；任何最佳化必須附 profile 與 regression test。

**目前進度**：尚未建立可比較的單 bot/多 bot profile；目前只完成測試矩陣時間與 external runner cleanup 的觀察，不能把 correctness 測試結果當成效能 gate。

**Exit gate**：相對 Phase 0 baseline 沒有可接受範圍外的 regression；高負載 profile 有明確改善或已證明瓶頸不在 Mineflayer。

### Phase 10：文件、版本與維護

- 更新 `docs/README.md`、API、支援版本與 Node/Java requirements。
- 將研究文件與本計畫中的「upstream work-in-progress」和「private fork 已驗證」分開維護。
- 新增 26.2 migration/compatibility notes。
- 為 vendor data 記錄來源 jar、generator commit、生成日期與 checksum。
- 建立 26.2.x 更新 runbook：先更新 data，再更新 protocol/chunk/physics，最後跑完整驗證。
- 維持 upstream PR/issue 追蹤；upstream 合併後以測試結果為依據移除 private workaround。

## 5. 風險優先級

| 優先級 | 風險 | 處理方式 |
| --- | --- | --- |
| P0 | registry/block-state ID silent mismatch | 原生 26.2 data、官方 report diff、chunk name correctness fixture |
| P0 | protocol 欄位順序/optional semantics 錯誤 | YAML source、generated schema、官方 packet fixture、real server trace |
| P0 | 協定層缺少 26.2 login session 欄位 | `node-minecraft-protocol` source fork/commit、golden test、移除 node_modules patch |
| P1 | chunk fluidCount/global palette | 官方 capture、版本 guard、global palette fixture、fuzz |
| P1 | Sulfur Cube metadata 不完整 | extractor/capture、metadata index/type fixture、entity integration |
| P1 | online-mode semantics 未驗證 | 真實 online-mode 測試環境與明確 secrets 邊界 |
| P1 | 舊版 regression | capability gating、分片 CI、代表性版本矩陣 |
| P2 | 高 bot 效能退化 | baseline、profile、load test、效能 gate |
| P2 | upstream 後續變更造成 fork 漂移 | provenance、定期 upstream audit、更新 runbook |

## 6. 最終 Definition of Done

只有全部條件完成，才宣稱本 private fork 完整支援 Minecraft Java 26.2：

1. 四個底層 repository 的必要修正都有 source、test、commit 與 provenance。
2. `minecraft-data` 有可重新生成的原生 `data/pc/26.2`，非未驗證的 26.1 registry alias。
3. protocol 776、data version 4903、Java 25 runtime 條件正確。
4. login、configuration、play、respawn、dimension、spectator、time、team、game rule、recipe 等 packet fixture 通過。
5. 官方 Vanilla 26.2、Paper/Spigot 26.2 的 offline-mode 核心流程通過。
6. online-mode authentication semantics 有實際驗證或明確標示為唯一未覆蓋項目。
7. chunk fluid count、palette、lighting、heightmap 與 block-state name correctness 通過。
8. Sulfur/Cinnabar 新內容與 Sulfur Cube metadata 可由 Mineflayer 正確使用。
9. `digEverything`、`anvil`、`placeEntity` 等目前排除測試重新納入並通過。
10. 1.8.8–26.1 regression suite 通過。
11. clean install、lockfile、dependency audit、fuzz、resource-limit 與 reconnect tests 通過。
12. 效能 baseline 已建立，且沒有未解釋的 CPU、memory、latency regression。
13. 文件能清楚區分 private fork 已驗證內容、upstream 狀態與未支援範圍。

## 7. 本輪執行快照（2026-09-08）

已落地並驗證：

- `minecraft-data` native 26.2 data、官方 reports 對照與 `loginSuccessIncludesSessionId` feature。
- `node-minecraft-protocol` local source fork：26.2 server `login_success` 產生每個 server 共用的隨機 session UUID。
- `prismarine-chunk` 26.2 fluid count、palette width guard 與 block-state round-trip。
- `prismarine-physics` 26.2 feature gates。
- Mineflayer vendor package、lockfile、`install-links=true` clean-install 流程，以及不再修改 `node_modules` 的 postinstall。
- External test runner 已加入 Windows process-tree cleanup、SIGINT/SIGTERM cleanup、fail-fast/cascade 防護、finite hunger/child waits、modern signed-chat matching 與 listener cleanup regression；清理完成後會移除 stale wrapper，避免 Windows PID 重用風險。
- `digEverything` 已修正 26.2 block/item registry ID 分離，按 resource name 取得 item、選擇對應 mineable tool 並驗證實際放置的 block name；明確排除沒有同名可放置 item、需專項 setup 的 block state。補上流體／作物／附著方塊／低光環境／基礎方塊、infested silverfish、kelp substrate、長測 re-anchor 與動態挖掘 timeout；完整 1,016-case item-backed matrix 通過。
- inventory cursor 回收增加 AbortController 同步清理與移動次數上限，伺服器拒絕同步時會明確失敗，不再無限重試；anvil 結果槽依 26.2 的 cursor/slot/full-sync 回應同步，merchant 維持交易槽更新順序。
- `docs/log.txt` 在目前工作區不存在，不能作為證據；本次結果以實際命令輸出、server save/stop 與殘留程序檢查為準。

已通過：Mineflayer lint；Mineflayer 既有/26.2 internal + pure/integration/cleanup `731 passing, 41 pending`；prismarine-chunk `348 passing`；prismarine-physics `19 passing`；minecraft-data `1890 passing, 1 pending`；官方 Vanilla 26.2 預設 external `59 passing (2m)`；anvil/furnace/trade/placeEntity high-risk `10 passing`；新內容挖掘 smoke `28 passing`；代表性 exhaustive batch `36 passing (2m)`；完整 26.2 `digEverything` `1016 passing (30m)`。完整矩陣結束時 server 正常 save/stop，未發現符合條件的 Node/Java server 殘留程序。

## 8. 建議執行順序

執行順序固定為：

`Phase 0 → Phase 1 → Phase 2 → Phase 3/4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10`

Phase 3 與 Phase 4 可以在 Phase 2 schema 穩定後平行處理；Phase 8 與 Phase 9 必須建立在功能與測試基線穩定後，不提前用最佳化掩蓋 protocol/data correctness 問題。
