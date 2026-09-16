import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export interface AuthAttachmentImageProps {
  /** Relative attachment URL returned by the backend (e.g. /admin/.../attachments/{id}). */
  url: string;
  alt: string;
  filename?: string;
  /** Wrap the image in an <a target="_blank"> pointing at the blob URL. */
  asLink?: boolean;
  linkClassName?: string;
  imgClassName?: string;
}

/**
 * 附件图片在后台的鉴权渲染。后台附件接口要求 Authorization: Bearer，
 * 而 <img src> 无法携带请求头，因此先用管理员会话令牌 fetch 成 blob，
 * 再用 object URL 交给 <img>/<a> 展示，避免 MISSING_TOKEN。
 */
export function AuthAttachmentImage({
  url,
  alt,
  filename,
  asLink = false,
  linkClassName,
  imgClassName,
}: AuthAttachmentImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;

    setFailed(false);
    setObjectUrl(null);
    (async () => {
      try {
        const response = await apiFetch(url);
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  if (failed) return null;

  const img = objectUrl ? (
    <img src={objectUrl} alt={alt} loading="lazy" className={imgClassName} />
  ) : null;

  if (!asLink) return img;

  return (
    <a
      className={linkClassName}
      href={objectUrl ?? undefined}
      target="_blank"
      rel="noreferrer"
      download={filename}
      aria-label={`${alt}`}
    >
      {img}
    </a>
  );
}

/** 通过管理员会话鉴权下载附件（非图片文件在后台的取回入口）。 */
export async function downloadAuthAttachment(url: string, filename: string) {
  const response = await apiFetch(url);
  if (!response.ok) throw new Error(String(response.status));
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
