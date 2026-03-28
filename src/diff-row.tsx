import cn from "classnames";
import * as React from "react";
import type { JSX, ReactElement, RefObject } from "react";
import type { Change } from "diff";

import {
  type DiffInformation,
  DiffMethod,
  DiffType,
} from "./compute-lines.js";
import { LineNumberPrefix } from "./line-number-prefix.js";
import type { ReactDiffViewerStyles } from "./styles.js";
import { renderWordDiff } from "./render-word-diff.js";

type IntrinsicElements = JSX.IntrinsicElements;

export interface DiffRowProps {
  // Line data (compared in memo)
  leftLineNumber: number | undefined;
  leftType: DiffType;
  leftValue: string | DiffInformation[];
  rightLineNumber: number | undefined;
  rightType: DiffType;
  rightValue: string | DiffInformation[];

  // Pre-computed booleans, NOT the full highlightLines array
  highlightLeft: boolean;
  highlightRight: boolean;

  // Display config (compared in memo)
  splitView: boolean;
  hideLineNumbers: boolean;
  styles: ReactDiffViewerStyles;

  // Callbacks (NOT compared in memo — assumed semantically stable)
  onLineNumberClick?: (
    lineId: string,
    event: React.MouseEvent<HTMLTableCellElement>,
  ) => void;
  onRowContextMenu?: (
    event: React.MouseEvent<HTMLTableRowElement>,
  ) => void;
  renderContent?: (source: string) => ReactElement;
  renderGutter?: (data: {
    lineNumber: number;
    type: DiffType;
    prefix: LineNumberPrefix;
    value: string | DiffInformation[];
    additionalLineNumber: number;
    additionalPrefix: LineNumberPrefix;
    styles: ReactDiffViewerStyles;
  }) => ReactElement;
  compareMethod: DiffMethod | ((oldStr: string, newStr: string) => Change[]);

  // Ref (only passed to 1 row for measurement)
  contentColumnRef?: RefObject<HTMLTableCellElement | null>;

  // Whether cumulative offsets have been computed (controls ref assignment)
  hasCumulativeOffsets: boolean;

  // Row index (for key)
  index: number;
}

/**
 * Custom equality function for React.memo — compares only data props, skips functions.
 */
function diffRowPropsAreEqual(
  prev: DiffRowProps,
  next: DiffRowProps,
): boolean {
  return (
    prev.leftLineNumber === next.leftLineNumber &&
    prev.leftType === next.leftType &&
    prev.leftValue === next.leftValue &&
    prev.rightLineNumber === next.rightLineNumber &&
    prev.rightType === next.rightType &&
    prev.rightValue === next.rightValue &&
    prev.highlightLeft === next.highlightLeft &&
    prev.highlightRight === next.highlightRight &&
    prev.splitView === next.splitView &&
    prev.hideLineNumbers === next.hideLineNumbers &&
    prev.styles === next.styles &&
    prev.contentColumnRef === next.contentColumnRef &&
    prev.hasCumulativeOffsets === next.hasCumulativeOffsets
  );
}

/**
 * Renders a single line (one side of split view, or one line in inline view).
 * This produces the <td> cells for gutter, marker, and content.
 */
function renderLine(
  lineNumber: number | undefined,
  type: DiffType,
  prefix: LineNumberPrefix,
  value: string | DiffInformation[],
  highlightLine: boolean,
  styles: ReactDiffViewerStyles,
  splitView: boolean,
  hideLineNumbers: boolean,
  compareMethod: DiffMethod | ((oldStr: string, newStr: string) => Change[]),
  onLineNumberClick?: (
    lineId: string,
    event: React.MouseEvent<HTMLTableCellElement>,
  ) => void,
  renderContent?: (source: string) => ReactElement,
  renderGutter?: DiffRowProps["renderGutter"],
  contentColumnRef?: RefObject<HTMLTableCellElement | null>,
  hasCumulativeOffsets?: boolean,
  additionalLineNumber?: number,
  additionalPrefix?: LineNumberPrefix,
): ReactElement {
  const lineNumberTemplate = `${prefix}-${lineNumber}`;
  const additionalLineNumberTemplate = `${additionalPrefix}-${additionalLineNumber}`;

  const added = type === DiffType.ADDED;
  const removed = type === DiffType.REMOVED;
  const changed = type === DiffType.CHANGED;

  let content;
  const hasWordDiff = Array.isArray(value);
  if (hasWordDiff) {
    content = renderWordDiff(value, styles, compareMethod, renderContent);
  } else if (renderContent) {
    content = renderContent(value);
  } else {
    content = value;
  }

  let ElementType: keyof IntrinsicElements = "div";
  if (added && !hasWordDiff) {
    ElementType = "ins";
  } else if (removed && !hasWordDiff) {
    ElementType = "del";
  }

  const handleLineNumberClick = lineNumber && onLineNumberClick
    ? (e: React.MouseEvent<HTMLTableCellElement>) => onLineNumberClick(lineNumberTemplate, e)
    : undefined;

  const handleAdditionalLineNumberClick = additionalLineNumber && onLineNumberClick
    ? (e: React.MouseEvent<HTMLTableCellElement>) => onLineNumberClick(additionalLineNumberTemplate, e)
    : undefined;

  // Determine if this content cell should get the measurement ref
  const shouldSetRef = prefix === LineNumberPrefix.LEFT && !hasCumulativeOffsets;

  return (
    <>
      {!hideLineNumbers && (
        <td
          onClick={handleLineNumberClick}
          className={cn(styles.gutter, {
            [styles.emptyGutter]: !lineNumber,
            [styles.diffAdded]: added,
            [styles.diffRemoved]: removed,
            [styles.diffChanged]: changed,
            [styles.highlightedGutter]: highlightLine,
          })}
        >
          <pre className={styles.lineNumber}>{lineNumber}</pre>
        </td>
      )}
      {!splitView && !hideLineNumbers && (
        <td
          onClick={handleAdditionalLineNumberClick}
          className={cn(styles.gutter, {
            [styles.emptyGutter]: !additionalLineNumber,
            [styles.diffAdded]: added,
            [styles.diffRemoved]: removed,
            [styles.diffChanged]: changed,
            [styles.highlightedGutter]: highlightLine,
          })}
        >
          <pre className={styles.lineNumber}>{additionalLineNumber}</pre>
        </td>
      )}
      {renderGutter
        ? renderGutter({
            lineNumber,
            type,
            prefix,
            value,
            additionalLineNumber,
            additionalPrefix,
            styles,
          })
        : null}
      <td
        className={cn(styles.marker, {
          [styles.emptyLine]: !content,
          [styles.diffAdded]: added,
          [styles.diffRemoved]: removed,
          [styles.diffChanged]: changed,
          [styles.highlightedLine]: highlightLine,
        })}
      >
        <pre>
          {added && "+"}
          {removed && "-"}
        </pre>
      </td>
      <td
        ref={shouldSetRef ? contentColumnRef : undefined}
        className={cn(styles.content, {
          [styles.emptyLine]: !content,
          [styles.diffAdded]: added,
          [styles.diffRemoved]: removed,
          [styles.diffChanged]: changed,
          [styles.highlightedLine]: highlightLine,
          left: prefix === LineNumberPrefix.LEFT,
          right: prefix === LineNumberPrefix.RIGHT,
        })}
        onMouseDown={() => {
          const elements = document.getElementsByClassName(
            prefix === LineNumberPrefix.LEFT ? "right" : "left",
          );
          for (let i = 0; i < elements.length; i++) {
            const element = elements.item(i);
            element.classList.add(styles.noSelect);
          }
        }}
        title={
          added && !hasWordDiff
            ? "Added line"
            : removed && !hasWordDiff
              ? "Removed line"
              : undefined
        }
      >
        <ElementType className={styles.contentText}>
          {content}
        </ElementType>
      </td>
    </>
  );
}

/**
 * Memoized component that renders a single diff row (split or inline view).
 * Only re-renders when the line data, highlight state, or display config changes.
 * Function props (callbacks, renderers) are excluded from the equality check.
 */
export const DiffRow = React.memo(function DiffRow(props: DiffRowProps): ReactElement {
  const {
    leftLineNumber,
    leftType,
    leftValue,
    rightLineNumber,
    rightType,
    rightValue,
    highlightLeft,
    highlightRight,
    splitView,
    hideLineNumbers,
    styles,
    onLineNumberClick,
    onRowContextMenu,
    renderContent,
    renderGutter,
    compareMethod,
    contentColumnRef,
    hasCumulativeOffsets,
    index,
  } = props;

  if (splitView) {
    // Split view: one <tr> with left and right cells
    return (
      <tr key={index} className={styles.line} onContextMenu={onRowContextMenu} data-left-line={leftLineNumber} data-right-line={rightLineNumber}>
        {renderLine(
          leftLineNumber,
          leftType,
          LineNumberPrefix.LEFT,
          leftValue,
          highlightLeft,
          styles,
          splitView,
          hideLineNumbers,
          compareMethod,
          onLineNumberClick,
          renderContent,
          renderGutter,
          contentColumnRef,
          hasCumulativeOffsets,
        )}
        {renderLine(
          rightLineNumber,
          rightType,
          LineNumberPrefix.RIGHT,
          rightValue,
          highlightRight,
          styles,
          splitView,
          hideLineNumbers,
          compareMethod,
          onLineNumberClick,
          renderContent,
          renderGutter,
        )}
      </tr>
    );
  }

  // Inline view
  if (leftType === DiffType.REMOVED && rightType === DiffType.ADDED) {
    // Changed line: render two <tr> rows (removed then added)
    return (
      <React.Fragment key={index}>
        <tr className={styles.line} onContextMenu={onRowContextMenu} data-left-line={leftLineNumber} data-right-line={rightLineNumber}>
          {renderLine(
            leftLineNumber,
            leftType,
            LineNumberPrefix.LEFT,
            leftValue,
            highlightLeft,
            styles,
            splitView,
            hideLineNumbers,
            compareMethod,
            onLineNumberClick,
            renderContent,
            renderGutter,
            contentColumnRef,
            hasCumulativeOffsets,
            null,
          )}
        </tr>
        <tr className={styles.line} onContextMenu={onRowContextMenu} data-left-line={leftLineNumber} data-right-line={rightLineNumber}>
          {renderLine(
            null,
            rightType,
            LineNumberPrefix.RIGHT,
            rightValue,
            highlightRight,
            styles,
            splitView,
            hideLineNumbers,
            compareMethod,
            onLineNumberClick,
            renderContent,
            renderGutter,
            undefined,
            undefined,
            rightLineNumber,
            LineNumberPrefix.RIGHT,
          )}
        </tr>
      </React.Fragment>
    );
  }

  let content;
  if (leftType === DiffType.REMOVED) {
    content = renderLine(
      leftLineNumber,
      leftType,
      LineNumberPrefix.LEFT,
      leftValue,
      highlightLeft,
      styles,
      splitView,
      hideLineNumbers,
      compareMethod,
      onLineNumberClick,
      renderContent,
      renderGutter,
      contentColumnRef,
      hasCumulativeOffsets,
      null,
    );
  }
  if (leftType === DiffType.DEFAULT) {
    content = renderLine(
      leftLineNumber,
      leftType,
      LineNumberPrefix.LEFT,
      leftValue,
      highlightLeft,
      styles,
      splitView,
      hideLineNumbers,
      compareMethod,
      onLineNumberClick,
      renderContent,
      renderGutter,
      contentColumnRef,
      hasCumulativeOffsets,
      rightLineNumber,
      LineNumberPrefix.RIGHT,
    );
  }
  if (rightType === DiffType.ADDED) {
    content = renderLine(
      null,
      rightType,
      LineNumberPrefix.RIGHT,
      rightValue,
      highlightRight,
      styles,
      splitView,
      hideLineNumbers,
      compareMethod,
      onLineNumberClick,
      renderContent,
      renderGutter,
      undefined,
      undefined,
      rightLineNumber,
    );
  }

  return (
    <tr key={index} className={styles.line} onContextMenu={onRowContextMenu} data-left-line={leftLineNumber} data-right-line={rightLineNumber}>
      {content}
    </tr>
  );
}, diffRowPropsAreEqual);
