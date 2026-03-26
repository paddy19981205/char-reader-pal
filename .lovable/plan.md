

## 改用 Google AI API Key

### 概要
將 OCR 後端從 Lovable AI Gateway 切換到你自己的 Google AI (Gemini) API Key。

### 步驟

1. **儲存 API Key 為秘密變數**
   - 使用安全儲存工具將你的 API Key 儲存為 `GOOGLE_AI_API_KEY`
   - 這樣金鑰不會暴露在程式碼中

2. **修改 Edge Function** (`supabase/functions/ocr/index.ts`)
   - 將 API 端點從 `https://ai.gateway.lovable.dev/v1/chat/completions` 改為 Google AI 的 OpenAI 相容端點：`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
   - 將 `LOVABLE_API_KEY` 改為讀取 `GOOGLE_AI_API_KEY`
   - 模型名稱從 `google/gemini-3-flash-preview` 改為 `gemini-2.5-flash`（Google 原生 API 的模型名稱不帶 `google/` 前綴）
   - 保留現有的錯誤處理（429、402 等）

### 技術細節
- Google AI 提供 OpenAI 相容的 API 端點，只需改 URL 和 API Key，程式碼結構幾乎不變
- `callAI` 函式的修改範圍很小：換 URL、換 Key 來源、換模型名稱

