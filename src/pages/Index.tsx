import { useState, useCallback, useRef } from "react";
import { Upload, Copy, Check, Loader2, FileText, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Status = "idle" | "uploading" | "recognizing" | "proofreading" | "done" | "error";

const statusLabel: Record<Status, string> = {
  idle: "等待上傳",
  uploading: "上傳中…",
  recognizing: "辨識中…",
  proofreading: "校對中…",
  done: "完成",
  error: "辨識失敗",
};

const statusProgress: Record<Status, number> = {
  idle: 0,
  uploading: 10,
  recognizing: 40,
  proofreading: 75,
  done: 100,
  error: 0,
};

const Index = () => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [resultText, setResultText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast({ title: "請上傳圖片檔案（JPG/PNG）", variant: "destructive" });
        return;
      }

      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        setImagePreview(base64);
        setResultText("");
        setStatus("recognizing");

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 300000); // 5 minutes

        try {
          const { data, error } = await supabase.functions.invoke("ocr", {
            body: { imageBase64: base64 },
          });

          clearTimeout(timeout);

          if (error) {
            throw new Error(error.message || "辨識失敗");
          }

          if (data?.error) {
            throw new Error(data.error);
          }

          setResultText(data.text || "");
          setStatus("done");
          toast({
            title: data.proofread ? "辨識與校對完成" : "辨識完成（校對略過）",
          });
        } catch (err: any) {
          clearTimeout(timeout);
          console.error("OCR error:", err);
          setStatus("error");

          const isTimeout = err.name === "AbortError" || err.message?.includes("abort");
          toast({
            title: isTimeout ? "辨識超時" : "辨識失敗",
            description: isTimeout ? "處理時間過長，請嘗試較小的圖片或重試" : (err.message || "請重試"),
            variant: "destructive",
          });
        }
      };
      reader.readAsDataURL(file);
    },
    [toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(resultText);
    setCopied(true);
    toast({ title: "已複製到剪貼簿" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setImagePreview(null);
    setResultText("");
    setStatus("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isProcessing = status === "recognizing" || status === "proofreading" || status === "uploading";

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-3">
            <FileText className="h-7 w-7 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              稿紙 OCR
            </h1>
          </div>
          {imagePreview && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="mr-1 h-4 w-4" />
              重新上傳
            </Button>
          )}
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Upload area - shown when no image */}
        {!imagePreview && (
          <div className="mx-auto max-w-lg">
            <Card
              className="flex flex-col items-center justify-center gap-4 border-2 border-dashed p-12 transition-colors hover:border-primary/50 cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-12 w-12 text-muted-foreground" />
              <div className="text-center">
                <p className="text-lg font-medium text-foreground">
                  上傳稿紙圖片
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  拖放圖片到此處，或點擊選擇檔案
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  支援 JPG、PNG 格式
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </Card>
          </div>
        )}

        {/* Result area - shown after upload */}
        {imagePreview && (
          <>
            {/* Progress bar */}
            {isProcessing && (
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    {statusLabel[status]}
                  </span>
                </div>
                <Progress value={statusProgress[status]} className="h-2" />
              </div>
            )}

            {status === "done" && (
              <div className="mb-6 flex items-center gap-2">
                <Badge variant="default">
                  ✓ 辨識完成
                </Badge>
              </div>
            )}

            {status === "error" && (
              <div className="mb-6 flex items-center gap-2">
                <Badge variant="destructive">辨識失敗</Badge>
                <Button variant="outline" size="sm" onClick={handleReset}>
                  重試
                </Button>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Left: Image preview */}
              <Card className="overflow-hidden p-2">
                <p className="mb-2 px-2 text-sm font-medium text-muted-foreground">
                  原始圖片
                </p>
                <div className="overflow-auto max-h-[70vh]">
                  <img
                    src={imagePreview}
                    alt="稿紙圖片"
                    className="w-full rounded"
                  />
                </div>
              </Card>

              {/* Right: Text result */}
              <Card className="flex flex-col p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    辨識結果
                  </p>
                  {resultText && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      className="gap-1"
                    >
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copied ? "已複製" : "複製"}
                    </Button>
                  )}
                </div>
                <Textarea
                  value={resultText}
                  onChange={(e) => setResultText(e.target.value)}
                  placeholder={isProcessing ? "辨識中，請稍候…" : "辨識結果將顯示在此處"}
                  className="flex-1 min-h-[50vh] resize-none font-mono text-base leading-relaxed"
                  disabled={isProcessing}
                />
              </Card>
            </div>
          </>
        )}
      </div>
    </main>
  );
};

export default Index;
