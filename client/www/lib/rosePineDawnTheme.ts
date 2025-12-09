// Rosé Pine Dawn theme (matching prism.css)
export const rosePineDawnTheme = {
  plain: {
    backgroundColor: '#fff',
    color: '#575279',
  },
  styles: [
    {
      types: ['comment', 'prolog', 'cdata', 'punctuation'],
      style: { color: '#797593' },
    },
    {
      types: ['delimiter', 'important', 'atrule', 'operator', 'keyword'],
      style: { color: '#286983' },
    },
    {
      types: [
        'tag',
        'doctype',
        'variable',
        'regex',
        'class-name',
        'selector',
        'inserted',
      ],
      style: { color: '#56949f' },
    },
    {
      types: ['boolean', 'entity', 'number', 'symbol', 'function'],
      style: { color: '#d7827e' },
    },
    {
      types: ['string', 'char', 'property', 'attr-value'],
      style: { color: '#ea9d34' },
    },
    {
      types: ['parameter', 'url', 'attr-name', 'builtin'],
      style: { color: '#907aa9' },
    },
    {
      types: ['deleted'],
      style: { color: '#b4637a' },
    },
  ],
};
