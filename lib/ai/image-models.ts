export const FLARE_MODEL = 'gpt-image-2.5-flare-2026-09-08';
export const REGULAR_IMAGE_QUALITY = 'medium' as const;

// Match the finished creative's aspect ratio. Flare accepts multiples of 16.
export function regularImageSize(format: string) {
  return format === 'square' ? '1024x1024' : format === 'story' ? '864x1536' : '1024x1280';
}
