import {
  getInstagramMedia,
  getRecentInstagramVideos,
} from "./instagramClient.js";

export class InstagramVideoError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "NOT_VIDEO" | "NO_MEDIA_URL",
  ) {
    super(`Instagram video unavailable (${code}).`);
    this.name = "InstagramVideoError";
  }
}

export async function resolveInstagramVideo(mediaId: string): Promise<string> {
  const media = await getInstagramMedia(mediaId);

  if (!media) {
    throw new InstagramVideoError("NOT_FOUND");
  }

  if (media.media_type !== "VIDEO") {
    throw new InstagramVideoError("NOT_VIDEO");
  }

  if (!media.media_url) {
    throw new InstagramVideoError("NO_MEDIA_URL");
  }

  return media.media_url;
}

export async function getLatestInstagramVideo(): Promise<{
  mediaId: string;
  mediaUrl: string;
  permalink?: string;
}> {
  const videos = await getRecentInstagramVideos(25);

  const video = videos[0];

  if (!video?.media_url) {
    throw new InstagramVideoError("NOT_FOUND");
  }

  return {
    mediaId: video.id,
    mediaUrl: video.media_url,
    ...(video.permalink ? { permalink: video.permalink } : {}),
  };
}
