import React from 'react';
import AnsiToHtml from 'ansi-to-html';

const converter = new AnsiToHtml();

export function Ansi({ children }) {
  const text = children.props.children;
  const html = converter.toHtml(text);

  return <pre dangerouslySetInnerHTML={{ __html: html }} />;
}
