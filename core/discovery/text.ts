// core/discovery/text.ts — A MODEL FIELD IS A STRING OR IT IS NOTHING.
//
// Every field arriving from a provider is `unknown`, and it was being coerced with `String(x ?? '')`.
// That is total by construction and wrong in exactly one case: when the model returns an object or an
// array where a sentence was asked for, `String()` yields the literal text "[object Object]" and the
// run continues. A candidate rule then enters the standard whose statement is "[object Object]", and
// nothing downstream can tell it apart from a rule the expert might hold.
//
// This project already draws the line elsewhere: a structured-output failure is not a taste failure,
// and a malformed response is refused rather than interpreted. This is that line, one field down.
// A string is taken as given, a number is rendered, and anything else is absent — which the callers
// already handle, because they filter on the field being non-empty.

/** A model-supplied field, taken only when it is genuinely text. Anything object-shaped is dropped. */
export const asText = (v: unknown): string => {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
};

/** A model-supplied list of strings, with non-strings dropped rather than stringified. */
export const asTextList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(asText).filter((s) => s.length > 0) : [];
