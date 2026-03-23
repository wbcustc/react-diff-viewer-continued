import * as React from "react";
import type { ReactElement } from "react";

import { LineNumberPrefix } from "./line-number-prefix.js";
import type { ReactDiffViewerStyles } from "./styles.js";

/**
 * Data passed to the renderComment render prop so consumers know
 * the context of the line they are rendering a comment for.
 */
export interface CommentRenderData {
  lineId: string;
  lineNumber: number;
  prefix: LineNumberPrefix;
  side: "left" | "right";
  splitView: boolean;
  styles: ReactDiffViewerStyles;
}

export interface CommentRowProps {
  lineId: string;
  lineNumber: number;
  prefix: LineNumberPrefix;
  splitView: boolean;
  hideLineNumbers: boolean;
  hasRenderGutter: boolean;
  styles: ReactDiffViewerStyles;
  renderComment: (data: CommentRenderData) => ReactElement | null;
  trRef?: (el: HTMLTableRowElement | null) => void;
}

/**
 * Custom equality function for React.memo — compares data props and renderComment reference.
 * Skips trRef since it's a stable cached callback.
 */
function commentRowPropsAreEqual(
  prev: CommentRowProps,
  next: CommentRowProps,
): boolean {
  return (
    prev.lineId === next.lineId &&
    prev.lineNumber === next.lineNumber &&
    prev.prefix === next.prefix &&
    prev.splitView === next.splitView &&
    prev.hideLineNumbers === next.hideLineNumbers &&
    prev.hasRenderGutter === next.hasRenderGutter &&
    prev.styles === next.styles &&
    prev.renderComment === next.renderComment
  );
}

/**
 * Calculates the total number of columns for the comment cell's colSpan.
 */
function getColSpan(
  splitView: boolean,
  hideLineNumbers: boolean,
  hasRenderGutter: boolean,
): number {
  if (splitView) {
    // Split: [gutter?] [renderGutter?] [marker] [content] | [gutter?] [renderGutter?] [marker] [content]
    let span = 4; // marker + content on each side
    if (!hideLineNumbers) span += 2; // gutter on each side
    if (hasRenderGutter) span += 2; // renderGutter on each side
    return span;
  }
  // Unified: [gutter?] [gutter?] [renderGutter?] [marker] [content]
  let span = 2; // marker + content
  if (!hideLineNumbers) span += 2; // two gutter columns
  if (hasRenderGutter) span += 1;
  return span;
}

/**
 * Memoized component that renders a comment row below a diff line.
 * Renders a full-width <tr> with a single <td> spanning all columns.
 * The consumer's renderComment provides the actual comment UI.
 */
export const CommentRow = React.memo(function CommentRow({
  lineId,
  lineNumber,
  prefix,
  splitView,
  hideLineNumbers,
  hasRenderGutter,
  styles,
  renderComment,
  trRef,
}: CommentRowProps): ReactElement | null {
  const colSpan = getColSpan(splitView, hideLineNumbers, hasRenderGutter);
  const side = prefix === LineNumberPrefix.LEFT ? "left" : "right";

  const content = renderComment({
    lineId,
    lineNumber,
    prefix,
    side,
    splitView,
    styles,
  });

  if (content === null) return null;

  return (
    <tr ref={trRef} className={styles.commentRow} data-comment-line={lineId}>
      <td colSpan={colSpan} className={styles.commentCell}>
        {content}
      </td>
    </tr>
  );
}, commentRowPropsAreEqual);
