import { useState, useCallback, useRef, WheelEvent } from "react";
import { Upload, Copy, Check, Loader2, FileText, RotateCcw, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
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
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [resultText, setResultText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const handleFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        toast({ title: "請上傳圖片檔案（JPG/PNG）", variant: "destructive" });
        return;
      }
      if (imageFiles.length > 2) {
        toast({ title: "最多只能上傳 2 張圖片（正面＋背面）", variant: "destructive" });
        return;
      }

      const readFile = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

      try {
        const base64Images = await Promise.all(imageFiles.map(readFile));
        setImagePreviews(base64Images);
        setResultText("");
        setStatus("recognizing");

        const { data, error } = await supabase.functions.invoke("ocr", {
          body: { images: base64Images },
        });

        if (error) throw new Error(error.message || "辨識失敗");
        if (data?.error) throw new Error(data.error);

        setResultText(data.text || "");
        setStatus("done");
        toast({
          title: data.proofread ? "辨識與校對完成" : "辨識完成（校對略過）",
        });
      } catch (err: any) {
        console.error("OCR error:", err);
        setStatus("error");
        const isTimeout = err.name === "AbortError" || err.message?.includes("abort");
        toast({
          title: isTimeout ? "辨識超時" : "辨識失敗",
          description: isTimeout ? "處理時間過長，請嘗試較小的圖片或重試" : (err.message || "請重試"),
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleFiles(files);
    },
    [handleFiles]
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(resultText);
    setCopied(true);
    toast({ title: "已複製到剪貼簿" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setImagePreviews([]);
    setResultText("");
    setStatus("idle");
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setZoom((prev) => {
      const next = prev - e.deltaY * 0.001;
      return Math.min(Math.max(next, 0.5), 5);
    });
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (zoom <= 1) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [zoom, panOffset]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning) return;
    setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  }, [isPanning, panStart]);

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const isProcessing = status === "recognizing" || status === "proofreading" || status === "uploading";
  const hasImages = imagePreviews.length > 0;

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-3">
            <FileText className="h-7 w-7 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              稿紙 OCR
            </h1>
          </div>
          {hasImages && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="mr-1 h-4 w-4" />
              重新上傳
            </Button>
          )}
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {!hasImages && (
          <div className="mx-auto max-w-lg">
            <Card
              className="flex flex-col items-center justify-center gap-4 border-2 border-dashed p-12 transition-colors hover:border-primary/50 cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-12 w-12 text-muted-foreground" />
              <div className="text-center">
                <p className="text-lg font-medium text-foreground">上傳稿紙圖片</p>
                <p className="mt-1 text-sm text-muted-foreground">拖放圖片到此處，或點擊選擇檔案</p>
                <p className="mt-1 text-xs text-muted-foreground">支援 JPG、PNG 格式，可選 1～2 張（正面＋背面）</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) handleFiles(files);
                }}
              />
            </Card>
          </div>
        )}

        {hasImages && (
          <>
            {isProcessing && (
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    {statusLabel[status]}
                    {imagePreviews.length === 2 && "（共 2 頁）"}
                  </span>
                </div>
                <Progress value={statusProgress[status]} className="h-2" />
              </div>
            )}

            {status === "done" && (
              <div className="mb-6 flex items-center gap-2">
                <Badge variant="default">
                  ✓ 辨識完成{imagePreviews.length === 2 ? "（雙面）" : ""}
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
              {/* Image preview with zoom/pan */}
              <Card className="overflow-hidden p-2">
                <div className="mb-2 px-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    原始圖片{imagePreviews.length === 2 ? "（共 2 頁）" : ""}
                  </p>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground mr-1">{Math.round(zoom * 100)}%</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(z + 0.25, 5))}>
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}>
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    {zoom !== 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={resetZoom}>
                        <Maximize2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div
                  ref={imageContainerRef}
                  className="overflow-hidden max-h-[70vh] select-none"
                  style={{ cursor: zoom > 1 ? (isPanning ? "grabbing" : "grab") : "default", touchAction: "none" }}
                  onWheel={handleWheel}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  <div
                    className="space-y-4 origin-top-left"
                    style={{
                      transform: `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
                    }}
                  >
                    {imagePreviews.map((img, idx) => (
                      <div key={idx} className="relative">
                        {imagePreviews.length === 2 && (
                          <Badge className="absolute top-2 left-2 z-10" variant="secondary">
                            第 {idx + 1} 頁
                          </Badge>
                        )}
                        <img
                          src={img}
                          alt={`稿紙圖片 第${idx + 1}頁`}
                          className="w-full rounded pointer-events-none"
                          draggable={false}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Text result */}
              <Card className="flex flex-col p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">辨識結果</p>
                  {resultText && (
                    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1">
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
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
