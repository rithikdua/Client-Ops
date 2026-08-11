/** Attachments are either uploaded data URLs or pasted links. */
export function isImageAttachment(url: string): boolean {
  return /^data:image\//.test(url) || /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url);
}

/** Data URLs are unreadable, so they show a generic label instead. */
export function attachmentLabel(url: string, dataUrlLabel = 'File'): string {
  return url.startsWith('data:') ? dataUrlLabel : url;
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
