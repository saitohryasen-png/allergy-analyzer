"use client";

import { useState, useRef, useCallback, useEffect } from "react";

const ALLERGEN_CONFIG = {
  "小麦・グルテン": { color: "#F59E0B", emoji: "🌾", bg: "#FEF3C7" },
  "乳製品": { color: "#3B82F6", emoji: "🥛", bg: "#DBEAFE" },
  "卵": { color: "#F97316", emoji: "🥚", bg: "#FFEDD5" },
  "ピーナッツ": { color: "#84CC16", emoji: "🥜", bg: "#ECFCCB" },
  "木の実類": { color: "#8B5CF6", emoji: "🌰", bg: "#EDE9FE" },
  "魚介類": { color: "#06B6D4", emoji: "🐟", bg: "#CFFAFE" },
  "甲殻類": { color: "#EF4444", emoji: "🦐", bg: "#FEE2E2" },
  "大豆": { color: "#10B981", emoji: "🫘", bg: "#D1FAE5" },
  "ゴマ": { color: "#6B7280", emoji: "⚫", bg: "#F3F4F6" },
  "そば": { color: "#92400E", emoji: "🍜", bg: "#FEF3C7" },
};

const RISK_LABEL = {
  high: { label: "含有の可能性高", color: "#EF4444", bg: "#FEE2E2", icon: "⚠️" },
  medium: { label: "含有の可能性あり", color: "#F59E0B", bg: "#FEF3C7", icon: "⚡" },
  low: { label: "微量含有の可能性", color: "#3B82F6", bg: "#DBEAFE", icon: "ℹ️" },
};

type Screen = "start" | "camera" | "preview" | "result";

export default function AllergyAnalyzer() {
  const [screen, setScreen] = useState<Screen>("start");
  const [image, setImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<{ data: string; mediaType: string } | null>(null);
  const [result, setResult] = useState<{
    foodName: string;
    description: string;
    allergens: { name: string; risk: string; reason: string }[];
    safeNote?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const startCamera = async () => {
    setCameraError(null);
    setScreen("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setCameraError("カメラにアクセスできませんでした。カメラの使用を許可してください。");
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // 長辺を1024pxに制限してAPIのボディサイズ超過を防ぐ
    const MAX = 1024;
    const scale = Math.min(1, MAX / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1];

    stopCamera();
    setImage(dataUrl);
    setImageBase64({ data: base64, mediaType: "image/jpeg" });
    setResult(null);
    setError(null);
    setScreen("preview");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ファイルサイズをチェック（5MB制限）
    if (file.size > 5 * 1024 * 1024) {
      setError("ファイルサイズは5MB以下にしてください");
      return;
    }

    // 画像ファイルのみ許可
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルをアップロードしてください");
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const base64 = dataUrl.split(",")[1];
        const mediaType = file.type;

        setImage(dataUrl);
        setImageBase64({ data: base64, mediaType });
        setResult(null);
        setError(null);
        setScreen("preview");
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError(`ファイル読み込みエラー: ${err instanceof Error ? err.message : "不明なエラー"}`);
    }
  };

  const retake = () => {
    setImage(null);
    setImageBase64(null);
    setResult(null);
    setError(null);
    startCamera();
  };

  const reset = () => {
    stopCamera();
    setImage(null);
    setImageBase64(null);
    setResult(null);
    setError(null);
    setCameraError(null);
    setScreen("start");
  };

  const analyze = async () => {
    if (!imageBase64) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: imageBase64.mediaType, data: imageBase64.data },
              },
              {
                type: "text",
                text: `この食品・料理の写真を分析して、含まれる可能性のあるアレルゲンを特定してください。

必ず以下のJSON形式のみで返答してください（マークダウン不要）:
{
  "foodName": "料理名または食品名",
  "description": "食品の簡単な説明（1〜2文）",
  "allergens": [
    {
      "name": "アレルゲン名（小麦・グルテン/乳製品/卵/ピーナッツ/木の実類/魚介類/甲殻類/大豆/ゴマ/そば のいずれか）",
      "risk": "high/medium/low",
      "reason": "含まれている理由（1文）"
    }
  ],
  "safeNote": "アレルギーをお持ちの方へのアドバイス（1文）"
}

アレルゲンが見つからない場合はallergensを空配列にしてください。`,
              },
            ],
          }],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(`APIエラー: ${data?.error ?? response.status}`);
        return;
      }

      const text = data.content?.find((b: { type: string; text?: string }) => b.type === "text")?.text ?? "";
      if (!text) {
        setError("AIからの応答が空でした。もう一度お試しください。");
        return;
      }

      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setResult(parsed);
      setScreen("result");
    } catch (err) {
      setError(`エラー: ${err instanceof Error ? err.message : "不明なエラーが発生しました"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
      fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
      padding: "24px 16px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
        .card { animation: fadeUp .4s ease forwards; }
        .allergen-tag:hover { transform: translateY(-2px); transition: transform .2s; }
        .btn-primary { transition: all .2s; }
        .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 30px rgba(99,102,241,.5); }
        .btn-primary:active:not(:disabled) { transform: translateY(0); }
        .shutter { transition: transform .1s; }
        .shutter:active { transform: scale(.92); }
      `}</style>

      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🔬</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#F1F5F9", margin: 0, letterSpacing: "-0.5px" }}>
            アレルゲン検出AI
          </h1>
          <p style={{ color: "#64748B", marginTop: 8, fontSize: 14 }}>
            食品をカメラで撮影してアレルギー成分を分析します
          </p>
        </div>

        {/* ── START ── */}
        {screen === "start" && (
          <div className="card" style={{
            background: "rgba(30,41,59,.8)",
            borderRadius: 20,
            padding: "60px 32px",
            textAlign: "center",
            backdropFilter: "blur(10px)",
            border: "1px solid #1E293B",
          }}>
            <div style={{ fontSize: 72, marginBottom: 24 }}>📸</div>
            <p style={{ color: "#94A3B8", fontSize: 16, marginBottom: 32 }}>
              食品や料理をカメラで撮影すると<br />含まれるアレルゲンを検出します
            </p>

            {error && (
              <div style={{
                background: "#FEE2E2", borderRadius: 12, padding: 12,
                color: "#DC2626", fontSize: 14, textAlign: "center", marginBottom: 16,
              }}>⚠️ {error}</div>
            )}

            <button
              className="btn-primary"
              onClick={startCamera}
              style={{
                width: "100%", padding: "16px 24px",
                background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                border: "none", borderRadius: 14,
                color: "#fff", fontSize: 17, fontWeight: 700,
                cursor: "pointer",
                marginBottom: 12,
              }}
            >
              📷 カメラを起動する
            </button>
            <button
              className="btn-primary"
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: "100%", padding: "16px 24px",
                background: "transparent", border: "1px solid #334155",
                borderRadius: 14,
                color: "#94A3B8", fontSize: 17, fontWeight: 700,
                cursor: "pointer",
              }}
            >
              📁 写真をアップロード
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
          </div>
        )}

        {/* ── CAMERA ── */}
        {screen === "camera" && (
          <div className="card" style={{
            background: "#000",
            borderRadius: 20,
            overflow: "hidden",
            border: "1px solid #1E293B",
          }}>
            {cameraError ? (
              <div style={{ padding: 32, textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
                <p style={{ color: "#EF4444", fontSize: 15, marginBottom: 24 }}>{cameraError}</p>
                <button onClick={reset} style={{
                  padding: "12px 24px", background: "transparent",
                  border: "1px solid #334155", borderRadius: 12,
                  color: "#94A3B8", fontSize: 14, cursor: "pointer",
                }}>戻る</button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: "100%", display: "block", maxHeight: 480, objectFit: "cover" }}
                />
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "20px 32px", background: "rgba(0,0,0,.7)",
                }}>
                  <button onClick={reset} style={{
                    background: "rgba(255,255,255,.1)", border: "none",
                    color: "#94A3B8", borderRadius: 10, padding: "10px 16px",
                    cursor: "pointer", fontSize: 14,
                  }}>キャンセル</button>

                  {/* Shutter button */}
                  <button
                    className="shutter"
                    onClick={capturePhoto}
                    style={{
                      width: 70, height: 70,
                      borderRadius: "50%",
                      background: "#fff",
                      border: "5px solid rgba(255,255,255,.4)",
                      cursor: "pointer",
                      boxShadow: "0 0 0 3px rgba(255,255,255,.2)",
                    }}
                  />

                  <div style={{ width: 80 }} />
                </div>
              </>
            )}
            <canvas ref={canvasRef} style={{ display: "none" }} />
          </div>
        )}

        {/* ── PREVIEW / RESULT ── */}
        {(screen === "preview" || screen === "result") && image && (
          <div className="card" style={{
            background: "rgba(30,41,59,.8)",
            borderRadius: 20,
            overflow: "hidden",
            border: "1px solid #1E293B",
            backdropFilter: "blur(10px)",
          }}>
            <div style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="撮影した写真" style={{
                width: "100%", maxHeight: 320, objectFit: "cover", display: "block",
              }} />
              <button onClick={reset} style={{
                position: "absolute", top: 12, right: 12,
                background: "rgba(0,0,0,.6)", border: "none",
                color: "#fff", borderRadius: 8, padding: "6px 10px",
                cursor: "pointer", fontSize: 13, backdropFilter: "blur(4px)",
              }}>✕ 最初から</button>
            </div>

            <div style={{ padding: 24 }}>
              {/* Preview: analyze / retake buttons */}
              {screen === "preview" && !loading && (
                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={retake} style={{
                    flex: 1, padding: "13px",
                    background: "transparent", border: "1px solid #334155",
                    borderRadius: 12, color: "#64748B", fontSize: 14, cursor: "pointer",
                  }}>
                    📷 撮り直す
                  </button>
                  <button className="btn-primary" onClick={analyze} style={{
                    flex: 2, padding: "13px 24px",
                    background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                    border: "none", borderRadius: 12,
                    color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer",
                  }}>
                    🔍 分析する
                  </button>
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <div style={{
                    width: 40, height: 40, border: "3px solid #334155",
                    borderTop: "3px solid #6366F1", borderRadius: "50%",
                    animation: "spin 1s linear infinite", margin: "0 auto 16px",
                  }} />
                  <p style={{ color: "#94A3B8", fontSize: 14, animation: "pulse 1.5s infinite" }}>
                    AIが分析中...
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{
                  background: "#FEE2E2", borderRadius: 12, padding: 16,
                  color: "#DC2626", fontSize: 14, textAlign: "center", marginBottom: 12,
                }}>⚠️ {error}</div>
              )}

              {/* Results */}
              {screen === "result" && result && (
                <div style={{ animation: "fadeUp .4s ease" }}>
                  <div style={{ marginBottom: 20 }}>
                    <h2 style={{ color: "#F1F5F9", fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>
                      {result.foodName}
                    </h2>
                    <p style={{ color: "#64748B", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
                      {result.description}
                    </p>
                  </div>

                  {result.allergens.length === 0 ? (
                    <div style={{
                      background: "#D1FAE5", borderRadius: 12, padding: 16,
                      color: "#065F46", textAlign: "center", fontSize: 15,
                    }}>
                      ✅ 主要なアレルゲンは検出されませんでした
                    </div>
                  ) : (
                    <>
                      <p style={{ color: "#94A3B8", fontSize: 13, marginBottom: 12 }}>
                        検出されたアレルゲン（{result.allergens.length}種類）
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {result.allergens.map((a, i) => {
                          const cfg = ALLERGEN_CONFIG[a.name as keyof typeof ALLERGEN_CONFIG] || { color: "#6B7280", emoji: "⚠️", bg: "#F3F4F6" };
                          const risk = RISK_LABEL[a.risk as keyof typeof RISK_LABEL] || RISK_LABEL.medium;
                          return (
                            <div key={i} className="allergen-tag" style={{
                              background: "rgba(255,255,255,.04)",
                              border: "1px solid rgba(255,255,255,.08)",
                              borderLeft: `4px solid ${cfg.color}`,
                              borderRadius: 12, padding: "12px 16px", cursor: "default",
                            }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                <span style={{ fontSize: 15, fontWeight: 600, color: "#E2E8F0" }}>
                                  {cfg.emoji} {a.name}
                                </span>
                                <span style={{
                                  fontSize: 11, fontWeight: 600,
                                  background: risk.bg, color: risk.color,
                                  padding: "3px 8px", borderRadius: 6,
                                }}>
                                  {risk.icon} {risk.label}
                                </span>
                              </div>
                              <p style={{ color: "#64748B", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                                {a.reason}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {result.safeNote && (
                    <div style={{
                      marginTop: 16,
                      background: "rgba(99,102,241,.1)",
                      border: "1px solid rgba(99,102,241,.3)",
                      borderRadius: 12, padding: 14,
                      color: "#A5B4FC", fontSize: 13, lineHeight: 1.6,
                    }}>
                      💡 {result.safeNote}
                    </div>
                  )}

                  <button onClick={reset} style={{
                    marginTop: 20, width: "100%", padding: "12px",
                    background: "transparent", border: "1px solid #334155",
                    borderRadius: 12, color: "#64748B", fontSize: 14, cursor: "pointer",
                  }}>
                    📷 もう一度撮影する
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <p style={{ textAlign: "center", color: "#334155", fontSize: 12, marginTop: 24 }}>
          ⚠️ 本アプリはAI分析であり、医療的アドバイスではありません。アレルギーをお持ちの方は必ず原材料表示をご確認ください。
        </p>
      </div>
    </div>
  );
}
