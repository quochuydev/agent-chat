import { Cloud, Cpu, type LucideIcon } from "lucide-react";

// Which backend renders images for generate_images. The choice is sent to the connector
// as `provider` on /images; the connector picks the matching script (doc 07). Adding a
// backend = adding an entry here + a matching branch in video/api/tasks.py._image_backend.

export type ImageProviderId = "flux" | "imagen";

export type ImageProvider = {
  id: ImageProviderId;
  name: string;
  icon: LucideIcon;
  tagline: string;
};

export const IMAGE_PROVIDERS: ImageProvider[] = [
  {
    id: "flux",
    name: "FLUX.1-schnell",
    icon: Cpu,
    tagline: "Local · free · offline (runs on your machine)",
  },
  {
    id: "imagen",
    name: "Imagen 4 Fast",
    icon: Cloud,
    tagline: "Google · cloud · needs GEMINI_API_KEY on the connector",
  },
];

export const DEFAULT_IMAGE_PROVIDER: ImageProviderId = "flux";

export function getImageProvider(id?: string | null): ImageProvider {
  return IMAGE_PROVIDERS.find((p) => p.id === id) ?? IMAGE_PROVIDERS[0];
}

export function isImageProviderId(v: unknown): v is ImageProviderId {
  return v === "flux" || v === "imagen";
}
