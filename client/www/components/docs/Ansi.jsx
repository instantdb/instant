import React from 'react';
import AnsiToHtml from 'ansi-to-html';

const converter = new AnsiToHtml();

/**
 * You may be wondering, how do you actually get the ANSI text?
 * 
 * Here's what you do: 
 * 1. Open your terminal
 * 2. Run `script -q transcript.txt` to start recording your terminal session 
 * 3. Run the commands you want to record
 * 4. `exit` to stop recording
 * 
 * Once you do, open transcript.txt, and you'll see the ANSI text.
 */
export function Ansi({ children }) {
  const text = children.props.children;
  const html = converter.toHtml(text);

  return <pre dangerouslySetInnerHTML={{ __html: html }} />;
}
