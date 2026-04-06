

# 修復 OCR 超時問題

## 問題根因

Edge Function 有執行時間限制（免費方案 150 秒，付費方案 400 秒）。目前的 OCR 流程需要兩次 AI 呼叫（OCR + 校對），大圖片時容易超時。日誌顯示函數在 `Starting OCR for image 1/1...` 之後直接 shutdown，表示 AI API 回應時間超過了函數限制。

## 解決方案

修改 `supabase/functions/ocr/index.ts`，加入以下優化：

### 1. 圖片壓縮（前端）
在 `src/pages/Index.tsx` 中，上傳前先壓縮圖片：
- 使用 Canvas 將圖片縮小到最大寬度 1600px
- 使用 JPEG 格式，品質 0.8
- 這能大幅減少傳送給 AI 的資料量，加快回應速度

### 2. 設定 fetch timeout
在 Edge Function 的 `callAI` 函數中加入 `AbortSignal.timeout(120000)`（120 秒），避免無限等待。

### 3. 當超時時跳過校對
如果 OCR 步驟已花費較長時間，直接回傳原始辨識結果，跳過校對步驟，避免總時間超過 Edge Function 限制。

### 4. 前端超時處理
在前端 `supabase.functions.invoke` 呼叫中也加入合理的超時設定，並改善錯誤提示。

## 修改檔案
- `src/pages/Index.tsx` — 加入圖片壓縮邏輯
- `supabase/functions/ocr/index.ts` — 加入 timeout 控制、條件性跳過校對

