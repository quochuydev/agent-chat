import { ImageResponse } from "next/og";

// Dynamic 1200×630 share card used for og:image and (by fallback) twitter:image.
export const alt = "AI Video Agent — from a single chat to a finished video";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          padding: "80px",
          color: "#171717",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "#171717",
            }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                borderTop: "13px solid transparent",
                borderBottom: "13px solid transparent",
                borderLeft: "22px solid #ffffff",
                marginLeft: "6px",
              }}
            />
          </div>
          <div style={{ display: "flex", fontSize: "30px", fontWeight: 600 }}>Video Agent</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: "68px",
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              maxWidth: "920px",
            }}
          >
            From a single chat to a finished video.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: "28px",
              fontSize: "30px",
              color: "#525252",
              maxWidth: "880px",
              lineHeight: 1.35,
            }}
          >
            An AI agent writes the script, voices the narration, illustrates every scene, and
            assembles the final cut.
          </div>
        </div>

        <div style={{ display: "flex", fontSize: "26px", color: "#8f8f8f" }}>chat.cappuai.com</div>
      </div>
    ),
    { ...size },
  );
}
