import { ImageResponse } from "next/og";

// 180×180 touch icon for iOS home-screen / bookmarks.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#171717",
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderTop: "38px solid transparent",
            borderBottom: "38px solid transparent",
            borderLeft: "62px solid #ffffff",
            marginLeft: "14px",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
