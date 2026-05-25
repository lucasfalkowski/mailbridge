const namedEntities = {
  amp: '&',
  apos: "'",
  copy: String.fromCodePoint(169),
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  reg: String.fromCodePoint(174),
};

function decodeHtmlEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (entity, code) => {
    const normalizedCode = code.toLowerCase();
    let codePoint;

    if (normalizedCode.startsWith('#x')) {
      codePoint = Number.parseInt(normalizedCode.slice(2), 16);
      return Number.isInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }

    if (normalizedCode.startsWith('#')) {
      codePoint = Number.parseInt(normalizedCode.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }

    return namedEntities[normalizedCode] ?? entity;
  });
}

export function htmlToText(html = '') {
  if (!html) return '';
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n');
  const stripped = withBreaks.replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(stripped).replace(/\n{3,}/g, '\n\n').trim();
}
