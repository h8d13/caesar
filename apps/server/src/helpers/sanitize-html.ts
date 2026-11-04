import {
  MESSAGE_ALLOWED_ATTRIBUTES,
  MESSAGE_ALLOWED_SCHEMES,
  MESSAGE_ALLOWED_TAGS,
  stripZalgo
} from '@caesar/shared';
import sanitize from 'sanitize-html';

const sanitizeMessageHtml = (html: string): string => {
  let input = html;

  // first strip zalgo to prevent it from being used to bypass sanitization
  input = stripZalgo(input);

  input = sanitize(input, {
    allowedTags: MESSAGE_ALLOWED_TAGS,
    // no global attributes: on*/style only survive if listed per tag
    allowedAttributes: { ...MESSAGE_ALLOWED_ATTRIBUTES, '*': [] },
    allowedSchemes: MESSAGE_ALLOWED_SCHEMES,
    // disallowed tags are dropped, not escaped to text
    disallowedTagsMode: 'discard'
  });

  return input;
};

export { sanitizeMessageHtml };
