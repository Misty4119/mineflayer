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
| `login` → client | `success` 在 `uuid`、`username`、`properties` 後新增 `sessionId: UUID`。[26.2 schema](https://github.com/PrismarineJS/minecraft-data/blob/pc_26_2/data/pc/26.2/protocol.json) | server fixture 若仍只寫 26.1 欄位，serializer 會因缺少 UUID 失敗；本 fork 的 postinstall 另行處理本地測試 server，詳見下文。 |
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
| `minecraft-data` | `3.113.0` | 使用含有 26.2 version metadata 的資料框架，再由 postinstall 注入 repository 內的 native 26.2 data。 |
| `minecraft-protocol` | `github:PrismarineJS/node-minecraft-protocol#0dfb5768b444fd21e45135713edb2ed80279f696` | 固定使用 `pc26_2` 實作的 immutable commit；不依賴會漂移的 branch head。來源分支的版本表見 [pc26_2 version.js](https://raw.githubusercontent.com/PrismarineJS/node-minecraft-protocol/pc26_2/src/version.js)。 |
| `prismarine-chunk` | `github:robertvandervoort/prismarine-chunk#bcf228b3be07f5105c170ab25f2b4ee723718230` | 採用已包含 26.2 version mapping 與相關 palette guard 調整的 commit；仍需用實際 chunk/state 測試確認。 |
| `prismarine-physics` | `github:robertvandervoort/prismarine-physics#e5597f73f4aa76a621a18b8f14708cc8b6dd33a4` | 讓 physics feature/version 判斷包含 26.2。 |

上述兩個 `robertvandervoort` commit 是本 fork 的個人使用 workaround pin，不應解讀為 PrismarineJS upstream 已接受的正式版本；這是本專案的維護風險。

### Checked-in vendor 與 postinstall 流程

目前資料 snapshot 位於 [`vendor/minecraft-data/pc/26.2`](../vendor/minecraft-data/pc/26.2)。它包含 attributes、biomes、block collision shapes、blocks、entities、items、particles、recipes、sounds、tints、materials、login packet、protocol 等 26.2 JSON。

[`tools/install-minecraft-data-26.2.mjs`](../tools/install-minecraft-data-26.2.mjs) 由 [package.json](../package.json) 的 `postinstall` 執行，流程如下：

1. 將 checked-in vendor data 複製到已安裝的 `minecraft-data/minecraft-data/data/pc/26.2`。
2. 以已安裝的 `dataPaths.pc['26.1']` 為基底建立 `dataPaths.pc['26.2']`；只有有 native 26.2 檔案的資料表切換到 `pc/26.2`，其餘仍沿用原本 data path。
3. 確保 `sendsPlayerLoadedPacket` feature 對 26.2 可用，然後呼叫 `minecraft-data` 的 generator 重建 runtime data loader。
4. 修補已安裝 `minecraft-protocol` 的 server login writer：26.2 的 `login_success` schema 需要 `sessionId`，而 pinned `pc26_2` source 的 server path 仍只寫舊三個欄位；目前 postinstall 為 protocol 776 的 offline test server 補上 deterministic session UUID。[pinned branch server/login.js](https://raw.githubusercontent.com/PrismarineJS/node-minecraft-protocol/pc26_2/src/server/login.js)、[26.2 protocol schema](https://github.com/PrismarineJS/minecraft-data/blob/pc_26_2/data/pc/26.2/protocol.json)
5. 最後驗證 `minecraft-data('26.2')` 的 protocol 是 `776`，並確認 `sulfur` block/item、`sulfur_cube` entity、`sulfur_caves` biome 可載入。

### 策略界線

**本專案推論**：這是一個適合 private fork 的 bootstrap workaround，不是可直接發布到 npm 的完整 distribution strategy。它假設使用者在 repository 根目錄執行 install，且能讀取 checked-in vendor 與 GitHub dependencies；`node_modules` 內的 postinstall patch 也會在每次安裝後重新套用。

這個策略保留 26.1 與舊版本的既有資料路徑，降低不必要的全面複製；但凡是 registry/block-state 相關資料都優先使用原生 26.2，避免 PR #1219 所述的 silent ID mismatch。

## 已知限制

1. **上游狀態未等同正式支援。** `minecraft-data` 的 26.2 工作仍以 [PR #1219](https://github.com/PrismarineJS/minecraft-data/pull/1219) 和 `pc_26_2` branch 形式存在；本 fork 固定 snapshot 以滿足個人使用，之後不會自動跟隨 upstream 修正。
2. **protocol branch 的 server helper 不完整。** pinned `node-minecraft-protocol` branch 的 server login code 未自行填入 26.2 `sessionId`；postinstall patch 只保證本 fork 的 offline integration fixture 能序列化這個欄位，不代表 online-mode/session authentication semantics 已完整驗證。[branch server/login.js](https://raw.githubusercontent.com/PrismarineJS/node-minecraft-protocol/pc26_2/src/server/login.js)
3. **vendor 是人工維護的 snapshot。** 上游 generator、vanilla report 或 protocol schema 若再修正，必須重新匯入並重新跑資料與封包驗證；不能只升級 npm semver 版本。
4. **chunk palette 仍是高風險區。** 目前 custom `prismarine-chunk` pin 只處理必要的 version/guard 路徑；state ID 對應正確性、section palette、global palette、lighting 與跨版本 chunk decode 仍需真實 26.2 chunk fixture 和 vanilla server 驗證。
5. **高階 API 範圍有限。** 目前目標是 protocol/data/runtime 相容，不新增 Sulfur Cube 專用的高階 Mineflayer API；Sulfur Cube 的所有互動行為仍由一般 entity/block/item API 暴露。
6. **新 entity metadata 仍需後續補齊。** `sulfur_cube` 的 native entity ID/name 已可查詢，但目前 snapshot 沒有可確認的 `metadataKeys`；因此其高階 metadata 事件不宣稱完整支援。若個人用途需要完整追蹤，下一步應以 26.2 vanilla entity metadata fixture 對照並補上專用測試。
7. **私有 fork 的維護責任。** 不建立 upstream PR 意味著修正版、依賴安全更新、26.2.x/後續版本變更都要在本 fork 內自行追蹤；Git dependency 使用 immutable commit 可提高重現性，但 transitive semver dependencies 仍可能漂移。

## 驗證計畫

### A. Install/bootstrap smoke test

在乾淨的 Node.js `>=22` 環境：

```powershell
npm install
node -e "const d=require('minecraft-data')('26.2'); console.log(d.version, d.blocksByName.sulfur, d.itemsByName.sulfur, d.entitiesByName.sulfur_cube, d.biomesByName.sulfur_caves)"
```

驗收條件：postinstall 成功；version metadata 為 protocol 776/dataVersion 4903；native 26.2 registry 可查到新 block/item/entity/biome；generator 沒有遺漏資料 path。

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

本次已依上述策略完成 private fork 實作，且沒有建立 upstream PR 或提交 commit：

- `lib/version.js` 與文件支援版本加入 `26.2`。
- `vendor/minecraft-data/pc/26.2` checked-in 原生資料 snapshot，搭配 `postinstall` 重建已安裝的 `minecraft-data` runtime；安裝腳本也恢復現有 entity metadata key，避免 26.2 vanilla 的 pose/shared-flags/sleeping/fishing metadata 被靜默忽略。
- `minecraft-protocol`、`prismarine-chunk`、`prismarine-physics` 固定到支援 26.2 的 immutable commit；本地 offline protocol server 的 `login_success.sessionId` 由 postinstall 以 deterministic offline UUID 補齊。
- Mineflayer adapter 已處理 26.2 的 attack/use_entity、respawn payload、teams、clock update 與 26.2 weather test timing。

截至 2026-09-05 的驗證：

| 驗證 | 結果 |
| --- | --- |
| `npm run lint` | 通過 |
| 26.2 pure + local protocol integration | `6 passing` |
| 官方 vanilla 26.2 external suite | `51 passing` |
| existing internal suite | `712 passing, 41 pending`；另有 1 個既有 1.19 `switchWorld respawn` timeout，單項重跑 `1 passing`，判定為時序波動 |

因此目前可宣稱的是「此 private fork 已通過個人用途所需的 Minecraft Java 26.2 核心相容性與 vanilla 驗證」，而不是 upstream 或 npm 發布線的正式支援狀態。後續若要升級 26.2.x 或重新產生資料，優先重做 A、B、C、D、E 五組驗證；若 internal suite 的 1.19 timeout 連續重現，才另開獨立的舊版測試穩定性調查。
