/**
 * Footnotes extension for marked.js
 * Inspo: https://github.com/markedjs/marked/issues/1562#issuecomment-1213367729
 */
import { marked } from 'marked';

const footnoteMatch = /^\[\^([^\]]+)\]:([\s\S]*)$/;
const referenceMatch = /\[\^([^\]]+)\](?!\()/g;
const referencePrefix = 'marked-fnref';
const footnotePrefix = 'marked-fn';
const footnoteTemplate = (ref, text) => {
  return `<a id="${footnotePrefix}-${ref}" href="#${referencePrefix}-${ref}">[${ref}]</a> ${text}`;
};
const referenceTemplate = (ref) => {
  return `<sup id="${referencePrefix}-${ref}"><a href="#${footnotePrefix}-${ref}">[${ref}]</a></sup>`;
};
const interpolateReferences = (text) => {
  return text.replace(referenceMatch, (_, ref) => {
    return referenceTemplate(ref);
  });
};
const interpolateFootnotes = (text) => {
  return text.replace(footnoteMatch, (_, value, text) => {
    return footnoteTemplate(value, text);
  });
};

const footnotes = {
  paragraph(text) {
    return marked.Renderer.prototype.paragraph.apply(null, [
      interpolateReferences(interpolateFootnotes(text)),
    ]);
  },
  text(text) {
    return marked.Renderer.prototype.text.apply(null, [
      interpolateReferences(interpolateFootnotes(text)),
    ]);
  },
};

export default footnotes;
