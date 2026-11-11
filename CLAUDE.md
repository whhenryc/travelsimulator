# 旅行模擬器（Travel Simulator）

## 專案係乜

一隻瀏覽器 3D 遊戲。玩家化身 avatar，喺風格化嘅真實城市入面行街遊覽。

目標用戶有兩類：
1. 未能隨時出行嘅人，想感受世界唔同地方。
2. 準備去旅行嘅人，想預先認路同揀景點。

呢個 repo 目前做緊 **MVP：一個區（京都祇園），驗證「行落去舒唔舒服、似唔似去咗嗰度」**。未驗證之前唔好加第二個城市。

## 核心設計決定

- **世界由 OpenStreetMap 數據自動生成**，唔係人手砌。建築輪廓拉高成方塊，道路、水體、公園由 OSM 標籤決定。
- **風格靠色板、燈光、shader、聲音**，唔靠模型細節。普通建築就係淨色方塊，呢個係刻意嘅。
- **只有地標用獨立模型**（glTF），每個城市 5 至 10 個。
- **OSM 數據喺 build time 抓一次，存成靜態檔**，runtime 唔 call 任何地圖 API。冇 API key，冇按量收費。
- **每個城市係一份 config**（bbox、色板、地標清單、景點清單）。加城市應該只係加 config 同地標模型，唔使改引擎。

## Tech stack

- Vite + TypeScript（strict）
- three.js（直接用，唔用 react-three-fiber；UI 層用原生 DOM 疊喺 canvas 上面）
- 碰撞：2D 做法，avatar 當圓形，同建築 footprint 多邊形做碰撞。唔引入物理引擎。
- 數據腳本：Node 腳本經 Overpass API 抓 OSM，轉 GeoJSON，存入 `public/data/<city>/`
- 部署：靜態 build，push 去 GitHub，再經 Railway 部署

## 目錄結構

```
scripts/
  fetch-osm.ts          # 按 city config 嘅 bbox 抓 OSM，輸出 GeoJSON
src/
  cities/
    gion.ts             # 城市 config：bbox、色板、地標、景點
  world/
    projection.ts       # 經緯度 → 本地米制座標（以 bbox 中心為原點）
    buildings.ts        # footprint 拉高成 mesh，合併成少量 draw call
    ground.ts           # 道路、水體、綠地
    props.ts            # 程序化樹、路燈
    landmarks.ts        # 載入 glTF 地標
  player/
    controller.ts       # 鍵盤 + touch 輸入、移動、碰撞
    camera.ts           # 第三人稱跟隨鏡頭
  style/
    palette.ts          # 色板套用
    lighting.ts         # 天色、太陽、霧
  ui/
    poi-card.ts         # 景點資料卡
    itinerary.ts        # 收藏清單（localStorage）
    minimap.ts
  main.ts
public/
  data/gion/            # 已抓好嘅 GeoJSON（commit 入 repo）
  models/gion/          # 地標 glTF
  audio/gion/
```

## MVP 城市：京都祇園

揀佢嘅原因：地勢平（唔使處理地形高低）、OSM 數據齊、範圍細但地標密、風格辨識度高。

- 大約 bbox：南 34.9995、西 135.7705、北 35.0075、東 135.7800（約 0.9 km 見方，第一次抓完數據要睇圖確認，按需要調整）
- 範圍：西至鴨川四條大橋，東至八坂神社，北至白川，南至建仁寺
- 色板方向：木色深啡、瓦灰、朱紅點綴、黃昏暖光

## 規則

- **建築高度**：依次用 OSM `height`、`building:levels` × 3 米、否則按 `building` 類型畀預設值（住宅 6 米、商業 9 米、其他 7 米）。同一棟樓嘅高度要穩定，隨機數用 OSM id 做 seed。
- **效能目標**：中階手機 30 fps 以上。建築要合併 geometry，樹同路燈用 InstancedMesh。draw call 控制喺 100 以下。
- **手機優先**：touch 控制（左搖桿移動，右邊拖動轉鏡頭）同鍵盤滑鼠一樣係一等公民。
- **OSM 授權**：畫面要長期顯示「© OpenStreetMap contributors」。
- **地標模型**：只用授權清楚嘅模型，來源同授權記喺 `public/models/CREDITS.md`。
- **唔好做**：多人連線、帳戶系統、後端、真實街景嵌入、第二個城市。呢啲全部係 MVP 之後嘅事。

## 指令

```
npm run dev          # 開發伺服器
npm run build        # 靜態 build 去 dist/
npm run fetch:osm -- gion   # 重新抓某城市嘅 OSM 數據
npm run typecheck
```

## 工作方式

- 跟 `PLAN.md` 嘅階段順序做，每個階段完成先做下一個。
- 每個階段完結時，開 dev server 用瀏覽器實際睇一次畫面，唔好只靠 typecheck 通過就當完成。
- 視覺風格係主觀嘅：階段 3 做完之後停低，等 Henry 睇過先繼續。
