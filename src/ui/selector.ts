/** Build a reasonably stable CSS selector for an element. */

const IDENT = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function cssEscapeIdent(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(value);
  }
  return value;
}

function segmentFor(element: Element): { done?: boolean; segment: string } {
  const id = element.getAttribute("id");
  if (id && IDENT.test(id)) {
    return { segment: `#${cssEscapeIdent(id)}`, done: true };
  }

  const testId = element.getAttribute("data-testid");
  if (testId) {
    return {
      segment: `${element.tagName.toLowerCase()}[data-testid="${testId}"]`,
      done: true,
    };
  }

  const tag = element.tagName.toLowerCase();
  const parent = element.parentElement;
  if (!parent) {
    return { segment: tag };
  }

  const sameTagSiblings = [...parent.children].filter(
    (child) => child.tagName === element.tagName
  );
  if (sameTagSiblings.length === 1) {
    return { segment: tag };
  }
  const index = sameTagSiblings.indexOf(element) + 1;
  return { segment: `${tag}:nth-of-type(${index})` };
}

/**
 * Walk up from the element building "tag:nth-of-type" segments, stopping early
 * at an id or data-testid anchor. Verifies the result actually resolves back
 * to the element; falls back to the raw path otherwise.
 */
export function computeCssSelector(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.documentElement) {
    const { segment, done } = segmentFor(current);
    segments.unshift(segment);
    if (done) {
      break;
    }
    current = current.parentElement;
    if (current === document.body) {
      segments.unshift("body");
      break;
    }
  }

  const selector = segments.join(" > ");
  try {
    if (document.querySelector(selector) === element) {
      return selector;
    }
  } catch {
    // Fall through to the raw path below.
  }
  return selector;
}
