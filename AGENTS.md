# AGENTS.md

## 1. 專案概覽

- 本專案是 `minimal-360-grassland-mvp`，一個以 Vite 與 Three.js 建置的 360 度草原天空 MVP。
- 主要體驗是全螢幕 WebGL 場景：使用程式生成的草原天空全景貼圖、金針花稜柱佔位模型、中心準星熱點與中文對話框。
- 目前 UI 文字使用繁體中文，HTML 語系為 `zh-Hant`。
- 專案沒有前端框架，主要邏輯集中在原生 JavaScript、Three.js 與 CSS。

## 2. 技術棧

- 執行環境：Node.js 與 npm。
- 模組格式：ES Modules，`package.json` 已設定 `"type": "module"`。
- 建置工具：Vite。
- 3D 引擎：Three.js。
- HTTPS 開發支援：`@vitejs/plugin-basic-ssl`，只在 `VITE_USE_HTTPS=1` 時啟用。
- 樣式：純 CSS，沒有 Sass、Tailwind 或其他 CSS 框架。

## 3. 主要檔案

- `index.html`：HTML 入口，包含全螢幕 `<canvas>`、準星、互動提示、對話框與 HUD。
- `src/main.js`：Three.js 場景、相機、渲染器、全景貼圖生成、金針花模型、熱點偵測、對話流程、拖曳視角與陀螺儀控制。
- `src/styles.css`：全域版面、HUD、準星、互動提示、對話框與手機版響應式樣式。
- `vite.config.js`：Vite 設定；部署基底路徑為 `/VR_test/`，HTTPS 外掛依環境變數啟用。
- `package.json`：npm scripts 與依賴版本。
- `package-lock.json`：依賴鎖定檔，修改依賴時需同步更新。
- `.gitignore`：忽略 `node_modules/`、`dist/` 與 `.DS_Store`。

## 4. 常用命令

- 安裝依賴：`npm install`
- 本機開發：`npm run dev`
- HTTPS 與區網開發：`npm run dev:https`
- 生產建置：`npm run build`
- 預覽建置結果：`npm run preview`

## 5. 開發流程

- 修改功能前先閱讀 `src/main.js` 中既有狀態物件與事件處理流程，避免新增平行但重複的狀態來源。
- 場景互動目前採中心射線 `Raycaster` 命中透明熱點；新增可檢視物件時，優先沿用 `createHotspot`、`hotspots` 與 `dialogueScripts` 的結構。
- 桌面互動以滑鼠或觸控拖曳視角，鍵盤 `F` 觸發檢視；手機互動以觸控拖曳與「檢視」按鈕為主。
- 陀螺儀需要瀏覽器支援，部分行動裝置可能需要 HTTPS 與使用者手勢授權。
- `dist/` 是建置產物，通常不要直接修改；應修改原始檔後重新執行 `npm run build`。

## 6. 程式風格

- JavaScript 使用 2 空格縮排、雙引號、分號，以及清楚命名的函式與常數。
- 既有程式偏向單檔、函式式分段組織；除非功能明顯變大，否則先維持現有結構。
- Three.js 物件建立邏輯應封裝成小函式，例如 `createDaylilyPrismModel`、`createGrasslandPanoramaTexture`。
- 對話文案集中放在 `dialogueScripts`，不要散落在事件處理函式中。
- UI 查詢節點集中在檔案上方；新增 DOM 元素時，維持同樣的集中宣告方式。
- 只在邏輯不直觀時新增簡短註解，避免描述語法本身。

## 7. 視覺與互動規範

- 維持全螢幕沉浸式畫面，不要把主要 3D 場景包進卡片或固定尺寸容器。
- 重要 UI 元件需避開安全區，延續 `env(safe-area-inset-*)` 的做法。
- 手機版需確認提示、對話框與 HUD 不互相遮擋。
- 新增互動時要同時考慮桌面鍵盤、滑鼠拖曳、觸控操作與行動裝置限制。
- 對話框文案應保持繁體中文，語氣以簡潔、自然、可直接進入體驗為主。

## 8. 測試與驗證

- 目前專案沒有設定自動化測試或 lint script。
- 修改程式後至少執行 `npm run build`，確認 Vite 可以成功建置。
- 若修改互動、視覺或 Three.js 場景，建議啟動 `npm run dev` 或 `npm run dev:https`，在瀏覽器中手動確認畫面、拖曳、熱點、對話框與手機版版面。
- 若涉及陀螺儀，優先使用 `npm run dev:https` 並以實機或支援感測器的環境測試。

## 9. Git 與產物管理

- 不要提交 `node_modules/`。
- `dist/` 已被 `.gitignore` 忽略，通常視為可重新生成的建置產物。
- 修改依賴時要同步檢查 `package.json` 與 `package-lock.json`。
- 提交前使用 `git status --short` 檢查只包含本次任務相關變更。

## 10. 安全限制

- 禁止批量刪除文件或目錄。
- 不要使用 `del /s`、`rd /s`、`rmdir /s`、`Remove-Item -Recurse` 或 `rm -rf`。
- 需要刪除文件時，只能一次刪除一個明確路徑的文件。
- 如果需要批量刪除文件，應停止操作，並請使用者手動刪除。
