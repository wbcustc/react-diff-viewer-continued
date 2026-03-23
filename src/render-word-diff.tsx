import cn from "classnames";
import * as React from "react";
import type { JSX, ReactElement } from "react";

import {
  type DiffInformation,
  DiffMethod,
  DiffType,
} from "./compute-lines.js";
import type { ReactDiffViewerStyles } from "./styles.js";
import type { Change } from "diff";

/**
 * Applies diff styling (ins/del tags) to pre-highlighted HTML by walking through
 * the HTML and wrapping text portions based on character positions in the diff.
 */
export function applyDiffToHighlightedHtml(
  html: string,
  diffArray: DiffInformation[],
  styles: { wordDiff: string; wordAdded: string; wordRemoved: string },
): string {
  // Build diff ranges with character positions
  interface DiffRange {
    start: number;
    end: number;
    type: DiffType;
  }

  const ranges: DiffRange[] = [];
  let pos = 0;
  for (const diff of diffArray) {
    const value = typeof diff.value === "string" ? diff.value : "";
    if (value.length > 0) {
      ranges.push({ start: pos, end: pos + value.length, type: diff.type });
      pos += value.length;
    }
  }

  // Parse HTML into tag and text segments
  interface Segment {
    type: "tag" | "text";
    content: string;
  }

  const segments: Segment[] = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] === "<") {
      const tagEnd = html.indexOf(">", i);
      if (tagEnd === -1) {
        // Malformed HTML, treat rest as text
        segments.push({ type: "text", content: html.slice(i) });
        break;
      }
      segments.push({ type: "tag", content: html.slice(i, tagEnd + 1) });
      i = tagEnd + 1;
    } else {
      // Find the next tag or end of string
      let textEnd = html.indexOf("<", i);
      if (textEnd === -1) textEnd = html.length;
      segments.push({ type: "text", content: html.slice(i, textEnd) });
      i = textEnd;
    }
  }

  // Helper to decode HTML entities for character counting
  function decodeEntities(text: string): string {
    return text
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, "\u00A0");
  }

  // Helper to get the wrapper tag for a diff type
  function getWrapper(
    type: DiffType,
  ): { open: string; close: string } | null {
    if (type === DiffType.ADDED) {
      return {
        open: `<ins class="${styles.wordDiff} ${styles.wordAdded}">`,
        close: "</ins>",
      };
    }
    if (type === DiffType.REMOVED) {
      return {
        open: `<del class="${styles.wordDiff} ${styles.wordRemoved}">`,
        close: "</del>",
      };
    }
    return {
      open: `<span class="${styles.wordDiff}">`,
      close: "</span>",
    };
  }

  // Process segments, tracking text position
  let textPos = 0;
  let result = "";

  for (const segment of segments) {
    if (segment.type === "tag") {
      result += segment.content;
    } else {
      // Text segment - we need to split it according to diff ranges
      const text = segment.content;
      const decodedText = decodeEntities(text);

      // Walk through the text, character by character (in decoded form)
      // but output the original encoded form
      let localDecodedPos = 0;
      let localEncodedPos = 0;

      while (localDecodedPos < decodedText.length) {
        const globalPos = textPos + localDecodedPos;

        // Find the range that covers this position
        const range = ranges.find(
          (r) => globalPos >= r.start && globalPos < r.end,
        );

        if (!range) {
          // No range covers this position (shouldn't happen, but be safe)
          // Just output the character
          const char = text[localEncodedPos];
          result += char;
          localEncodedPos++;
          localDecodedPos++;
          continue;
        }

        // How many decoded characters until the end of this range?
        const charsUntilRangeEnd = range.end - globalPos;
        // How many decoded characters until the end of this text segment?
        const charsUntilTextEnd = decodedText.length - localDecodedPos;
        // Take the minimum
        const charsToTake = Math.min(charsUntilRangeEnd, charsUntilTextEnd);

        // Now we need to find the corresponding encoded substring
        // Walk through encoded text, counting decoded characters
        let encodedChunkEnd = localEncodedPos;
        let decodedCount = 0;
        while (decodedCount < charsToTake && encodedChunkEnd < text.length) {
          if (text[encodedChunkEnd] === "&") {
            // Find entity end
            const entityEnd = text.indexOf(";", encodedChunkEnd);
            if (entityEnd !== -1 && entityEnd - encodedChunkEnd < 10) {
              encodedChunkEnd = entityEnd + 1;
            } else {
              encodedChunkEnd++;
            }
          } else {
            encodedChunkEnd++;
          }
          decodedCount++;
        }

        const chunk = text.slice(localEncodedPos, encodedChunkEnd);
        const wrapper = getWrapper(range.type);

        if (wrapper) {
          result += wrapper.open + chunk + wrapper.close;
        } else {
          result += chunk;
        }

        localEncodedPos = encodedChunkEnd;
        localDecodedPos += charsToTake;
      }

      textPos += decodedText.length;
    }
  }

  return result;
}

/**
 * Checks if the current compare method should show word-level highlighting.
 */
function shouldHighlightWordDiff(
  compareMethod: DiffMethod | ((oldStr: string, newStr: string) => Change[]),
): boolean {
  return (
    compareMethod === DiffMethod.CHARS ||
    compareMethod === DiffMethod.WORDS ||
    compareMethod === DiffMethod.WORDS_WITH_SPACE ||
    compareMethod === DiffMethod.JSON ||
    compareMethod === DiffMethod.YAML
  );
}

/**
 * Maps over the word diff and constructs the required React elements to show word diff.
 *
 * @param diffArray Word diff information derived from line information.
 * @param styles Computed styles for the diff viewer.
 * @param compareMethod The diff comparison method being used.
 * @param renderer Optional renderer to format diff words. Useful for syntax highlighting.
 */
export function renderWordDiff(
  diffArray: DiffInformation[],
  styles: ReactDiffViewerStyles,
  compareMethod: DiffMethod | ((oldStr: string, newStr: string) => Change[]),
  renderer?: (chunk: string) => JSX.Element,
): ReactElement[] {
  const showHighlight = shouldHighlightWordDiff(compareMethod);

  // Reconstruct the full line from diff chunks
  const fullLine = diffArray
    .map((d) => (typeof d.value === "string" ? d.value : ""))
    .join("");

  // For very long lines (>500 chars), skip fancy processing - just render plain text
  // without word-level highlighting to avoid performance issues
  const MAX_LINE_LENGTH = 500;
  if (fullLine.length > MAX_LINE_LENGTH) {
    return [<span key="long-line">{fullLine}</span>];
  }

  // If we have a renderer, try to highlight the full line first,
  // then apply diff styling to preserve proper tokenization.
  if (renderer) {
    // Get the syntax-highlighted content
    const highlighted = renderer(fullLine);

    // Check if the renderer uses dangerouslySetInnerHTML (common with Prism, highlight.js, etc.)
    const htmlContent = highlighted?.props?.dangerouslySetInnerHTML?.__html;
    if (typeof htmlContent === "string") {
      // Apply diff styling to the highlighted HTML
      const styledHtml = applyDiffToHighlightedHtml(htmlContent, diffArray, {
        wordDiff: styles.wordDiff,
        wordAdded: showHighlight ? styles.wordAdded : "",
        wordRemoved: showHighlight ? styles.wordRemoved : "",
      });

      // Clone the element with the modified HTML
      return [
        React.cloneElement(highlighted, {
          key: "highlighted-diff",
          dangerouslySetInnerHTML: { __html: styledHtml },
        }),
      ];
    }

    // Renderer doesn't use dangerouslySetInnerHTML - fall through to per-chunk rendering
  }

  // Fallback: render each chunk separately (used for JSON/YAML or non-HTML renderers)
  return diffArray.map((wordDiff, i): JSX.Element => {
    let content: string | JSX.Element;
    if (typeof wordDiff.value === "string") {
      content = wordDiff.value;
    } else {
      // If wordDiff.value is DiffInformation[], we don't handle it. See c0c99f5712.
      content = undefined;
    }

    return wordDiff.type === DiffType.ADDED ? (
      <ins
        key={i}
        className={cn(styles.wordDiff, {
          [styles.wordAdded]: showHighlight,
        })}
      >
        {content}
      </ins>
    ) : wordDiff.type === DiffType.REMOVED ? (
      <del
        key={i}
        className={cn(styles.wordDiff, {
          [styles.wordRemoved]: showHighlight,
        })}
      >
        {content}
      </del>
    ) : (
      <span key={i} className={cn(styles.wordDiff)}>
        {content}
      </span>
    );
  });
}
