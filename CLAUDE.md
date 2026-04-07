# busan-fukuoka Trip Guide — 開發規則

## 架構

- **Single source of truth**: `data/trip.json`
- 所有排程、景點、預算、訂房資料全在此檔案
- `index.html` + `style.css` + `app.js` 讀取 trip.json 並動態渲染

---

## 規則 1：POI 完整性（Mandatory）

**每一個行程表上有具體名稱的地點，都必須在 `pois[]` 陣列裡有對應的 entry（含 lat/lng）。**

地圖與景點列表完全由 `pois[]` 驅動。如果某地點只出現在 `schedule[].events[]`（有 `restaurant`、`map`、或具名 `name` 欄位）但沒有對應的 pois entry，它就**不會出現在地圖上**。

### 執行 checklist（每次新增/修改行程時）

1. 掃描所有新增的 schedule events，找出有具體店名/景點名的項目
2. 確認 `pois[]` 裡有對應的 `id`
3. 若沒有 → 立即補上新 POI entry，需包含：`id`, `name`, `nameLocal`, `city`, `cat`, `lat`, `lng`, `price_jpy`, `price_twd`, `hours`, `desc`, `addr`
4. ID 命名規則：
   - 福岡咖啡廳/餐廳：`fc1`–`fcN`
   - 阿蘇/熊本新景點：`j1`–`jN`
   - 柳川/太宰府補充：`f8`–`fN`

### 已有的 POI 對應

| ID | 地點 | 對應行程日 |
|----|------|-----------|
| f1 | 太宰府天滿宮 | 4/5 |
| f2 | 柳川遊船 | 4/5 |
| f8 | 本吉屋 鰻魚飯 | 4/5 |
| j1–j5 | 日輪寺・高森田樂・上色見・長部田・みのる食堂 | 4/4 |
| fc1–fc6 | White Glass Coffee・大名逛街・NO COFFEE・Taine・REC COFFEE・L'Antica | 4/6 |
| f9 | 舞鶴公園夜櫻 | 4/10 |
| f10 | Shin-Shin 拉麵 | 4/11 |

---

## 規則 2：Weather Strip 城市標籤

每張天氣卡片的城市標籤必須**可見**（不能只是 tooltip），使用 `.wd-city-row` 結構：

### app.js（JS 生成）

```js
'<div class="wd-city-row">' +
  '<div class="wd-city-dot" title="' + getCityName(w.city) + '"></div>' +
  '<span class="wd-city-label wd-city-' + w.city + '">' + getCityName(w.city) + '</span>' +
'</div>'
```

### style.css（CSS 規則）

```css
.wd-city-dot { width:6px; height:6px; border-radius:50%; background:var(--text-3); flex-shrink:0 }
.wd-city-row { display:flex; align-items:center; justify-content:center; gap:4px; margin-top:6px }
.wd-city-label { font-size:.58rem; font-weight:600; letter-spacing:.2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:52px }

.wd-city-label.wd-city-busan  { color:#3a7bd5 }
.wd-city-row:has(.wd-city-busan)  .wd-city-dot { background:#3a7bd5 }
.wd-city-label.wd-city-aso    { color:#2e7d32 }
.wd-city-row:has(.wd-city-aso)    .wd-city-dot { background:#2e7d32 }
.wd-city-label.wd-city-fukuoka{ color:#c0392b }
.wd-city-row:has(.wd-city-fukuoka) .wd-city-dot { background:#c0392b }
```

**原則：** city label 反映旅人**當天實際所在城市**，從 `WEATHER_DATA[].city` 讀取，不能假設。

---

## 預算計算邏輯

**預估模式**：`budget.items[]` 所有項目加總 = NT$48,835

**實際模式**：`purchased:true` 的 budget items + `actual_expenses[]` 每日花費
- 已購買 6 項：機票 + 釜山住宿 + 渡輪 + Klook + VBP + eSIM韓國 = NT$28,512
- 日常花費（3/30–當日）= 即時加總
- 城市分類：每筆 expense 有 `city` 欄位，bought items 也有 `city`

---

## 匯率參考

- 1 TWD ≈ 42 KRW
- 1 TWD ≈ 5 JPY
