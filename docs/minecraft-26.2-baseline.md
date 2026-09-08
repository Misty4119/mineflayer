# Minecraft Java 26.2 驗證基線

更新日期：2026-09-08

這份文件記錄本次 private fork 執行 26.2 支援工作的可重現基線。它不等同於最終完整支援聲明；尚未完成的項目仍以 `minecraft-26.2-plan.md` 的 Definition of Done 為準。

## 執行環境

| 項目 | 值 |
| --- | --- |
| OS | Windows |
| Node.js | v24.19.0 |
| npm | 11.17.0 |
| Java | 25.0.3 LTS |
| 官方 server jar | `server_jars/minecraft_server.26.2.jar` |
| server jar SHA-256 | `CDACDFB25898DE5E4B4B0E5DDCC2722F77067E46605709C2D886C000EBB63EC5` |

## 工作分支與初始 HEAD

| Repository | Branch | 初始 HEAD |
| --- | --- | --- |
| mineflayer | `codex/minecraft-26-2-mineflayer` | `144d06ec438a11ceb7c833af719a97127fea7c36` |
| minecraft-data | `codex/minecraft-26-2-data` | `fc2b5b89012138deaf777aa0cc68474455b8c323` |
| node-minecraft-protocol | `pc26_2` → local 26.2 fork | `0dfb5768b444fd21e45135713edb2ed80279f696` |
| prismarine-chunk | `codex/minecraft-26-2-chunk` | `ce60c5fcd09c6198e28de011eec3f8811b96923d` |
| prismarine-physics | `codex/minecraft-26-2-physics` | `a5353a922f1dee075aa797cb53be31919f9e1f46` |

## 2026-09-08 working-tree audit

目前實際依賴的 local source 狀態如下；protocol 與 item 的 26.2 變更仍未提交，故尚未達到可發布的 immutable provenance：

| Repository | Current branch/HEAD | Working tree |
| --- | --- | --- |
| node-minecraft-protocol | `master` / `ac7854f2da82d11a5bddc0ee61aa8b120380b4de` | dirty，含 26.2 protocol/session/serializer 變更 |
| prismarine-item | `master` / `0f2ee79` | dirty，含 26.2 typed component/enchantment/anvil 變更 |
| minecraft-data | `codex/minecraft-26-2-data` / `9ae45ef3c3026859f5301c943347ae0dfb828222` | clean |
| prismarine-chunk | `codex/minecraft-26-2-chunk` / `a06bda35b91cc8f90df39b5576c1ada5cf7cb4fc` | clean |
| prismarine-physics | `codex/minecraft-26-2-physics` / `4b8f466a468f698d7e55ae6b5f6b0cb84a20228e` | clean |

## 官方資料 provenance

使用官方 26.2 server jar 執行 Mojang data generator：

```text
java -DbundlerMainClass=net.minecraft.data.Main -jar minecraft_server.26.2.jar --reports
```

產生的 reports 暫存於：

```text
C:\Users\margo\AppData\Local\Temp\minecraft-data-generator-1968ae157fc1404e9eeefc38142d15f7\generated\reports
```

與 26.2 資料核對的 registry 數量：blocks 1196、items 1537、entities 158、sounds 1968、particles 125、attributes 40、biomes 66。blocks/items/entities 的 ID 與官方報告逐項比對無差異；block-state shift 另外抽驗 state IDs 24687–24689。

## 已通過的基線測試

- `minecraft-data/tools/js`: 全量 `npm test`，包含 26.2 data integrity tests。
- `prismarine-chunk`: 全量 `npm test`，包含 26.2 fluid count、palette guard 與 block-state round-trip。
- `prismarine-physics`: 全量 `npm test`，包含 26.2 feature gate 與 scaffolding regression。
- Mineflayer：26.2 pure protocol tests、serializer golden tests、adapter integration tests 通過。
- Mineflayer：`npm ci --ignore-scripts` clean install 通過；四個 `file:` source/vendor package 由 `install-links=true` 實體安裝。

## 尚未作為完成證據的項目

- Paper/Spigot 26.2 實際伺服器矩陣。
- online-mode 的真實 session/auth 流程。
- 官方封包 capture 所產生的完整 chunk fixture、global palette 與 lighting/heightmap fixture。
- malformed packet fuzz、長時間 reconnect/resource leak、load profile 與效能 gate。
- `node-minecraft-protocol`、`prismarine-item` 的 local 26.2 working-tree 變更尚未整理成 immutable commit/provenance。
- 完整 Mineflayer external suite 的非 26.2 既有環境敏感案例需重新分類並留下 log。

## 2026-09-08 驗證更新

本輪修正 external runner 在 Windows 中斷時的 cleanup，以及失敗後共享 bot 繼續發包造成的 cascade。`SIGINT` 中斷長測試後，未留下符合條件的 Node/Java server process；cleanup helper 也有 wrapper 不回報 close 時的回歸測試。

| 驗證 | 結果 |
| --- | --- |
| `npm run lint` | 通過 |
| Mineflayer internal + 26.2 pure/integration/cleanup | `731 passing, 41 pending` |
| 官方 Vanilla 26.2 預設 external | `59 passing (2m)` |
| 26.2 inventory high-risk（anvil/furnace/trade/placeEntity） | `10 passing` |
| Sulfur/Cinnabar 28 個可挖新方塊 | `28 passing (1m)` |
| 26.2 `digEverything` exhaustive | 完整按 resource name 去重的 `1016 passing (30m)`；無 failure、pending 或 timeout |
| `npm audit --omit=optional` | `1 low, 9 moderate, 4 high, 0 critical`；未執行破壞性 `audit fix --force` |

`digEverything` 的完整 1,016-case item-backed gate 透過下列命令明確啟用，避免一般測試被原始 1,159 個 registry 展開案例長時間阻塞：

```powershell
$env:MINEFLAYER_RUN_EXHAUSTIVE_BLOCK_TESTS = '1'
Remove-Item Env:MINEFLAYER_EXHAUSTIVE_BLOCK_START -ErrorAction SilentlyContinue
Remove-Item Env:MINEFLAYER_EXHAUSTIVE_BLOCK_END -ErrorAction SilentlyContinue
npm run mocha_test -- --grep '^mineflayer_external.*26\\.2v' test/externalTest.js
```

本輪也修正了 26.2 block/item registry ID 分離造成的測試 false positive：測試現在按 resource name 取得 item，依 block material 選擇對應 mineable tool，並檢查實際放置後的 block name；沒有同名可放置 item 的 fluids、crops、wall-attached states 與 block entities 則交由專項測試。批次執行另外以 server-side marker 確認 `/setblock` 已完成，並在每 case 清除流體、恢復支撐與固定 anchor，避免 client cache、物理漂移、silverfish 或水生方塊殘留造成跨案例污染；inventory 對 anvil 結果 pickup 依 26.2 cursor/slot/full-sync 回應同步，merchant 則保留其多槽更新順序。長測結束時 server 正常 save/stop，沒有符合條件的 Node/Java server 殘留程序。`docs/log.txt` 在目前工作區不存在，未被當成證據。
