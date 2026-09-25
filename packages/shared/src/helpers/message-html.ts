// Tags and attributes a stored message may carry. The server sanitizes
// against these on write; the client re-applies them after its markdown
// render, which decodes the entities the server escaped and would otherwise
// bring any tag back.
const MESSAGE_ALLOWED_TAGS = [
  // basic text structure
  'p',
  'br',
  // headings
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  // inline formatting
  'strong',
  'em',
  'code',
  'pre',
  's',
  'i',
  'u',
  'hr',
  'blockquote',
  // lists
  'ul',
  'ol',
  'li',
  // links
  'a',
  // emoji (span wrapper + img fallback)
  'span',
  'img'
];

const MESSAGE_ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'target', 'rel'],
  span: [
    'data-type',
    'data-name',
    'data-user-id',
    'data-channel-id',
    'data-channel-type',
    'class'
  ],
  img: ['src', 'alt', 'draggable', 'loading', 'align', 'class'],
  code: ['class'],
  pre: ['class'],
  br: ['class']
};

const MESSAGE_ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

// Classes the editor emits. Anything else is dropped client-side: app
// utility classes (e.g. "fixed inset-0 z-50") would let a message restyle
// the page around it.
const isAllowedMessageClass = (name: string): boolean =>
  /^(emoji-image|mention|hard-break|language-[\w-]+)$/.test(name);

export {
  MESSAGE_ALLOWED_ATTRIBUTES,
  MESSAGE_ALLOWED_SCHEMES,
  MESSAGE_ALLOWED_TAGS,
  isAllowedMessageClass
};
