/**
 * Footnotes extension for marked.js v16+
 */
import type { MarkedExtension } from 'marked';

const footnoteMatch = /^\[\^([^\]]+)\]:([\s\S]*)$/;
const referenceMatch = /\[\^([^\]]+)\](?!\()/g;
const referencePrefix = 'user-content-fnref';
const footnotePrefix = 'user-content-fn';

const footnoteTemplate = (ref: string, text: string) => {
  return `<p><a id="${footnotePrefix}-${ref}" href="#${referencePrefix}-${ref}">[${ref}]</a> ${text}</p>`;
};

const referenceTemplate = (ref: string) => {
  return `<sup id="${referencePrefix}-${ref}"><a href="#${footnotePrefix}-${ref}">[${ref}]</a></sup>`;
};

const interpolateReferences = (text: string) => {
  return text.replace(referenceMatch, (_, ref) => {
    return referenceTemplate(ref);
  });
};

const interpolateFootnotes = (text: string) => {
  return text.replace(footnoteMatch, (_, value, text) => {
    return footnoteTemplate(value, text);
  });
};

const footnotesExtension: MarkedExtension = {
  hooks: {
    postprocess(html: string) {
      let processedHtml = html;

      // Handle footnote definitions (convert <p>[^1]: text</p> to proper footnote)
      processedHtml = processedHtml.replace(
        /<p>(\[\^[^\]]+\]:[^<]*)<\/p>/g,
        (_match, footnoteContent) => {
          return interpolateFootnotes(footnoteContent);
        },
      );

      // Handle footnote references
      processedHtml = interpolateReferences(processedHtml);

      return processedHtml;
    },
  },
};

export default footnotesExtension;
