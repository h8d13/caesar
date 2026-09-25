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

  // then sanitize the HTML content
  input = sanitize(input, {
    allowedTags: MESSAGE_ALLOWED_TAGS,
    allowedAttributes: { ...MESSAGE_ALLOWED_ATTRIBUTES, '*': [] },
    allowedSchemes: MESSAGE_ALLOWED_SCHEMES,
    // disallow any script or event handler attributes globally
    disallowedTagsMode: 'discard'
  });

  return input;
};

export { sanitizeMessageHtml };
