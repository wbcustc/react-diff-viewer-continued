import cn from "classnames";
import * as React from "react";
import type { ReactElement } from "react";

import {
  type DiffInformation,
  DiffType,
} from "./compute-lines.js";
import { Expand } from "./expand.js";
import type { ReactDiffViewerStyles } from "./styles.js";
import { LineNumberPrefix } from "./line-number-prefix.js";

export interface SkippedLineIndicatorProps {
  num: number;
  blockNumber: number;
  leftBlockLineNumber: number;
  rightBlockLineNumber: number;
  hideLineNumbers: boolean;
  splitView: boolean;
  styles: ReactDiffViewerStyles;
  onBlockClick: (id: number) => void;
  codeFoldMessageRenderer?: (
    totalFoldedLines: number,
    leftStartLineNumber: number,
    rightStartLineNumber: number,
  ) => ReactElement;
  renderGutter?: (data: {
    lineNumber: number;
    type: DiffType;
    prefix: LineNumberPrefix;
    value: string | DiffInformation[];
    additionalLineNumber: number;
    additionalPrefix: LineNumberPrefix;
    styles: ReactDiffViewerStyles;
  }) => ReactElement;
}

/**
 * Custom equality function for React.memo — skips comparing callback/render props.
 */
function skippedLineIndicatorPropsAreEqual(
  prev: SkippedLineIndicatorProps,
  next: SkippedLineIndicatorProps,
): boolean {
  return (
    prev.num === next.num &&
    prev.blockNumber === next.blockNumber &&
    prev.leftBlockLineNumber === next.leftBlockLineNumber &&
    prev.rightBlockLineNumber === next.rightBlockLineNumber &&
    prev.hideLineNumbers === next.hideLineNumbers &&
    prev.splitView === next.splitView &&
    prev.styles === next.styles
  );
}

/**
 * Memoized component that renders the code fold / skipped line indicator row.
 */
export const SkippedLineIndicator = React.memo(function SkippedLineIndicator({
  num,
  blockNumber,
  leftBlockLineNumber,
  rightBlockLineNumber,
  hideLineNumbers,
  splitView,
  styles,
  onBlockClick,
  codeFoldMessageRenderer,
  renderGutter,
}: SkippedLineIndicatorProps): ReactElement {
  const handleClick = () => onBlockClick(blockNumber);

  const message = codeFoldMessageRenderer ? (
    codeFoldMessageRenderer(
      num,
      leftBlockLineNumber,
      rightBlockLineNumber,
    )
  ) : (
    <span className={styles.codeFoldContent}>
      @@ -{leftBlockLineNumber - num},{num} +{rightBlockLineNumber - num},{num} @@
    </span>
  );

  const content = (
    <td className={styles.codeFoldContentContainer}>
      <button
        type="button"
        className={styles.codeFoldExpandButton}
        onClick={handleClick}
        tabIndex={0}
      >
        {message}
      </button>
    </td>
  );

  const isUnifiedViewWithoutLineNumbers = !splitView && !hideLineNumbers;
  const expandGutter = (
    <td className={styles.codeFoldGutter}>
      <Expand />
    </td>
  );

  return (
    <tr
      key={`${leftBlockLineNumber}-${rightBlockLineNumber}`}
      className={styles.codeFold}
      onClick={handleClick}
      role="button"
      tabIndex={0}
    >
      {!hideLineNumbers && expandGutter}
      {renderGutter ? (
        <td className={styles.codeFoldGutter} />
      ) : null}
      <td
        className={cn({
          [styles.codeFoldGutter]: isUnifiedViewWithoutLineNumbers,
        })}
      />

      {/* Swap columns only for unified view without line numbers */}
      {isUnifiedViewWithoutLineNumbers ? (
        <React.Fragment>
          <td />
          {content}
        </React.Fragment>
      ) : (
        <React.Fragment>
          {content}
          {renderGutter ? <td /> : null}
          <td />
          <td />
          {!hideLineNumbers ? <td /> : null}
        </React.Fragment>
      )}
    </tr>
  );
}, skippedLineIndicatorPropsAreEqual);
