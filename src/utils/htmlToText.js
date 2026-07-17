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

  const blockTags = [
    'address',
    'article',
    'aside',
    'blockquote',
    'div',
    'footer',
    'form',
    'h[1-6]',
    'header',
    'main',
    'nav',
    'ol',
    'p',
    'pre',
    'section',
    'table',
    'ul',
  ].join('|');

  const withStructure = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\b[^>]*\/?>/gi, '\n')
    .replace(new RegExp(`</(?:${blockTags})>`, 'gi'), '\n\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t');

  const stripped = withStructure.replace(/<[^>]+>/g, '');

  return decodeHtmlEntities(stripped)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
