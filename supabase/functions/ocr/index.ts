import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ocrPrompt = `你是一個頂尖的繁體中文手寫文字辨識專家。

【最高原則】你的唯一任務是「看圖辨字」，忠實記錄圖片中每個方格裡的手寫文字。
- 你是一台掃描機，不是編輯，不是校對，不是作文老師
- 絕對不要根據語意、常識、成語知識來「修正」或「替換」你看到的文字
- 如果你看到的筆畫組合成「移山為平地」，就輸出「移山為平地」，即使你知道常見說法是「積水成淵」
- 寧可輸出一個看起來不通順的字，也不要自作主張替換

這張圖片是一張中文稿紙（方格紙/原稿用紙）。

背景資訊：
- 台灣學生的手寫作文，繁體中文
- 直書（縱書）格式：文字方向為從上到下、從右到左
- 每個方格內寫一個字或一個標點符號
- 稿紙通常分成數個區塊，每個區塊有若干欄
- 這是學測（大學入學考試）的國文作文試卷，通常包含多個題目

【題號與結構辨識 — 極其重要】
- 作文試卷通常有多個大題，每個大題以題號開頭，例如：（一）、（二）、（三）或 (一)、(二)、(三)
- 題號通常寫在某一欄的最上方格子裡，佔據 2-3 格（如「（」「一」「）」各佔一格）
- 題號後面可能緊接著題目標題（如「學習像種樹」），也可能直接開始作答
- 你必須完整辨識所有題號標記，不可遺漏任何一個
- 每個題號前面必須插入一個空行作為分隔

辨識步驟：

第一步：觀察整體結構（在心中完成，不要輸出）
- 數一數有幾個區塊、每個區塊幾欄
- 確認哪些欄有文字
- 【重要】先掃描整張稿紙，找出所有題號標記的位置（如（一）在第幾欄、（二）在第幾欄）
- 找出哪些欄的開頭有空格（這代表新段落的起點）

第二步：逐欄、逐格辨識（同時處理分段與題號）
- 從最右邊區塊的最右欄開始，由上往下
- 每開始讀一個新欄時，先檢查該欄最上方的內容：

  【題號判斷】
  * 如果欄首出現括號加數字（如「（一）」「（二）」「(一)」「(二)」等），這是一個新題目的開始
  * 在題號前插入一個空行
  * 題號獨佔一行輸出
  * 如果題號所在欄的後續格子有文字（如標題），這些文字直接跟在題號後面或作為新的一行

  【段落判斷】
  * 如果欄首有一兩個空格才開始寫字 → 這是新段落的開始，在輸出中插入一個空行，並在段首加兩個全形空格（　　）縮排
  * 如果欄首直接寫字沒有空格（且不是題號）→ 這是同一段落的延續，文字直接接在前一欄後面
  * 如果整欄完全空白 → 這也表示段落分隔，插入一個空行

- 對每個字：仔細觀察筆畫的每一劃，根據筆畫形狀判斷是什麼字
- 不確定的字：放大觀察筆畫細節，根據你看到的筆畫做出最佳判斷，但絕不要用上下文語意來猜
- 讀完一欄移到左邊一欄，一個區塊讀完移到左邊區塊
- 區塊之間的切換不代表分段，除非新區塊的第一欄欄首有空格或題號

第三步：逐字對照圖片確認
- 逐字回頭對照圖片，確認輸出的每個字都與圖片中的筆畫一致
- 如果發現某個字是你「根據語意猜的」而非「根據筆畫看到的」，改回筆畫實際顯示的字
- 【最重要】確認以下結構是否正確：
  * 所有題號（如（一）（二）等）都已辨識且獨立標示
  * 分段位置正確：只有欄首有空格的地方才分段
  * 題號前後的空行分隔是否正確

重要注意事項：
- 分段判斷只根據「欄首是否有空格」或「欄首是否有題號」，絕對不要根據句號、語意或內容來決定是否分段
- 不同大題之間必須有空行分隔
- 題號（如（二））與其後的標題（如「學習像種樹」）之間不需要空行，可以寫在同一行或相鄰行

標點符號：。，、？！：；「」『』（）

請只輸出辨識出的純文字，不要加任何說明。`;

function buildImageContent(img: string) {
  return {
    type: "image_url" as const,
    image_url: {
      url: img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`,
    },
  };
}

async function callAI(apiKey: string, model: string, messages: any[]) {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, temperature: 0, messages }),
  });
  return res;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Received body keys:", Object.keys(body), "images array?", Array.isArray(body.images), "imageBase64?", !!body.imageBase64);
    
    // Support both single image and array of images
    let images: string[] = [];
    if (body.images && Array.isArray(body.images)) {
      images = body.images;
    } else if (body.imageBase64) {
      images = [body.imageBase64];
    }
    
    if (images.length === 0) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (images.length > 2) {
      return new Response(JSON.stringify({ error: "最多只能上傳 2 張圖片" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("GOOGLE_AI_API_KEY is not configured");
    }

    const model = "gemini-2.5-flash";

    // OCR each image separately, then combine
    const ocrResults: string[] = [];

    for (let i = 0; i < images.length; i++) {
      console.log(`Starting OCR for image ${i + 1}/${images.length}...`);
      
      const pageLabel = images.length > 1 
        ? `\n\n這是第 ${i + 1} 頁（共 ${images.length} 頁），請辨識這一頁的所有文字。` 
        : "";

      const ocrResponse = await callAI(GOOGLE_AI_API_KEY, model, [
        {
          role: "user",
          content: [
            { type: "text", text: ocrPrompt + pageLabel },
            buildImageContent(images[i]),
          ],
        },
      ]);

      if (!ocrResponse.ok) {
        if (ocrResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "AI 服務繁忙，請稍後再試。" }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (ocrResponse.status === 402) {
          return new Response(
            JSON.stringify({ error: "AI 額度已用完，請加值後再試。" }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const errorText = await ocrResponse.text();
        console.error(`OCR error for image ${i + 1}:`, ocrResponse.status, errorText);
        throw new Error(`OCR failed for image ${i + 1}: ${ocrResponse.status}`);
      }

      const ocrData = await ocrResponse.json();
      const text = ocrData.choices?.[0]?.message?.content || "";
      ocrResults.push(text);
    }

    // Combine results (front + back pages)
    const rawText = ocrResults.join("\n\n");

    console.log("OCR complete, starting proofreading...");

    // Proofreading
    const proofreadPrompt = `你是一個繁體中文校對員。以下是 OCR 辨識出的手寫文字。

你的任務非常有限：
1. 只修正「筆畫極度相似的形近字」誤判（例：已/己、土/士、大/太、末/未、日/目、人/入）
2. 修正明顯的標點符號錯誤
3. 保持原始段落結構與題號結構完全不變

嚴格禁止：
- 不要根據語意或上下文替換任何詞語
- 不要把不常見的用詞改成常見的用詞
- 不要替換成語、典故或慣用語
- 不要潤飾、增刪任何內容
- 如果原文是「移山為平地」，保留原樣，不要改成任何其他說法
- 不要合併或拆分段落
- 不要移除或修改題號標記（如（一）（二）等）
- 不要移除或修改標題（如「學習像種樹」）
- 不要改變空行的位置

你的角色是修正「看錯一劃」的錯誤，不是修正用詞，更不是修正段落結構。

原始辨識文字：
${rawText}

請直接輸出校對後的文字，不要加任何解釋。`;

    const proofResponse = await callAI(LOVABLE_API_KEY, model, [
      { role: "user", content: proofreadPrompt },
    ]);

    if (!proofResponse.ok) {
      console.error("Proofreading failed, returning raw text");
      return new Response(
        JSON.stringify({ text: rawText, proofread: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const proofData = await proofResponse.json();
    const finalText = proofData.choices?.[0]?.message?.content || rawText;

    console.log("Proofreading complete");

    return new Response(
      JSON.stringify({ text: finalText, proofread: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("OCR function error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
