import sanitizeHtml from 'sanitize-html';

export default function parseHtml(rawHtml: string) {
  const cleanHtml = sanitizeHtml(rawHtml);

  return cleanHtml;
}
