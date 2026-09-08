# Minecraft Java 26.2 支援研究

> 研究日期：2026-09-05
>
> 範圍：目前這個 Mineflayer private fork 的個人使用；本文件不是 upstream PR 提案，也不代表 PrismarineJS 已正式支援 26.2。

## 結論摘要

**來源事實**：Minecraft Java Edition 26.2 於 2026-06-16 發布；官方公告列出 Sulfur Cube、Sulfur Caves、Cinnabar/Sulfur 方塊系列、Sulfur Spike、Potent Sulfur 等遊戲內容。[官方 26.2 公告](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-2)

**來源事實**：PrismarineJS 的 26.2 tracking issue 記錄 protocol `776`、data version `4903`、Java `25`。[minecraft-data issue #1197](https://github.com/PrismarineJS/minecraft-data/issues/1197)

**本專案推論**：26.2 不能只把版本字串從 26.1 改成 26.2。此版本同時有 login、time、team、entity interaction、spectator、game-rule 等封包格式變更，且 registry 與 block-state ID 大量重排；因此本 fork 採用「原生 26.2 資料 + 版本分支封包實作 + 逐層驗證」的策略。

## 來源與可信度界線

本研究優先使用下列一手來源：

- Mojang/Minecraft 官方 26.2 release announcement：遊戲版本與內容事實。[Minecraft Java Edition 26.2](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-2)
- PrismarineJS `minecraft-data` issue：版本號與 protocol metadata。[Support Minecraft PC 26.2 #1197](https://github.com/PrismarineJS/minecraft-data/issues/1197)
- PrismarineJS `minecraft-data` 26.2 branch/PR：protocol JSON、registry/block-state 風險，以及對照 vanilla server jar 的封包分析。[PR #1219](https://github.com/PrismarineJS/minecraft-data/pull/1219)、[26.2 protocol.json](https://github.com/PrismarineJS/minecraft-data/blob/pc_26_2/data/pc/26.2/protocol.json)
- PrismarineJS `node-minecraft-protocol` 的 `pc26_2` branch：版本清單與 server/client protocol implementation。[version.js](https://raw.githubusercontent.com/PrismarineJS/node-minecraft-protocol/pc26_2/src/version.js)、[server/login.js](https://raw.githubusercontent.com/PrismarineJS/node-minecraft-protocol/pc26_2/src/server/login.js)
- `minecraft-data` 對 protocol data 的維護說明：protocol JSON 會生成 PrismarineJS protocol code，舊版本資料位於 `data/<pc|bedrock>/<version>`。[protocol.md](https://github.com/PrismarineJS/minecraft-data/blob/master/doc/protocol.md)

PR #1219 中的 registry 數字與 vanilla jar diff 是 upstream PR 討論中的 reviewer 分析，不是 Mojang 官方公布的相容性保證；本文因此把它標成**來源報告**，並將「必須使用原生 26.2 表」列為本專案的工程推論。

## 版本識別

| 欄位 | 26.2 值 | 判定 |
| --- | --- | --- |
| Minecraft version | `26.2` | 來源事實：[issue #1197](https://github.com/PrismarineJS/minecraft-data/issues/1197) |
| Protocol | `776` | 來源事實：[issue #1197](https://github.com/PrismarineJS/minecraft-data/issues/1197) |
| Data version | `4903` | 來源事實：[issue #1197](https://github.com/PrismarineJS/minecraft-data/issues/1197) |
| Java version | `25` | 來源事實：[issue #1197](https://github.com/PrismarineJS/minecraft-data/issues/1197) |
| node-minecraft-protocol default/supported version | `26.2` | 來源事實：[pc26_2 version.js](https://raw.githubusercontent.com/PrismarineJS/node-minecraft-protocol/pc26_2/src/version.js) |

## 26.2 重大封包變更

以下是以 26.1 對照 26.2 protocol schema 得到的 wire-level 變更。封包名稱與欄位以 26.2 的 [protocol.json](https://github.com/PrismarineJS/minecraft-data/blob/pc_26_2/data/pc/26.2/protocol.json) 為準。

| 狀態／方向 | 變更 | 對 Mineflayer 的影響 |
| --- | --- | --- |
| `login` → client | `success` 在 `uuid`、`username`、`properties` 後新增 `sessionId: UUID`。[26.2 schema](https://github.com/PrismarineJS/minecraft-data/blob/pc_26_2/data/pc/26.2/protocol.json) | server fixture 必須由 source-level protocol helper 寫入每個 server instance 共用的 session UUID。 |
| `play` → client | `login` 在 `worldState` 與 `enforcesSecureChat` 之間新增 `onlineMode: bool`。[PR #1219 的封包分析](https://github.com/PrismarineJS/minecraft-data/pull/1219) | login fixture 與任何自行產生的 login packet 必須提供欄位。 |
| `play` → client | `update_time` 的世界時間欄位由 `age` 改為 `gameTime`；clock entry 的維度欄位由 `id` 改為 `clock`，仍包含 `totalTicks`、`partialTick`、`rate`。[26.2 schema](https://github.com/PrismarineJS/minecraft-data/blob/pc_26_2/data/pc/26.2/protocol.json) | time plugin 不能只讀舊欄位；還要把 26.2 clock 編號映射到 Mineflayer 的 dimension clock。 |
| `play` → client | `teams` 的 parameters 完整重排：`displayName`、`prefix`、`suffix`、`nameTagVisibility`、`collisionRule`、optional `color`、`flags`；26.1 的 `name`、`flags`、`formatting`、尾端 prefix/suffix 順序不再適用。[PR #1219 的 server-jar 對照](https://github.com/PrismarineJS/minecraft-data/pull/1219) | 這是高風險變更：錯 schema 可能成功解碼但欄位語意全錯，不一定立刻 disconnect。 |
| `play` → server | `spectate_entity` 改名為 `spectator_action`，payload 由必要 `varint entityId` 改為 optional varint。[PR #1219 的封包分析](https://github.com/PrismarineJS/minecraft-data/pull/1219) | spectator 功能與封包名稱、optional semantics 都要單獨測試。 |
| `play` → server | `use_entity` 仍帶 `target`、`hand`、`location`，但最後欄位由 `sneaking` 改為 `usingSecondaryAction`；26.2 schema 對 `hand` 也使用 plain `varint`。[26.2 protocol.json](https://github.com/PrismarineJS/minecraft-data/blob/pc_26_2/data/pc/26.2/protocol.json) | entity interaction 及 attack/use split 必須依版本送正確欄位。 |
| `play` 雙向 | `game_rule_values`／`set_game_rule` 改為 `rules: [{ gameRule, value }]`；舊版的 `values`／`entries` 與 `GameRule` 結構不應直接沿用。[26.2 protocol.json](https://github.com/PrismarineJS/minecraft-data/blob/pc_26_2/data/pc/26.2/protocol.json) | game rule 讀寫和測試 server 的 packet fixture 需要更新。 |
| `play` → client | `advancements` 的 display icon 型別由 `Slot` 改為 `ItemStackTemplate`；`low_disk_space_warning` 由空 container 變為 `void`。[26.2 protocol.json](https://github.com/PrismarineJS/minecraft-data/blob/pc_26_2/data/pc/26.2/protocol.json) | advancement 與低磁碟警告屬低頻路徑，但 schema parser 仍須以 26.2 data 驗證。 |

補充：`attack` 獨立 packet 並不是本次才出現的概念；目前 Prismarine feature data 將它視為 26.1+ 的行為。[minecraft-data 3.113.0 feature data](https://raw.githubusercontent.com/PrismarineJS/minecraft-data/3.113.0/data/pc/common/features.json) 本 fork 的 26.2 目標是維持既有 attack split，同時修正 26.2 `use_entity` 欄位名稱，而不是把它誤標成 26.2 首次新增。[node-minecraft-protocol `pc26_2` source](https://raw.githubusercontent.com/PrismarineJS/node-minecraft-protocol/pc26_2/src/version.js)、[26.2 protocol.json](https://github.com/PrismarineJS/minecraft-data/blob/pc_26_2/data/pc/26.2/protocol.json)

## Registry 與 block-state 資料風險

### 來源報告

PR #1219 的 reviewer 以 26.1/26.2 vanilla `--reports` 和 server jar diff 報告下列變化：

- item protocol IDs：`1506 → 1537`，其中 `1480/1506` 個既有 ID 受影響。
- sound event：`1902 → 1968`，其中 `1674` 個受影響。
- block：`1168 → 1196`，其中 `170` 個受影響。
- particle type：`117 → 125`，其中 `113` 個受影響。
- entity type：`157 → 158`，其中 `27` 個受影響。
- block states：`29,873 → 32,366`；兩版都有效但指向不同 block 的 state ID 有 `5,186` 個。
- 報告中的第一個 divergence 是 state ID `24687`：26.1 為 `calcite`，26.2 為 `sulfur`；`24688`、`24689` 也有不同映射。[PR #1219 registry/block-state 分析](https://github.com/PrismarineJS/minecraft-data/pull/1219)

### 本專案推論

若 26.2 只 alias 到 26.1 的 `blocks`、`items`、`entities`、`particles`、`sounds`、`attributes`、`biomes` 或 `recipes`，封包仍可能被 parser 解出 JavaScript 物件，但 ID 會代表錯誤的名稱。對 chunk 而言，這種錯誤尤其危險：它可能產生看似合理的錯誤方塊，而不是立即丟 exception。[PR #1219 對 alias 風險的說明](https://github.com/PrismarineJS/minecraft-data/pull/1219)

因此本 fork 不採用單純的 26.1 data alias 作為 26.2 registry；26.2 的 blocks/items/entities/biomes/protocol 等原生 JSON 以 repository 內的 vendor snapshot 提供。這是本專案的工程決策，不是 upstream `minecraft-data` 已完成發布的證明。

PR #1219 也指出，`32,366` 個 block states 的 global palette 需要 `ceil(log2(32366)) = 15` bits；若 chunk implementation 實際遇到大於 16 bits 的情況，應先檢查 registry/state data 是否過時，再把它當成單純的 bit-width 問題。[PR #1219 palette 分析](https://github.com/PrismarineJS/minecraft-data/pull/1219)

## 目前 fork 的依賴與資料策略

### 目前實際設定

以下內容取自目前 working tree 的 [package.json](../package.json)：

| 依賴 | 目前 pin | 目的／代價 |
| --- | --- | --- |
| `minecraft-data` | `file:vendor/minecraft-data`（wrapper 以 `minecraft-data@3.113.0` 為 base） | 以 checked-in native 26.2 reports 覆蓋資料，避免把 26.2 registry 當成 26.1 alias。 |
| `minecraft-protocol` | `file:../node-minecraft-protocol`，source commit 從 `0dfb5768b444fd21e45135713edb2ed80279f696` 延伸 | local source fork 保留 `pc26_2` 實作，並補上 server-side `login_success.sessionId`；不依賴 postinstall 修改 `node_modules`。 |
| `prismarine-chunk` | `file:../prismarine-chunk`，commit `a06bda35b91cc8f90df39b5576c1ada5cf7cb4fc` | 採用 26.2 version mapping、fluid count 與 palette guard。 |
| `prismarine-physics` | `file:../prismarine-physics`，commit `4b8f466a468f698d7e55ae6b5f6b0cb84a20228e` | 讓 physics feature/version 判斷包含 26.2。 |

上述兩個 `robertvandervoort` commit 是本 fork 的個人使用 workaround pin，不應解讀為 PrismarineJS upstream 已接受的正式版本；這是本專案的維護風險。

### Checked-in vendor 與 local fork 流程

目前資料 snapshot 位於 [`vendor/minecraft-data/pc/26.2`](../vendor/minecraft-data/pc/26.2)，由 [`vendor/minecraft-data/index.js`](../vendor/minecraft-data/index.js) 在 runtime overlay 到 base package。它包含 attributes、biomes、block collision shapes、blocks、entities、items、particles、recipes、sounds、tints、materials、login packet、protocol 等 26.2 JSON。

四個 source package 以 `file:` dependency 管理，並由 [`.npmrc`](../.npmrc) 的 `install-links=true` 強制以實體 package 安裝；因此 `npm ci --ignore-scripts` 可重建，不需要 postinstall，也不會修改 `node_modules` 內的原始碼。`node-minecraft-protocol/src/server/login.js` 在 protocol 776+ 建立每個 server instance 共用的隨機 session UUID，並寫入 `login_success.sessionId`。[source fork](C:/Users/margo/IdeaProjects/node-minecraft-protocol/src/server/login.js)、[26.2 protocol schema](https://github.com/PrismarineJS/minecraft-data/blob/pc_26_2/data/pc/26.2/protocol.json)

最後由測試確認 `minecraft-data('26.2')` 的 protocol 是 `776`，data version 是 `4903`，並確認 `sulfur` block/item、`sulfur_cube` entity、`sulfur_caves` biome 可載入。

### 策略界線

**本專案推論**：這是適合 private fork 的可重現 source/vendor strategy。它假設使用者同時保留四個 sibling repository；若未來要發布 npm，應先將 `file:../...` 換成已推送且 immutable 的 Git SHA 或正式 upstream release，再重跑 clean-install 與完整矩陣。

這個策略保留 26.1 與舊版本的既有資料路徑，降低不必要的全面複製；但凡是 registry/block-state 相關資料都優先使用原生 26.2，避免 PR #1219 所述的 silent ID mismatch。

## 已知限制

1. **上游狀態未等同正式支援。** `minecraft-data` 的 26.2 工作仍以 [PR #1219](https://github.com/PrismarineJS/minecraft-data/pull/1219) 和 `pc_26_2` branch 形式存在；本 fork 固定 snapshot 以滿足個人使用，之後不會自動跟隨 upstream 修正。
2. **online-mode 尚未完成實證。** local `node-minecraft-protocol` fork 已補齊 server-side `sessionId` writer，並由 offline loopback 驗證；online-mode 的 Mojang session/auth semantics 仍需真實憑證或受控測試環境驗證。[source fork](C:/Users/margo/IdeaProjects/node-minecraft-protocol/src/server/login.js)
3. **vendor 是人工維護的 snapshot。** 上游 generator、vanilla report 或 protocol schema 若再修正，必須重新匯入並重新跑資料與封包驗證；不能只升級 npm semver 版本。
4. **chunk palette 仍是高風險區。** local `prismarine-chunk` fork 已通過 26.2 section/fluid/palette 單元測試與 Vanilla external smoke；state ID 對應、global palette、lighting 與跨版本 chunk decode 仍需正式 binary fixture。
5. **高階 API 範圍有限。** 目前目標是 protocol/data/runtime 相容，不新增 Sulfur Cube 專用的高階 Mineflayer API；Sulfur Cube 的所有互動行為仍由一般 entity/block/item API 暴露。
6. **新 entity metadata 仍需真實封包 fixture。** `sulfur_cube` 的 native entity ID/name 與 generated `metadataKeys` 已納入 snapshot，並通過資料 audit；仍需以 26.2 Vanilla entity metadata capture 驗證實際索引與值域。
7. **私有 fork 的維護責任。** 不建立 upstream PR 意味著修正版、依賴安全更新、26.2.x/後續版本變更都要在本 fork 內自行追蹤；Git dependency 使用 immutable commit 可提高重現性，但 transitive semver dependencies 仍可能漂移。

## 驗證計畫

### A. Install/bootstrap smoke test

在乾淨的 Node.js `>=22` 環境：

```powershell
npm ci --ignore-scripts
node -e "const d=require('minecraft-data')('26.2'); console.log(d.version, d.blocksByName.sulfur, d.itemsByName.sulfur, d.entitiesByName.sulfur_cube, d.biomesByName.sulfur_caves)"
```

驗收條件：clean install 成功；version metadata 為 protocol 776/dataVersion 4903；native 26.2 registry 可查到新 block/item/entity/biome；不依賴 postinstall 或既有 node_modules 修改。

### B. Pure data/schema tests

執行目前 fork 的 [`test/minecraft262Test.js`](../test/minecraft262Test.js)，確認：

- 26.2 data、registry、Sulfur 資料可載入。
- `login_success.sessionId`、`login.onlineMode`、`update_time.gameTime/clock`、`teams` 新欄位、`use_entity.usingSecondaryAction`、`spectator_action` 等 schema 存在。
- block state 可透過 `prismarine-chunk('26.2')` round-trip，且不因 state ID 大於 16 bits 的錯誤假設而失敗。

### C. Mineflayer adapter integration

執行 [`test/minecraft262IntegrationTest.js`](../test/minecraft262IntegrationTest.js)，以 local `minecraft-protocol` server 建立 26.2 client/server loopback，確認：

- login/configuration/play transition 可完成，server 不因 `sessionId` 缺少而在 UUID writer 失敗。
- spawn 後 client 送出 `player_loaded`。
- attack 使用獨立 `attack` packet；entity interaction 使用 26.2 `use_entity` 欄位。
- `update_time` 能正確更新 `bigAge`、dimension clock、`bigTime`、daylight-cycle。
- team packet 的新順序與 optional color 不會 silent decode 成錯誤欄位。

### D. Real vanilla 26.2 server

使用官方 26.2 server jar，在 Java 25 環境執行 Mineflayer 的現有 external test harness；`minecraft-data` 的 issue metadata 明確記錄 Java 25 要求。[issue #1197](https://github.com/PrismarineJS/minecraft-data/issues/1197)

重點情境：connect/login、configuration、spawn、chunk/lighting、inventory、entity attack/use、time update、team、respawn、spectator、game rules，以及 Sulfur/Sulfur Cube 相關 block/entity metadata。

### E. Registry/block-state correctness

用 vanilla 26.2 `--reports` 與 vendor JSON 做名稱、ID、數量比對；至少抽驗 PR #1219 報告的 divergence state IDs `24687`–`24689`，並測試 Sulfur、Potent Sulfur、Sulfur Spike、Cinnabar 系列和 26.1 既有方塊。chunk 驗證必須檢查「解碼成功但名稱正確」，不能只檢查沒有 exception。[PR #1219 divergence 報告](https://github.com/PrismarineJS/minecraft-data/pull/1219)

### F. Existing-version regression

最後執行完整既有 test suite，涵蓋 1.8.8 到 26.1；26.2 相關分支必須以 feature/version guard 隔離，不能改變舊版 packet shape。通過條件是：26.2 pure/integration/vanilla tests 全部通過，且舊版本沒有新增失敗。

## 交付判準

本 private fork 可宣稱「個人用途的 26.2 支援」前，至少必須同時滿足：

1. install 可從 checked-in vendor 重建 26.2 runtime data。
2. protocol 776 與 data version 4903 正確，login/configuration/play 可完成。
3. 上述高風險封包沒有 schema desync，尤其是 `teams`、`update_time`、`use_entity`、`login_success`。
4. registry/block-state 以 native 26.2 data 解碼，不能依賴 26.1 aliases。
5. chunk、lighting、inventory、entity interaction 與 time 的 integration/vanilla 驗證完成。
6. 既有 1.8.8–26.1 regression suite 維持通過。

## 本次實作與驗證結果

本次已依上述策略完成 private fork 實作；四個 local branch 有可追溯的 source/data 變更，尚未建立 upstream PR 或推送遠端：

- `lib/version.js` 與文件支援版本加入 `26.2`。
- `vendor/minecraft-data/pc/26.2` checked-in 原生資料 snapshot，透過 vendor package overlay 到 base runtime；entity metadata extractor 也已保留 26.2 的 pose/shared-flags/sleeping/fishing metadata。
- `node-minecraft-protocol`、`prismarine-chunk`、`prismarine-physics` 由 local source fork 提供；offline protocol server 的 `login_success.sessionId` 由 source helper 產生每個 server 共用的隨機 session UUID。
- Mineflayer adapter 已處理 26.2 的 attack/use_entity、respawn payload、teams、clock update 與 26.2 weather test timing。

截至 2026-09-05 的驗證：

| 驗證 | 結果 |
| --- | --- |
| `npm run lint` | 通過 |
| `npm ci --ignore-scripts` | 通過；local file packages 以 `install-links=true` 實體安裝 |
| 26.2 pure + local protocol integration | `10 passing` |
| `minecraft-data` full tests | `1890 passing, 1 pending` |
| `prismarine-chunk` full tests | `348 passing` |
| `prismarine-physics` full tests | `19 passing` |
| 官方 vanilla 26.2 external suite | 先前 `51 passing`；重新納入排除案例的本輪 run 在完成前中斷，已暴露 anvil 與部分 dig timing 待修缺口 |
| existing internal suite | `712 passing, 41 pending`；另有 1 個既有 1.19 `switchWorld respawn` timeout，單項重跑 `1 passing`，判定為時序波動 |

因此目前可宣稱的是「此 private fork 已通過 26.2 data/schema、loopback 與部分 Vanilla 核心相容性驗證」，尚不能宣稱 external 全矩陣完成，也不是 upstream 或 npm 發布線的正式支援狀態。後續若要升級 26.2.x 或重新產生資料，優先重做 A、B、C、D、E 五組驗證；若 internal suite 的 1.19 timeout 連續重現，才另開獨立的舊版測試穩定性調查。

---

## 2026-09-06 上游重新核對與校正

本節是對前文的增補；前文的 private-fork 實作紀錄保留不變。下列結論以 2026-09-06 查到的官方 Minecraft/Mojang server jar、官方產生的 vanilla reports，以及 PrismarineJS 官方 repository、issue、PR、branch 和 commit 為準。private fork 的 vendor snapshot、測試結果和未合併的外部 fork 只代表本專案或提案狀態，不當作 upstream 已完成支援的證據。

### 1. 官方版本常數與 Java 要求

| 欄位 | 26.2 核對結果 | 一手證據與日期 | 不確定性 |
| --- | --- | --- | --- |
| 發布 | 2026-06-16 | [Minecraft Java Edition 26.2](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-2)，頁面發布日期 2026-06-16 | 無 |
| protocol | `776` | 官方 26.2 server jar 的 `SharedConstants`；PrismarineJS [issue #1197](https://github.com/PrismarineJS/minecraft-data/issues/1197)（開啟 2026-06-16）亦記錄 `776` | 無 |
| data version / world version | `4903` | 官方 26.2 server jar 的 `SharedConstants`；issue #1197 亦記錄 `4903` | 無 |
| Java | `25` | 官方 [26.1 公告](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-1) 明確說明遊戲要求 Java 25；issue #1197 的 26.2 metadata 亦記錄 Java 25 | 26.2 公告本身沒有再次列出最低 Java 版本，因此「26.2 要求 Java 25」由官方 26.1 基線加 26.2 metadata 支持，而非 26.2 頁面單獨明文確認 |
| data pack / resource pack | `107.1` / `88.0` | 官方 26.2 公告 technical changes | 這兩個格式版本不是 data version `4903`，不可混稱 |
| server management protocol | `3.0.0` | 官方 26.2 公告 technical changes | 與遊戲連線 protocol `776` 無關 |

官方 26.2 release page 也列出可下載的 [server.jar](https://piston-data.mojang.com/v1/objects/823e2250d24b3ddac457a60c92a6a941943fcd6a/server.jar)。本次以該 jar 及官方 26.1 [server.jar](https://piston-data.mojang.com/v1/objects/3872a7f07a1a595e651aef8b058dfc2bb3772f46/server.jar) 執行 Mojang 內附 data generator 的 `net.minecraft.data.Main --reports`，比較 `packets.json`、`registries.json` 和 `blocks.json`；報告只寫入工作目錄下的暫存資料，沒有加入 repo。

### 2. Protocol/schema：官方 wire 變更與目前 Prismarine schema 的落差

官方 packet report 顯示，26.2 相對 26.1 的 packet ID 變動中，serverbound play packet 以相同 ID `62` 將 `minecraft:spectate_entity` 改名為 `minecraft:spectator_action`。官方 26.2 jar 的 packet record/class signature 另外確認以下欄位形狀：

| 區域 | 官方 26.2 jar 顯示的形狀 | 目前 `pc_26_2`/`pc26_2` upstream 狀態 |
| --- | --- | --- |
| login success | `sessionId: UUID` | 已在目前 [minecraft-data 26.2 protocol.json](https://raw.githubusercontent.com/PrismarineJS/minecraft-data/pc_26_2/data/pc/26.2/protocol.json) 出現 |
| play login | `onlineMode: boolean` | 已在目前 protocol.json 出現 |
| teams | display name、prefix、suffix、visibility、collision、`Optional<TeamColor>`、最後才是 options byte；TeamColor 是 0–15 的 team color | 目前 protocol.json 和 [Mineflayer team adapter](https://raw.githubusercontent.com/PrismarineJS/mineflayer/pc26_2/lib/plugins/team.js) 仍使用舊的 name/flags/formatting/prefix/suffix 形狀；[PR #1219](https://github.com/PrismarineJS/minecraft-data/pull/1219) reviewer 於 2026-08-26 明確指出此缺口 |
| spectator | `OptionalInt spectateEntityId` | PR #1219 指出應為 `spectator_action`；目前 protocol.json 仍保留 `spectate_entity` |
| time | `ClientboundSetTimePacket` record 為 `gameTime` 加 clock update map | 目前 protocol.json 仍是 `age` 加 `clockUpdates`；[Mineflayer time adapter](https://raw.githubusercontent.com/PrismarineJS/mineflayer/pc26_2/lib/plugins/time.js) 仍讀 `packet.time`、`packet.age`、`packet.tickDayTime`，所以不能把前文的 clock/gameTime 描述解讀成 upstream 已完成 |
| game rule | clientbound class 使用 `Map<game rule key, String> values`；serverbound entry 有 game-rule key 與 value | 目前 protocol.json 仍以 `values`/`entries` array of `GameRule` 表達；是否已能正確處理 26.2 全部 serializer semantics，需再用 vanilla fixture 驗證 |
| entity interaction | 官方 jar 的 interact packet 含 `entityId`、hand、location、`usingSecondaryAction` | Mineflayer/upstream 是否已完整涵蓋所有 26.2 interaction path，不能只由 login 成功推定；應保留實際 packet fixture 測試 |
| recipe display | upstream [Mineflayer issue #3952](https://github.com/PrismarineJS/mineflayer/issues/3952) 回報 `recipe_book`/`declare_recipes` 的 `SlotDisplay`/`RecipeDisplay` 變更 | exact 26.2 recipe semantics 在 upstream 仍屬待處理/待驗證 |

一項重要校正是：將目前 `minecraft-data` 26.2 `protocol.json` 與其 26.1 對照，實際只看到兩個已更新的 packet definition：`packet_success` 增加 `sessionId`，`packet_login` 增加 `onlineMode`。因此，PR #1219 討論中列出的 teams、spectator、time 等官方 jar 變更，不應被誤寫成「目前 generated upstream protocol schema 已全部完成」。這也是目前 Mineflayer 26.2 branch 可作為工作中整合線、但不能等同於 master/npm 正式完整支援的直接證據。

### 3. Registry、資料表與 block-state

以官方 jar 產生的 `registries.json` 對照，26.1 → 26.2 的主要 registry 數量如下：

| registry | 26.1 | 26.2 | 變化 |
| --- | ---: | ---: | ---: |
| item | 1506 | 1537 | +31 |
| sound_event | 1902 | 1968 | +66 |
| block | 1168 | 1196 | +28 |
| particle_type | 117 | 125 | +8 |
| block_type | 263 | 265 | +2 |
| game_event | 60 | 61 | +1 |
| attribute | 35 | 40 | +5 |
| data_component_type | 110 | 111 | +1 |
| entity_type | 157 | 158 | +1 |
| block_entity_type | 49 | 49 | 0 |

官方 report 也顯示 block states 由 `29,873` 增至 `32,366`。以 ID 交集比較，`5,186` 個既有 ID 在兩版對應到不同 block；第一個 divergence 是 `24687: calcite → sulfur`、`24688: tinted_glass → potent_sulfur`、`24689: powder_snow → potent_sulfur`。這不是單純新增尾端 ID，故把 26.1 registry alias 當成 26.2 完整資料是不安全的。

官方 26.2 registry 中可直接確認 `sulfur`、`potent_sulfur`、Cinnabar/Sulfur 系列 block/item、`sulfur_cube` entity、Sulfur 相關 particle、以及五個新 attribute（`air_drag_modifier`、`below_name_distance`、`bounciness`、`friction_modifier`、`name_tag_distance`）。這些遊戲內容與 data-driven `minecraft:sulfur_cube_archetype` registry 也見於[官方 26.2 technical changes](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-2)。

### 4. Chunk wire format：已知修正與尚未定案的 palette 位寬

- [Mineflayer issue #3952](https://github.com/PrismarineJS/mineflayer/issues/3952)（開啟 2026-07-26，更新至 2026-09-01）提供五份真實 26.2 chunk capture：每個 section header 有 `blockCount` 後新增的 `fluidCount`，若只讀 blockCount 會整個 section 後移 2 bytes；作者回報 patched parser 對 5/5 captures 成功解析。這是目前最直接的 upstream 26.2 chunk wire 證據。
- 但同一 issue 明確說尚未驗證 `fluidCount` 是否已在 26.1 引入，也沒有捕獲 global palette，因此「global palette 需要 15 bits」或「需要 17 bits」都不能在本研究中定稿。PR #1219 reviewer 以官方 jar report 的 `32,366` states 推導 15 bits；未合併的 [prismarine-chunk PR #331](https://github.com/PrismarineJS/prismarine-chunk/pull/331) 則以 `>65536` 的假設提出 17-bit guard。這兩者是互相衝突的 upstream 討論，應標成 unresolved，而非任一方的官方結論。
- PR #331 目前仍 open，且是外部 fork `robertvandervoort:fix/26.2-support`；官方 `prismarine-chunk` master 沒有 26.2 branch。故前文「chunk pin 已處理」是 private fork 的實作紀錄，不等於 PrismarineJS 官方 master 已合併。

### 5. Entity metadata：新 entity 已在 registry，完整 metadata 尚未被一手資料證實

官方 report 確認 entity registry 新增 `minecraft:sulfur_cube`；然而 Mojang 公開的 vanilla reports 沒有一份專門列出 Sulfur Cube metadata index/type 的報告。本次可核對到的 upstream 資料中，`minecraft-data` 26.2 branch 只有 version/protocol 資料，其他資料路徑在 PR #1219 仍有 26.1 alias；[Mineflayer entities adapter](https://raw.githubusercontent.com/PrismarineJS/mineflayer/pc26_2/lib/plugins/entities.js) 是依 registry entity 的 `metadataKeys` 泛化解碼。

因此目前能確定的是「Sulfur Cube 名稱/registry entry 存在」；不能確定的是「upstream 已有正確且完整的 Sulfur Cube metadataKeys 及高階行為」。metadata index/type 應以真實 26.2 vanilla entity metadata capture 或後續官方 Prismarine 資料更新補證。前文 private vendor 的 entity metadata 或本地測試，不提高 upstream completeness 的證據等級。

### 6. 截至 2026-09-06 的 PrismarineJS upstream 狀態

下表的 SHA 是 2026-09-06 以 repository refs/API read-only 核對的 branch head；「open」代表尚未 merge 到 master。

| repository | 26.2 ref/head | PR 或相關 issue | 狀態 |
| --- | --- | --- | --- |
| [minecraft-data](https://github.com/PrismarineJS/minecraft-data) | branch [`pc_26_2`](https://github.com/PrismarineJS/minecraft-data/tree/pc_26_2), `4dd8762a45b97dafdb216b8d7a95ab92379e2c68`；commit [fix: restore 26.2 login protocol fields](https://github.com/PrismarineJS/minecraft-data/commit/4dd8762a45b97dafdb216b8d7a95ab92379e2c68)，2026-08-11 | [PR #1219](https://github.com/PrismarineJS/minecraft-data/pull/1219) | open；未 merge，且 schema/data 尚未涵蓋所有官方 26.2 變更 |
| [node-minecraft-protocol](https://github.com/PrismarineJS/node-minecraft-protocol) | branch [`pc26_2`](https://github.com/PrismarineJS/node-minecraft-protocol/tree/pc26_2), `0dfb5768b444fd21e45135713edb2ed80279f696`；commit 2026-08-11 | [PR #1496](https://github.com/PrismarineJS/node-minecraft-protocol/pull/1496) | open；未 merge |
| [mineflayer](https://github.com/PrismarineJS/mineflayer) | branch [`pc26_2`](https://github.com/PrismarineJS/mineflayer/tree/pc26_2), `c77e6d5ac22d0efd9872fa7b5f9165e0b7a3d0c6`；commit [Update to version 26.2](https://github.com/PrismarineJS/mineflayer/commit/c77e6d5ac22d0efd9872fa7b5f9165e0b7a3d0c6)，2026-06-16 | [PR #3926](https://github.com/PrismarineJS/mineflayer/pull/3926) | open；未 merge到 master |
| [prismarine-chunk](https://github.com/PrismarineJS/prismarine-chunk) | 官方 master `ce60c5fcd09c6198e28de011eec3f8811b96923d`（2026-07-31）；無官方 26.2 branch | [PR #331](https://github.com/PrismarineJS/prismarine-chunk/pull/331) | open；外部 fork，未 merge |
| [prismarine-physics](https://github.com/PrismarineJS/prismarine-physics) | 官方 master `a5353a922f1dee075aa797cb53be31919f9e1f46`（2026-07-28）；無官方 26.2 branch | [PR #138](https://github.com/PrismarineJS/prismarine-physics/pull/138) | open；外部 fork，未 merge |
| [mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder) | master `e37bff8992dd2fc85cf593dc4593cbb81fb8e7a6`；無 26.2 branch | [issue #366](https://github.com/PrismarineJS/mineflayer-pathfinder/issues/366) | open；是高階 GoalFollow 行為問題，不是已完成的 26.2 protocol PR |
| node-minecraft-data / prismarine-entity / prismarine-registry / prismarine-world | 截至查核沒有 26.2 branch/head | 各官方 repository | 未發現專門的 26.2 merge 狀態；不能據此宣稱完整支援或完全不支援 |

所以「目前 upstream 各相關 repo 的狀態」應精確表述為：`minecraft-data`、`node-minecraft-protocol`、`mineflayer` 有可工作的 26.2 branch 與未合併 PR；chunk/physics 只有未合併的外部 fork PR；pathfinder 有開放的高階行為 issue；其餘相關 repo 沒有可核對的專門 26.2 merge。這比「upstream 沒有 26.2」或「upstream 已正式支援 26.2」都更準確。

### 7. 完整支援的目前判定

截至本次核對，不能把 PrismarineJS upstream master/npm 線宣稱為 Minecraft Java 26.2 的完整支援。最低尚待 upstream 或 private fork 以一手 fixture 補齊/確認的項目是：teams 新 wire order 與 optional TeamColor、spectator_action rename、time/game-rule serializer、recipe display、`fluidCount` 的版本 guard、global palette 真實位寬、以及 Sulfur Cube metadataKeys。前文的 private-fork 測試結果仍有效地描述該 fork 在當時測試範圍內的狀態，但不應覆寫上述 upstream status 與不確定性。

## 2026-09-07 private-fork 驗證更新

本輪針對實際使用 `npm run mocha_test -- --grep '^mineflayer_external 26\\.2v' test/externalTest.js` 時的終端無法結束問題完成診斷。主要原因不是單一無限迴圈，而是 26.2 `digEverything` 原始 registry 展開為 1,159 個逐方塊名稱，加上 timeout 後共享 bot、child example 與 Java server 未被一致清理，造成長時間工作與失敗 cascade。修正 registry block/item 分離後，按 resource name 去重並驗證後的通用矩陣是 1,016 個 item-backed cases；現在一般 external run 預設只執行 59 個功能案例，完整 block matrix 必須以 `MINEFLAYER_RUN_EXHAUSTIVE_BLOCK_TESTS=1` 明確啟用。

已落地的硬化包括 Windows process-tree cleanup、SIGINT/SIGTERM cleanup、Mocha failure fail-fast、AbortController listener cleanup、bounded hunger/child/entity waits、modern signed-chat matching、26.2 merchant 多槽更新同步、anvil 結果的 cursor/slot/full-sync 同步，以及 block/item registry 分離下的正確 item lookup。驗證結果為：預設 Vanilla external `59 passing (2m)`、anvil/furnace/trade/placeEntity high-risk `10 passing`、Sulfur/Cinnabar 28 個新增可挖方塊 `28 passing`、代表性 exhaustive batch `36 passing (2m)`、Mineflayer internal/pure/integration/cleanup `731 passing, 41 pending`，並以 Ctrl+C 與完整長測後的程序檢查驗證無殘留 Node/Java server process。

後續診斷又確認一個獨立的跨案例競態：`digEverything` 重用同一個世界時，client 的 `blockAt` cache 可能仍顯示前一案例的方塊，導致下一案例在 server 尚未完成 `/setblock` 時直接開始放置。批次案例現在先以 server-side chat marker 確認 `/setblock air` 已執行，再等待放置後的 block name 與預期一致；挖掘工具也依 block material 選擇，而不是一律使用 diamond pickaxe。inventory 的 cursor 回收則加入 bounded progress guard，避免 server 不回應時卡在無限 `while`。

這些結果證明 private fork 在目前測試範圍內可用，但不等同 Paper/Spigot、online-mode、fuzz、長時間 resource leak 或效能 gate 已完成；完整支援聲明仍須完成研究中列出的剩餘證據。

## 2026-09-08 `docs/log.txt` 與長測檢查

檢查目前工作區時，`docs/log.txt` 不存在，`rg --files docs` 也沒有列出該檔案。因此不能把它當成已讀取的驗證 log；先前文件中記錄的 `20 passing`、`1 failing`、`1055 pending` 只保留為對話中既有失敗的診斷背景，不是本次最終證據。

本次以官方 Vanilla 26.2 server 執行完整 opt-in 矩陣：

```powershell
$env:MINEFLAYER_RUN_EXHAUSTIVE_BLOCK_TESTS = '1'
Remove-Item Env:MINEFLAYER_EXHAUSTIVE_BLOCK_START -ErrorAction SilentlyContinue
Remove-Item Env:MINEFLAYER_EXHAUSTIVE_BLOCK_END -ErrorAction SilentlyContinue
npm run mocha_test -- --grep '^mineflayer_external.*26\\.2v' test/externalTest.js
```

結果為 `1016 passing (30m)`，沒有 failure、pending、timeout 或 loop。測試覆蓋按 resource name 去重後的全部 item-backed block matrix；對流體、作物、附著方塊、低光蘑菇、infested silverfish、kelp substrate、gravity/slow-tool 方塊均使用專項 fixture。長測結束時 Vanilla server 正常 disconnect、save world、stop，隨後的程序查詢沒有符合條件的 Node/Java server process。

長測中確認並修正的場景污染／競態包括：三層流體清理、每 case 飛行與腳下支撐恢復、銀魚清除、固定 anchor 防止跌出 26.2 世界底界，以及 trial spawner/vault 的合法 75 秒挖掘上限。這證明 external runner 不會再因這些已知案例無限等待，但 Paper/Spigot、online-mode、fuzz、長時間 reconnect/resource leak 與效能 gate 仍未完成實證。

## 2026-09-08 fork 同步與合併後驗證

六個 private fork 均已將必要變更合併到本地 `master`，並推送到各自的 `origin/master`；沒有建立或推送 upstream PR：

| repository | `origin/master` HEAD | upstream 同步結果 |
| --- | --- | --- |
| node-minecraft-protocol | `8e8e4c7` | 無 upstream-only commit |
| prismarine-item | `2391920` | 無 upstream-only commit |
| prismarine-physics | `4b8f466` | 無 upstream-only commit |
| prismarine-chunk | `b4584b2` | 無 upstream-only commit |
| minecraft-data | `cf3d291c` | 已合併 upstream master 更新 |
| mineflayer | `74142b7e` | 已合併 upstream master 更新 |

合併後 Mineflayer 26.2 Vanilla external smoke 為 `63 passing (2m)`；furnace 改用 26.2 的 `/data merge`、`cooking_time_spent`，useChests 改用 `/item replace`，兩者均已重跑通過。Mineflayer lint 與 26.2 pure/integration/cleanup 測試為 `13 passing`。所有測試 server 都正常 disconnect、save、stop，工作樹與六個 fork 的 `diff --check` 均乾淨。

這次同步不改變前述限制：Paper/Spigot、online-mode、fuzz、長時間 reconnect/resource leak 與效能 gate 尚未取得完整實證，因此目前定案為「private fork 的 Vanilla 26.2 支援已整合並驗證」，不是 upstream/npm 線的完整支援聲明。
