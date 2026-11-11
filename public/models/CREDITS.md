# 地標模型來源同授權

| 檔案 | 地標 | 來源 | 授權 |
|---|---|---|---|
| `gion/nishiromon.glb` | 八坂神社西樓門 | 本專案原創，由 `scripts/build-landmarks.ts` 用程式生成 | 同本專案相同 |
| `gion/minamiza.glb` | 南座 | 本專案原創，由 `scripts/build-landmarks.ts` 用程式生成 | 同本專案相同 |
| `gion/tatsumi-bashi.glb` | 白川巽橋 | 本專案原創，由 `scripts/build-landmarks.ts` 用程式生成 | 同本專案相同 |

三個模型冇用任何第三方模型、貼圖或者掃描數據。尺寸同方向按 OpenStreetMap 嘅建築輪廓對齊（© OpenStreetMap contributors，ODbL），外形係按公開資料同一般認知嘅建築特徵簡化成低多邊形。

修改模型：改 `scripts/build-landmarks.ts`，再行 `npm run build:landmarks` 重新生成。

2026 年 11 月曾經喺 Sketchfab 搜尋可以下載嘅 CC0／CC-BY 模型，三個地標都冇合用嘅（西樓門冇結果；南座只有一個未註明地點嘅室內掃描；巽橋只有一個 48 萬面、風格唔夾嘅擺設），所以改為自己砌。
