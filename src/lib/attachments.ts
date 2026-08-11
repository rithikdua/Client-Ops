/** Attachments are either files uploaded to the API or pasted links. */
export function isImageAttachment(url: string): boolean {
  return /^data:image\//.test(url) || /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url);
}

const UPLOAD_PREFIX = '/api/uploads/';

/**
 * A readable label for an attachment. Uploads are stored under generated names
 * and data URLs are unreadable, so neither is worth showing verbatim; pasted
 * links show as themselves.
 */
export function attachmentLabel(url: string, uploadLabel = 'Uploaded file'): string {
  if (url.startsWith('data:')) return uploadLabel;
  if (url.startsWith(UPLOAD_PREFIX)) return uploadLabel;
  return url;
}

export function thumbnailStyle(url: string, size: number, radius: number): React.CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: radius,
    border: '1px solid var(--border-1)',
    backgroundImage: `url(${JSON.stringify(url)})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    flexShrink: 0,
  };
}
