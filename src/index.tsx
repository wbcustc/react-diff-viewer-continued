import cn from "classnames";
import * as React from "react";
import type { ReactElement, RefObject } from "react";

import type { Change } from "diff";
import memoize from "memoize-one";
import { type Block, computeHiddenBlocks } from "./compute-hidden-blocks.js";
import {
  type DiffInformation,
  DiffMethod,
  DiffType,
  type LineInformation,
  computeLineInformationWorker,
  computeDiff,
} from "./compute-lines.js";
import { Expand } from "./expand.js";
import computeStyles, {
  type ReactDiffViewerStyles,
  type ReactDiffViewerStylesOverride,
} from "./styles.js";

import { Fold } from "./fold.js";
import { LineNumberPrefix } from "./line-number-prefix.js";
import { DiffRow } from "./diff-row.js";
import { SkippedLineIndicator } from "./skipped-line-indicator.js";
import { CommentRow, type CommentRenderData } from "./comment-row.js";

export { LineNumberPrefix } from "./line-number-prefix.js";

export interface InfiniteLoadingProps {
  pageSize: number,
  containerHeight: string
}

export interface ComputedDiffResult {
  lineInformation: LineInformation[];
  lineBlocks: Record<number, number>;
  blocks: Block[];
}

export interface ReactDiffViewerProps {
  // Old value to compare.
  oldValue: string | Record<string, unknown>;
  // New value to compare.
  newValue: string | Record<string, unknown>;
  // Enable/Disable split view.
  splitView?: boolean;
  // Set line Offset
  linesOffset?: number;
  // Enable/Disable word diff.
  disableWordDiff?: boolean;
  // JsDiff text diff method from https://github.com/kpdecker/jsdiff/tree/v4.0.1#api
  compareMethod?: DiffMethod | ((oldStr: string, newStr: string) => Change[]);
  // Number of unmodified lines surrounding each line diff.
  extraLinesSurroundingDiff?: number;
  // Show/hide line number.
  hideLineNumbers?: boolean;
  /**
   * Show the lines indicated here. Specified as L20 or R18 for respectively line 20 on the left or line 18 on the right.
   */
  alwaysShowLines?: string[];
  // Show only diff between the two values.
  showDiffOnly?: boolean;
  // Render prop to format final string before displaying them in the UI.
  renderContent?: (source: string) => ReactElement;
  // Render prop to format code fold message.
  codeFoldMessageRenderer?: (
    totalFoldedLines: number,
    leftStartLineNumber: number,
    rightStartLineNumber: number,
  ) => ReactElement;
  // Event handler for line number click.
  onLineNumberClick?: (
    lineId: string,
    event: React.MouseEvent<HTMLTableCellElement>,
  ) => void;
  // Enable built-in shift+click range selection on line numbers.
  // Defaults to false for backward compatibility.
  enableLineRangeSelection?: boolean;
  // Restrict range selection to "left", "right", or "both" sides.
  // When omitted or "both", no side filtering is applied.
  lineRangeSelectionSide?: "left" | "right" | "both";
  // Called when a range selection completes (shift+click).
  onLineRangeSelected?: (
    startLineId: string,
    endLineId: string,
  ) => void;
  // Called when the user right-clicks on a row within the selected range.
  // The library calls preventDefault() before invoking this callback.
  onLineRangeContextMenu?: (
    event: React.MouseEvent<HTMLTableRowElement>,
    startLineId: string,
    endLineId: string,
  ) => void;
  // render gutter
  renderGutter?: (data: {
    lineNumber: number;
    type: DiffType;
    prefix: LineNumberPrefix;
    value: string | DiffInformation[];
    additionalLineNumber: number;
    additionalPrefix: LineNumberPrefix;
    styles: ReactDiffViewerStyles;
  }) => ReactElement;
  // Array of line ids to highlight lines.
  highlightLines?: string[];
  // Style overrides.
  styles?: ReactDiffViewerStylesOverride;
  // Use dark theme.
  useDarkTheme?: boolean;
  /**
   * Used to describe the thing being diffed
   */
  summary?: string | ReactElement;
  // Title for left column
  leftTitle?: string | ReactElement;
  // Title for left column
  rightTitle?: string | ReactElement;
  // Nonce
  nonce?: string;
  /**
   * to enable infiniteLoading for better performance
   */
  infiniteLoading?: InfiniteLoadingProps;
  /**
   * to display loading element when diff is being computed
   */
  loadingElement?: () => ReactElement
  /**
   * Hide the summary bar (expand/collapse button, change count, filename)
   */
  hideSummary?: boolean
  /**
   * Show debug overlay with virtualization info (for development)
   */
  showDebugInfo?: boolean
  /**
   * Array of line IDs that have comments to display.
   * Uses the same format as highlightLines: "L-{num}" or "R-{num}".
   * The library renders a comment <tr> below each line in this set,
   * invoking renderComment to get the content.
   */
  commentLineIds?: string[];
  /**
   * Render prop called for each line ID in commentLineIds.
   * Returns the consumer's comment UI to display in the comment row.
   * The returned ReactElement is placed inside a <td> spanning the full table width.
   */
  renderComment?: (data: CommentRenderData) => ReactElement | null;
  /**
   * Estimated height (px) for comment rows before they are measured.
   * Affects virtualization scroll accuracy. Defaults to 100.
   */
  estimatedCommentRowHeight?: number;
}

export interface ReactDiffViewerState {
  // Array holding the expanded code folding.
  expandedBlocks?: number[];
  noSelect?: "left" | "right";
  scrollableContainerRef: RefObject<HTMLDivElement>
  computedDiffResult: Record<string, ComputedDiffResult>
  isLoading: boolean
  // For virtualization: the first visible row index
  visibleStartRow: number
  // For variable row heights with text wrapping
  contentColumnWidth: number | null;
  charWidth: number | null;
  cumulativeOffsets: number[] | null;
  // Line range selection state
  rangeAnchor: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
}

class DiffViewer extends React.Component<
  ReactDiffViewerProps,
  ReactDiffViewerState
> {
  private styles: ReactDiffViewerStyles;

  // Cache for on-demand word diff computation
  private wordDiffCache: Map<string, { left: DiffInformation[]; right: DiffInformation[] }> = new Map();

  // Reference-equality cache for getMemoisedKey — avoids JSON.stringify on large inputs
  private static cacheCounter = 0;
  private lastCacheProps: {
    oldValue: unknown; newValue: unknown; disableWordDiff: boolean;
    compareMethod: unknown; linesOffset: number;
    alwaysShowLines: unknown; extraLinesSurroundingDiff: number;
  } | null = null;
  private lastCacheKey: string = '';

  // Refs for measuring content column width and character width
  private contentColumnRef: RefObject<HTMLTableCellElement | null> = React.createRef();
  private charMeasureRef: RefObject<HTMLSpanElement | null> = React.createRef();
  private stickyHeaderRef: RefObject<HTMLDivElement | null> = React.createRef();
  private resizeObserver: ResizeObserver | null = null;

  // Comment row height measurement for virtualization
  private commentRowObserver: ResizeObserver | null = null;
  private commentRowHeights: Map<string, number> = new Map();
  private commentRowElements: Map<string, HTMLTableRowElement> = new Map();
  private commentRowRefCache: Map<string, (el: HTMLTableRowElement | null) => void> = new Map();
  private pendingOffsetRecalc = false;

  private static readonly ESTIMATED_COMMENT_ROW_HEIGHT = 100;

  /**
   * Shallow comparison for string arrays — avoids unnecessary work when
   * the consumer creates a new array reference with identical contents.
   */
  private static shallowArrayEqual(a?: string[], b?: string[]): boolean {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  public static defaultProps: ReactDiffViewerProps = {
    oldValue: "",
    newValue: "",
    splitView: true,
    highlightLines: [],
    disableWordDiff: false,
    compareMethod: DiffMethod.CHARS,
    styles: {},
    hideLineNumbers: false,
    extraLinesSurroundingDiff: 3,
    showDiffOnly: true,
    useDarkTheme: false,
    linesOffset: 0,
    nonce: "",
  };

  public constructor(props: ReactDiffViewerProps) {
    super(props);

    this.state = {
      expandedBlocks: [],
      noSelect: undefined,
      scrollableContainerRef: React.createRef(),
      computedDiffResult: {},
      isLoading: false,
      visibleStartRow: 0,
      contentColumnWidth: null,
      charWidth: null,
      cumulativeOffsets: null,
      rangeAnchor: null,
      rangeStart: null,
      rangeEnd: null,
    };
  }

  /**
   * Memoized conversion of commentLineIds array to Set for O(1) lookups.
   */
  private getCommentLineIdsSet: (ids: string[] | undefined) => Set<string> = memoize(
    (ids: string[] | undefined): Set<string> => new Set(ids || []),
  );

  /**
   * Memoized conversion of highlightLines array to Set for O(1) lookups.
   */
  private getHighlightLinesSet: (lines: string[] | undefined) => Set<string> = memoize(
    (lines: string[] | undefined): Set<string> => new Set(lines || []),
  );

  /**
   * Expands a start/end line ID pair into a Set of all line IDs in the range.
   * E.g. expandRange("L-5", "L-10") => Set{"L-5","L-6","L-7","L-8","L-9","L-10"}
   */
  private static expandRange(startId: string, endId: string): Set<string> {
    const [prefix, startNum] = startId.split('-');
    const [, endNum] = endId.split('-');
    const lo = Math.min(Number(startNum), Number(endNum));
    const hi = Math.max(Number(startNum), Number(endNum));
    const set = new Set<string>();
    for (let i = lo; i <= hi; i++) {
      set.add(`${prefix}-${i}`);
    }
    return set;
  }

  /**
   * Memoized computation of the range selection Set from rangeStart/rangeEnd state.
   */
  private getRangeSelectionSet: (rangeStart: string | null, rangeEnd: string | null) => Set<string> = memoize(
    (rangeStart: string | null, rangeEnd: string | null): Set<string> => {
      if (rangeStart && rangeEnd) {
        return DiffViewer.expandRange(rangeStart, rangeEnd);
      }
      return new Set();
    },
  );

  /**
   * Internal click handler for line numbers that wraps the consumer's onLineNumberClick
   * and adds range selection logic when enableLineRangeSelection is true.
   */
  private handleLineNumberClickInternal = (
    lineId: string,
    event: React.MouseEvent<HTMLTableCellElement>,
  ): void => {
    // Always forward to the consumer's callback first
    this.props.onLineNumberClick?.(lineId, event);

    if (!this.props.enableLineRangeSelection) return;

    if (this.props.lineRangeSelectionSide && this.props.lineRangeSelectionSide !== "both") {
      const expectedPrefix = this.props.lineRangeSelectionSide === "left" ? "L" : "R";
      const [clickPrefix] = lineId.split('-');
      if (clickPrefix !== expectedPrefix) return;
    }

    if (event.shiftKey && this.state.rangeAnchor) {
      const [anchorPrefix] = this.state.rangeAnchor.split('-');
      const [clickPrefix] = lineId.split('-');
      if (anchorPrefix === clickPrefix) {
        // Same side: complete the range
        this.setState({
          rangeStart: this.state.rangeAnchor,
          rangeEnd: lineId,
        });
        this.props.onLineRangeSelected?.(this.state.rangeAnchor, lineId);
      } else {
        // Cross-side: reset anchor, clear range
        this.setState({
          rangeAnchor: lineId,
          rangeStart: null,
          rangeEnd: null,
        });
      }
    } else {
      // Non-shift click: set new anchor and 1-line range
      this.setState({
        rangeAnchor: lineId,
        rangeStart: lineId,
        rangeEnd: lineId,
      });
      this.props.onLineRangeSelected?.(lineId, lineId);
    }
  };

  /**
   * Context menu handler for diff rows. Fires onLineRangeContextMenu
   * only when right-clicking a row within the current range selection.
   */
  private handleRowContextMenu = (
    event: React.MouseEvent<HTMLTableRowElement>,
  ): void => {
    if (!this.props.onLineRangeContextMenu) return;

    const { rangeStart, rangeEnd } = this.state;
    if (!rangeStart || !rangeEnd) return;

    const rangeSet = this.getRangeSelectionSet(rangeStart, rangeEnd);
    if (rangeSet.size === 0) return;

    const tr = event.currentTarget;
    const leftLine = tr.dataset.leftLine;
    const rightLine = tr.dataset.rightLine;

    const leftInRange = leftLine && rangeSet.has(`L-${leftLine}`);
    const rightInRange = rightLine && rangeSet.has(`R-${rightLine}`);

    if (leftInRange || rightInRange) {
      event.preventDefault();
      this.props.onLineRangeContextMenu(event, rangeStart, rangeEnd);
    }
  };

  /**
   * Creates a ref callback for a CommentRow's <tr> element.
   * When mounted, observes it for height changes via ResizeObserver.
   * Callbacks are cached per lineId to avoid creating new closures on every render.
   */
  private getCommentRowRef = (lineId: string): ((el: HTMLTableRowElement | null) => void) => {
    let cached = this.commentRowRefCache.get(lineId);
    if (!cached) {
      cached = (el: HTMLTableRowElement | null) => {
        if (el) {
          this.commentRowElements.set(lineId, el);
          this.commentRowObserver?.observe(el);
        } else {
          const prev = this.commentRowElements.get(lineId);
          if (prev) {
            this.commentRowObserver?.unobserve(prev);
          }
          this.commentRowElements.delete(lineId);
        }
      };
      this.commentRowRefCache.set(lineId, cached);
    }
    return cached;
  };

  /**
   * Debounced offset recalculation — batches multiple ResizeObserver callbacks
   * into a single requestAnimationFrame.
   */
  private scheduleOffsetRecalc = (): void => {
    if (!this.pendingOffsetRecalc) {
      this.pendingOffsetRecalc = true;
      requestAnimationFrame(() => {
        this.pendingOffsetRecalc = false;
        this.recalculateOffsets();
      });
    }
  };

  /**
   * Initializes the ResizeObserver for measuring comment row heights.
   */
  private initCommentRowObserver = (): void => {
    if (typeof ResizeObserver === "undefined" || this.commentRowObserver) return;
    this.commentRowObserver = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const el = entry.target as HTMLTableRowElement;
        const lineId = el.getAttribute("data-comment-line");
        if (!lineId) continue;
        const height = entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight;
        const prev = this.commentRowHeights.get(lineId);
        if (prev !== height) {
          this.commentRowHeights.set(lineId, height);
          changed = true;
        }
      }
      if (changed && this.props.infiniteLoading) {
        this.scheduleOffsetRecalc();
      }
    });
  };

  /**
   * Computes word diff on-demand for a line, with caching.
   * This is used when word diff was deferred during initial computation.
   */
  private getWordDiffValues = (
    left: DiffInformation,
    right: DiffInformation,
    lineIndex: number
  ): { leftValue: string | DiffInformation[]; rightValue: string | DiffInformation[] } => {
    // Handle empty left/right
    if (!left || !right) {
      return { leftValue: left?.value, rightValue: right?.value };
    }

    // If no raw values, word diff was already computed or disabled
    // Use explicit undefined check since empty string is a valid raw value
    if (left.rawValue === undefined || right.rawValue === undefined) {
      return { leftValue: left.value, rightValue: right.value };
    }

    // Check cache
    const cacheKey = `${lineIndex}-${left.rawValue}-${right.rawValue}`;
    let cached = this.wordDiffCache.get(cacheKey);

    if (!cached) {
      // Compute word diff on-demand
      // Use CHARS method for on-demand computation since rawValue is always a string
      // (JSON/YAML methods only work with objects, not the string lines we have here)
      const compareMethod = (this.props.compareMethod === DiffMethod.JSON || this.props.compareMethod === DiffMethod.YAML)
        ? DiffMethod.CHARS
        : this.props.compareMethod;
      const computed = computeDiff(left.rawValue, right.rawValue, compareMethod);
      cached = { left: computed.left, right: computed.right };
      this.wordDiffCache.set(cacheKey, cached);
    }

    return { leftValue: cached.left, rightValue: cached.right };
  };

  /**
   * Resets code block expand to the initial stage. Will be exposed to the parent component via
   * refs.
   */
  public resetCodeBlocks = (): boolean => {
    if (this.state.expandedBlocks.length > 0) {
      this.setState({
        expandedBlocks: [],
      });
      return true;
    }
    return false;
  };

  /**
   * Clears the current line range selection. Exposed to parent components via refs.
   */
  public clearRangeSelection = (): void => {
    this.setState({ rangeAnchor: null, rangeStart: null, rangeEnd: null });
  };

  /**
   * Pushes the target expanded code block to the state. During the re-render,
   * this value is used to expand/fold unmodified code.
   */
  private onBlockExpand = (id: number): void => {
    const prevState = this.state.expandedBlocks.slice();
    prevState.push(id);

    this.setState(
      { expandedBlocks: prevState },
      () => this.recalculateOffsets()
    );
  };

  /**
   * Gets the height of the sticky header, if present.
   */
  private getStickyHeaderHeight(): number {
    return this.stickyHeaderRef.current?.offsetHeight || 0;
  }

  /**
   * Measures the width of a single character in the monospace font.
   * Falls back to 7.2px if measurement fails.
   */
  private measureCharWidth(): number {
    const span = this.charMeasureRef.current;
    if (!span) return 7.2; // fallback
    return span.getBoundingClientRect().width || 7.2;
  }

  /**
   * Measures the available width for content in a content column.
   * Falls back to estimating from container width if direct measurement fails.
   */
  private measureContentColumnWidth(): number | null {
    // Try direct measurement first
    const cell = this.contentColumnRef.current;
    if (cell && cell.clientWidth > 0) {
      const style = window.getComputedStyle(cell);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const width = cell.clientWidth - padding;
      if (width > 0) return width;
    }

    // Fallback: estimate from container width
    // In split view: container has 2 content columns + gutters (50px each) + markers (28px each)
    // In unified view: 1 content column + 2 gutters + 1 marker
    const container = this.state.scrollableContainerRef.current;
    if (!container || container.clientWidth <= 0) return null;

    const containerWidth = container.clientWidth;
    const gutterWidth = this.props.hideLineNumbers ? 0 : 50;
    const markerWidth = 28;
    const gutterCount = this.props.splitView ? 2 : 2; // left gutter(s)
    const markerCount = this.props.splitView ? 2 : 1;
    const contentColumns = this.props.splitView ? 2 : 1;

    const fixedWidth = gutterCount * gutterWidth + markerCount * markerWidth;
    const availableWidth = containerWidth - fixedWidth;
    return Math.max(100, availableWidth / contentColumns); // minimum 100px
  }

  /**
   * Gets the text length from a value that may be a string or DiffInformation array.
   */
  private getTextLength(value: string | DiffInformation[] | undefined): number {
    if (!value) return 0;
    if (typeof value === 'string') return value.length;
    return value.reduce((sum, d) => sum + (typeof d.value === 'string' ? d.value.length : 0), 0);
  }

  /**
   * Builds cumulative vertical offsets for each line based on character count and column width.
   * This allows accurate scroll position calculations with variable row heights.
   */
  private buildCumulativeOffsets(
    lineInformation: LineInformation[],
    lineBlocks: Record<number, number>,
    blocks: Block[],
    expandedBlocks: number[],
    showDiffOnly: boolean,
    charWidth: number,
    columnWidth: number,
    splitView: boolean,
    commentLineIdsSet?: Set<string>,
  ): number[] {
    const offsets: number[] = [0];
    const seenBlocks = new Set<number>();
    const expandedBlocksSet = new Set(expandedBlocks);
    const estimatedCommentHeight = this.props.estimatedCommentRowHeight ?? DiffViewer.ESTIMATED_COMMENT_ROW_HEIGHT;

    for (let i = 0; i < lineInformation.length; i++) {
      const line = lineInformation[i];

      if (showDiffOnly) {
        const blockIndex = lineBlocks[i];
        if (blockIndex !== undefined && !expandedBlocksSet.has(blockIndex)) {
          const isLastLine = blocks[blockIndex].endLine === i;
          if (!seenBlocks.has(blockIndex) && isLastLine) {
            seenBlocks.add(blockIndex);
            offsets.push(offsets[offsets.length - 1] + DiffViewer.ESTIMATED_ROW_HEIGHT);
          }
          continue;
        }
      }

      // Calculate visual rows for this line
      const leftLen = line.left?.value ? this.getTextLength(line.left.value) : 0;
      const rightLen = line.right?.value ? this.getTextLength(line.right.value) : 0;
      const maxLen = splitView ? Math.max(leftLen, rightLen) : (leftLen || rightLen);
      const charsPerRow = Math.floor(columnWidth / charWidth);
      const visualRows = charsPerRow > 0 ? Math.max(1, Math.ceil(maxLen / charsPerRow)) : 1;

      let lineHeight = visualRows * DiffViewer.ESTIMATED_ROW_HEIGHT;

      // Add height for comment rows on this line
      if (commentLineIdsSet && commentLineIdsSet.size > 0) {
        const leftId = line.left?.lineNumber ? `L-${line.left.lineNumber}` : null;
        const rightId = line.right?.lineNumber ? `R-${line.right.lineNumber}` : null;
        if (leftId && commentLineIdsSet.has(leftId)) {
          lineHeight += this.commentRowHeights.get(leftId) ?? estimatedCommentHeight;
        }
        if (rightId && rightId !== leftId && commentLineIdsSet.has(rightId)) {
          lineHeight += this.commentRowHeights.get(rightId) ?? estimatedCommentHeight;
        }
      }

      offsets.push(offsets[offsets.length - 1] + lineHeight);
    }

    return offsets;
  }

  /**
   * Binary search to find the line index at a given scroll offset.
   */
  private findLineAtOffset(scrollTop: number, offsets: number[]): number {
    let low = 0;
    let high = offsets.length - 2;
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (offsets[mid] <= scrollTop) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low;
  }

  /**
   * Recalculates cumulative offsets based on current measurements.
   * Called on resize and when blocks are expanded/collapsed.
   */
  private recalculateOffsets = (): void => {
    if (!this.props.infiniteLoading) return;

    const columnWidth = this.measureContentColumnWidth();
    const charWidth = this.measureCharWidth();
    if (!columnWidth) return;

    const cacheKey = this.getMemoisedKey();
    const { lineInformation, lineBlocks, blocks } = this.state.computedDiffResult[cacheKey] ?? {};
    if (!lineInformation) return;

    const offsets = this.buildCumulativeOffsets(
      lineInformation,
      lineBlocks,
      blocks,
      this.state.expandedBlocks,
      this.props.showDiffOnly,
      charWidth,
      columnWidth,
      this.props.splitView,
      this.getCommentLineIdsSet(this.props.commentLineIds),
    );

    this.setState({ cumulativeOffsets: offsets, contentColumnWidth: columnWidth, charWidth }, () => {
      // Force a scroll position update to recalculate visible rows with new offsets
      this.onScroll();
    });
  };

  /**
   * Computes final styles for the diff viewer. It combines the default styles with the user
   * supplied overrides. The computed styles are cached with performance in mind.
   *
   * @param styles User supplied style overrides.
   */
  private computeStyles: (
    styles: ReactDiffViewerStylesOverride,
    useDarkTheme: boolean,
    nonce: string,
  ) => ReactDiffViewerStyles = memoize(computeStyles);

  /**
   *
   * Generates a unique cache key based on the current props used in diff computation.
   *
   * Uses reference equality to avoid expensive JSON.stringify on large inputs.
   * A new key is only generated when any relevant prop reference changes.
   *
   */
  private getMemoisedKey = () => {
    const {
      oldValue,
      newValue,
      disableWordDiff,
      compareMethod,
      linesOffset,
      alwaysShowLines,
      extraLinesSurroundingDiff,
    } = this.props;

    if (
      this.lastCacheProps &&
      this.lastCacheProps.oldValue === oldValue &&
      this.lastCacheProps.newValue === newValue &&
      this.lastCacheProps.disableWordDiff === disableWordDiff &&
      this.lastCacheProps.compareMethod === compareMethod &&
      this.lastCacheProps.linesOffset === linesOffset &&
      this.lastCacheProps.alwaysShowLines === alwaysShowLines &&
      this.lastCacheProps.extraLinesSurroundingDiff === extraLinesSurroundingDiff
    ) {
      return this.lastCacheKey;
    }

    this.lastCacheKey = `k-${++DiffViewer.cacheCounter}`;
    this.lastCacheProps = {
      oldValue, newValue, disableWordDiff, compareMethod,
      linesOffset, alwaysShowLines, extraLinesSurroundingDiff,
    };
    return this.lastCacheKey;
  }

  /**
   * Computes and memoizes the diff result between `oldValue` and `newValue`.
   * 
   * If a memoized result exists for the current input configuration, it uses that.
   * Otherwise, it runs the diff logic in a Web Worker to avoid blocking the UI.
   * It also computes hidden line blocks for collapsing unchanged sections,
   * and stores the result in the local component state.
   */
  private memoisedCompute = async () => {
    const {
      oldValue,
      newValue,
      disableWordDiff,
      compareMethod,
      linesOffset
    } = this.props;

    const cacheKey = this.getMemoisedKey()
    if (!!this.state.computedDiffResult[cacheKey]) {
      this.setState((prev) => ({
        ...prev,
        isLoading: false
      }))
      return;
    }

    // Defer word diff computation when using infinite loading with reasonable container height
    // This significantly improves initial render time for large diffs
    const containerHeight = this.props.infiniteLoading?.containerHeight;
    const containerHeightPx = containerHeight
      ? typeof containerHeight === 'number'
        ? containerHeight
        : parseInt(containerHeight, 10) || 0
      : 0;
    const shouldDeferWordDiff = !disableWordDiff &&
      !!this.props.infiniteLoading &&
      containerHeightPx > 0 &&
      containerHeightPx < 2000;

    const { lineInformation, diffLines } = await computeLineInformationWorker(
      oldValue,
      newValue,
      disableWordDiff,
      compareMethod,
      linesOffset,
      this.props.alwaysShowLines,
      shouldDeferWordDiff,
    );

    const extraLines =
      this.props.extraLinesSurroundingDiff < 0
        ? 0
        : Math.round(this.props.extraLinesSurroundingDiff);

    const { lineBlocks, blocks } = computeHiddenBlocks(
      lineInformation,
      diffLines,
      extraLines,
    );

    this.state.computedDiffResult[cacheKey] = { lineInformation, lineBlocks, blocks }
    this.setState((prev) => ({
      ...prev,
      computedDiffResult: this.state.computedDiffResult,
      isLoading: false,
    }), () => {
      // Trigger offset recalculation after diff is computed and rendered
      // Use requestAnimationFrame to ensure DOM is ready for measurement
      if (this.props.infiniteLoading) {
        requestAnimationFrame(() => this.recalculateOffsets());
      }
    })
  }

  // Estimated row height based on lineHeight: 1.6em with 12px base font
  private static readonly ESTIMATED_ROW_HEIGHT = 19;

  /**
   * Handles scroll events on the scrollable container.
   *
   * Updates the visible start row for virtualization.
   */
  private onScroll = () => {
    const container = this.state.scrollableContainerRef.current
    if (!container || !this.props.infiniteLoading) return;

    // Account for sticky header height in scroll calculations
    const headerHeight = this.getStickyHeaderHeight();
    const contentScrollTop = Math.max(0, container.scrollTop - headerHeight);

    const { cumulativeOffsets } = this.state;
    const newStartRow = cumulativeOffsets
      ? this.findLineAtOffset(contentScrollTop, cumulativeOffsets)
      : Math.floor(contentScrollTop / DiffViewer.ESTIMATED_ROW_HEIGHT);

    // Only update state if the start row changed (avoid unnecessary re-renders)
    if (newStartRow !== this.state.visibleStartRow) {
      this.setState({ visibleStartRow: newStartRow });
    }
  }

  /**
   * Generates the entire diff view with virtualization support.
   */
  private renderDiff = (): {
    diffNodes: ReactElement[];
    lineInformation: LineInformation[];
    blocks: Block[];
    totalRenderedRows: number;
    topPadding: number;
    bottomPadding: number;
    totalContentHeight: number;
    renderedCount: number;
    debug: {
      visibleRowStart: number;
      visibleRowEnd: number;
      totalRows: number;
      offsetsLength: number;
      renderedCount: number;
      scrollTop: number;
      headerHeight: number;
      contentScrollTop: number;
      clientHeight: number;
    };
  } => {
    const { splitView, infiniteLoading, showDiffOnly } = this.props;
    const { computedDiffResult, expandedBlocks, visibleStartRow, scrollableContainerRef, cumulativeOffsets } = this.state
    const cacheKey = this.getMemoisedKey()
    const { lineInformation = [], lineBlocks = [], blocks = [] } = computedDiffResult[cacheKey] ?? {}

    // Build Set for O(1) comment line lookups
    const commentLineIdsSet = this.getCommentLineIdsSet(this.props.commentLineIds);
    const hasComments = commentLineIdsSet.size > 0 && !!this.props.renderComment;
    const hasRenderGutter = !!this.props.renderGutter;
    // Build Set for O(1) highlight line lookups
    const highlightLinesSet = this.getHighlightLinesSet(this.props.highlightLines);
    // Build Set for O(1) range selection lookups
    const rangeSet = this.getRangeSelectionSet(this.state.rangeStart, this.state.rangeEnd);
    // Build Set for O(1) expanded block lookups
    const expandedBlocksSet = new Set(expandedBlocks);

    // Calculate visible range for virtualization
    let visibleRowStart = 0;
    let visibleRowEnd = Infinity;
    const buffer = 5; // render extra rows above/below viewport

    if (infiniteLoading && scrollableContainerRef.current) {
      const container = scrollableContainerRef.current;
      // Account for sticky header height in scroll calculations
      const headerHeight = this.getStickyHeaderHeight();
      const contentScrollTop = Math.max(0, container.scrollTop - headerHeight);

      if (cumulativeOffsets) {
        // Variable height mode: use binary search to find visible range
        const totalHeight = cumulativeOffsets[cumulativeOffsets.length - 1] || 0;
        const lastRowIndex = cumulativeOffsets.length - 2;

        visibleRowStart = Math.max(0, this.findLineAtOffset(contentScrollTop, cumulativeOffsets) - buffer);
        visibleRowEnd = this.findLineAtOffset(contentScrollTop + container.clientHeight, cumulativeOffsets) + buffer;

        // IMPORTANT: The calculated offsets may overestimate row heights (based on char count),
        // but actual CSS rendering might produce shorter rows. To prevent empty space,
        // ensure we render at least enough rows to fill the viewport using ESTIMATED_ROW_HEIGHT
        // as a conservative minimum.
        const minRowsToFillViewport = Math.ceil(container.clientHeight / DiffViewer.ESTIMATED_ROW_HEIGHT);
        visibleRowEnd = Math.max(visibleRowEnd, visibleRowStart + minRowsToFillViewport + buffer);

        // Also ensure we render all rows when near the bottom
        if (contentScrollTop + container.clientHeight >= totalHeight - buffer * DiffViewer.ESTIMATED_ROW_HEIGHT) {
          visibleRowEnd = lastRowIndex + buffer;
        }
      } else {
        // Fixed height fallback
        const viewportRows = Math.ceil(container.clientHeight / DiffViewer.ESTIMATED_ROW_HEIGHT);
        visibleRowStart = Math.max(0, visibleStartRow - buffer);
        visibleRowEnd = visibleStartRow + viewportRows + buffer;
      }
    }

    // First pass: build a map of lineIndex -> renderedRowIndex
    // This accounts for code folding where some lines don't render or render as fold indicators
    const lineToRowMap: Map<number, number> = new Map();
    const seenBlocks = new Set<number>();
    let currentRow = 0;

    for (let i = 0; i < lineInformation.length; i++) {
      const blockIndex = lineBlocks[i];

      if (showDiffOnly && blockIndex !== undefined) {
        if (!expandedBlocksSet.has(blockIndex)) {
          // Line is in a collapsed block
          const lastLineOfBlock = blocks[blockIndex].endLine === i;
          if (!seenBlocks.has(blockIndex) && lastLineOfBlock) {
            // This line renders as a fold indicator
            seenBlocks.add(blockIndex);
            lineToRowMap.set(i, currentRow);
            currentRow++;
          }
          // Other lines in collapsed block don't render
        } else {
          // Block is expanded, line renders normally
          lineToRowMap.set(i, currentRow);
          currentRow++;
        }
      } else {
        // Not in a block or showDiffOnly is false, line renders normally
        lineToRowMap.set(i, currentRow);
        currentRow++;
      }
    }

    const totalRenderedRows = currentRow;

    // Second pass: render only lines in the visible range
    const diffNodes: ReactElement[] = [];
    let topPadding = 0;
    let firstVisibleFound = false;
    let lastRenderedRowIndex = -1;
    seenBlocks.clear();

    for (let lineIndex = 0; lineIndex < lineInformation.length; lineIndex++) {
      const line = lineInformation[lineIndex];
      const rowIndex = lineToRowMap.get(lineIndex);

      // Skip lines that don't render (hidden in collapsed blocks)
      if (rowIndex === undefined) continue;

      // Skip lines before visible range
      if (rowIndex < visibleRowStart) {
        continue;
      }

      // Stop after visible range
      if (rowIndex > visibleRowEnd) {
        break;
      }

      // Calculate top padding from the first visible row
      if (!firstVisibleFound) {
        topPadding = cumulativeOffsets
          ? cumulativeOffsets[rowIndex] || 0
          : rowIndex * DiffViewer.ESTIMATED_ROW_HEIGHT;
        firstVisibleFound = true;
      }

      // Track the last rendered row for bottom padding calculation
      lastRenderedRowIndex = rowIndex;

      // Render the line
      if (showDiffOnly) {
        const blockIndex = lineBlocks[lineIndex];

        if (blockIndex !== undefined) {
          const lastLineOfBlock = blocks[blockIndex].endLine === lineIndex;
          if (
            !expandedBlocksSet.has(blockIndex) &&
            lastLineOfBlock
          ) {
            diffNodes.push(
              <SkippedLineIndicator
                key={`fold-${lineIndex}`}
                num={blocks[blockIndex].lines}
                blockNumber={blockIndex}
                leftBlockLineNumber={line.left.lineNumber}
                rightBlockLineNumber={line.right.lineNumber}
                hideLineNumbers={this.props.hideLineNumbers}
                splitView={this.props.splitView}
                styles={this.styles}
                onBlockClick={this.onBlockExpand}
                codeFoldMessageRenderer={this.props.codeFoldMessageRenderer}
                renderGutter={this.props.renderGutter}
              />
            );
            continue;
          }
          if (!expandedBlocksSet.has(blockIndex)) {
            continue;
          }
        }
      }

      // Compute word diff on-demand if deferred
      const { leftValue, rightValue } = this.getWordDiffValues(line.left, line.right, lineIndex);

      diffNodes.push(
        <DiffRow
          key={lineIndex}
          index={lineIndex}
          leftLineNumber={line.left.lineNumber}
          leftType={line.left.type}
          leftValue={leftValue}
          rightLineNumber={line.right.lineNumber}
          rightType={line.right.type}
          rightValue={rightValue}
          highlightLeft={highlightLinesSet.has(`L-${line.left.lineNumber}`) || rangeSet.has(`L-${line.left.lineNumber}`)}
          highlightRight={highlightLinesSet.has(`R-${line.right.lineNumber}`) || rangeSet.has(`R-${line.right.lineNumber}`)}
          splitView={splitView}
          hideLineNumbers={this.props.hideLineNumbers}
          styles={this.styles}
          onLineNumberClick={this.handleLineNumberClickInternal}
          onRowContextMenu={this.handleRowContextMenu}
          renderContent={this.props.renderContent}
          renderGutter={this.props.renderGutter}
          compareMethod={this.props.compareMethod}
          contentColumnRef={this.contentColumnRef}
          hasCumulativeOffsets={!!cumulativeOffsets}
        />
      );

      // Inject comment rows after the DiffRow
      if (hasComments) {
        const leftLineId = line.left?.lineNumber ? `L-${line.left.lineNumber}` : null;
        const rightLineId = line.right?.lineNumber ? `R-${line.right.lineNumber}` : null;

        if (leftLineId && commentLineIdsSet.has(leftLineId)) {
          diffNodes.push(
            <CommentRow
              key={`comment-${leftLineId}`}
              lineId={leftLineId}
              lineNumber={line.left.lineNumber}
              prefix={LineNumberPrefix.LEFT}
              splitView={splitView}
              hideLineNumbers={this.props.hideLineNumbers}
              hasRenderGutter={hasRenderGutter}
              styles={this.styles}
              renderComment={this.props.renderComment}
              trRef={this.getCommentRowRef(leftLineId)}
            />,
          );
        }
        if (rightLineId && rightLineId !== leftLineId && commentLineIdsSet.has(rightLineId)) {
          diffNodes.push(
            <CommentRow
              key={`comment-${rightLineId}`}
              lineId={rightLineId}
              lineNumber={line.right.lineNumber}
              prefix={LineNumberPrefix.RIGHT}
              splitView={splitView}
              hideLineNumbers={this.props.hideLineNumbers}
              hasRenderGutter={hasRenderGutter}
              styles={this.styles}
              renderComment={this.props.renderComment}
              trRef={this.getCommentRowRef(rightLineId)}
            />,
          );
        }
      }
    }

    // Calculate total content height
    const totalContentHeight = cumulativeOffsets
      ? cumulativeOffsets[cumulativeOffsets.length - 1] || 0
      : totalRenderedRows * DiffViewer.ESTIMATED_ROW_HEIGHT;

    // Calculate bottom padding: space after the last rendered row
    const bottomPadding = cumulativeOffsets && lastRenderedRowIndex >= 0
      ? totalContentHeight - (cumulativeOffsets[lastRenderedRowIndex + 1] || totalContentHeight)
      : 0;

    return {
      diffNodes,
      blocks,
      lineInformation,
      totalRenderedRows,
      topPadding,
      bottomPadding,
      totalContentHeight,
      renderedCount: diffNodes.length,
      // Debug info
      debug: {
        visibleRowStart,
        visibleRowEnd,
        totalRows: totalRenderedRows,
        offsetsLength: cumulativeOffsets?.length ?? 0,
        renderedCount: diffNodes.length,
        scrollTop: scrollableContainerRef.current?.scrollTop ?? 0,
        headerHeight: this.getStickyHeaderHeight(),
        contentScrollTop: scrollableContainerRef.current
          ? Math.max(0, scrollableContainerRef.current.scrollTop - this.getStickyHeaderHeight())
          : 0,
        clientHeight: scrollableContainerRef.current?.clientHeight ?? 0,
      }
    };
  };

  componentDidUpdate(prevProps: ReactDiffViewerProps) {
    if (
      prevProps.oldValue !== this.props.oldValue ||
      prevProps.newValue !== this.props.newValue ||
      prevProps.compareMethod !== this.props.compareMethod ||
      prevProps.disableWordDiff !== this.props.disableWordDiff ||
      prevProps.linesOffset !== this.props.linesOffset
    ) {
      // Clear word diff cache when diff changes
      this.wordDiffCache.clear();

      // Reset scroll position to top
      const container = this.state.scrollableContainerRef.current;
      if (container) {
        container.scrollTop = 0;
      }

      this.setState((prev) => ({
        ...prev,
        isLoading: true,
        visibleStartRow: 0,
        cumulativeOffsets: null as number[] | null,
      }))
      this.memoisedCompute();
    }

    // Recalculate offsets when commentLineIds change
    if (!DiffViewer.shallowArrayEqual(prevProps.commentLineIds, this.props.commentLineIds)) {
      // Clean stale entries from height measurement maps and ref cache
      const currentSet = this.getCommentLineIdsSet(this.props.commentLineIds);
      for (const lineId of this.commentRowHeights.keys()) {
        if (!currentSet.has(lineId)) {
          this.commentRowHeights.delete(lineId);
          this.commentRowRefCache.delete(lineId);
          const el = this.commentRowElements.get(lineId);
          if (el) {
            this.commentRowObserver?.unobserve(el);
            this.commentRowElements.delete(lineId);
          }
        }
      }
      if (this.props.infiniteLoading) {
        this.scheduleOffsetRecalc();
      }
    }
  }

  componentDidMount() {
    this.setState((prev) => ({
      ...prev,
      isLoading: true
    }))
    this.memoisedCompute();

    // Set up ResizeObserver for recalculating offsets on container resize
    if (typeof ResizeObserver !== 'undefined' && this.props.infiniteLoading) {
      this.resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => this.recalculateOffsets());
      });
      const container = this.state.scrollableContainerRef.current;
      if (container) {
        this.resizeObserver.observe(container);
      }
    }

    // Initialize comment row observer for height measurement
    this.initCommentRowObserver();
  }

  componentWillUnmount() {
    this.resizeObserver?.disconnect();
    this.commentRowObserver?.disconnect();
  }

  public render = (): ReactElement => {
    const {
      oldValue,
      newValue,
      useDarkTheme,
      leftTitle,
      rightTitle,
      splitView,
      compareMethod,
      hideLineNumbers,
      nonce,
    } = this.props;

    if (
      typeof compareMethod === "string" &&
      compareMethod !== DiffMethod.JSON
    ) {
      if (typeof oldValue !== "string" || typeof newValue !== "string") {
        throw Error('"oldValue" and "newValue" should be strings');
      }
    }

    this.styles = this.computeStyles(this.props.styles, useDarkTheme, nonce);
    const nodes = this.renderDiff();

    let colSpanOnSplitView = 3;
    let colSpanOnInlineView = 4;

    if (hideLineNumbers) {
      colSpanOnSplitView -= 1;
      colSpanOnInlineView -= 1;
    }

    if (this.props.renderGutter) {
      colSpanOnSplitView += 1;
      colSpanOnInlineView += 1;
    }

    let deletions = 0;
    let additions = 0;
    for (const l of nodes.lineInformation) {
      if (l.left.type === DiffType.ADDED) {
        additions++;
      }
      if (l.right.type === DiffType.ADDED) {
        additions++;
      }
      if (l.left.type === DiffType.REMOVED) {
        deletions++;
      }
      if (l.right.type === DiffType.REMOVED) {
        deletions++;
      }
    }
    const totalChanges = deletions + additions;

    const percentageAddition = Math.round((additions / totalChanges) * 100);
    const blocks: ReactElement[] = [];
    for (let i = 0; i < 5; i++) {
      if (percentageAddition > i * 20) {
        blocks.push(
          <span
            key={i}
            className={cn(this.styles.block, this.styles.blockAddition)}
          />,
        );
      } else {
        blocks.push(
          <span
            key={i}
            className={cn(this.styles.block, this.styles.blockDeletion)}
          />,
        );
      }
    }
    const allExpanded =
      this.state.expandedBlocks.length === nodes.blocks.length;

    const LoadingElement = this.props.loadingElement;
    const scrollDivStyle = this.props.infiniteLoading ? {
      overflowY: 'scroll',
      overflowX: 'hidden',
      height: this.props.infiniteLoading.containerHeight
    } as const : {}

    // Only apply noWrap when infiniteLoading is enabled but we don't have cumulative offsets yet
    // Once offsets are calculated, we enable pre-wrap for proper text wrapping
    const shouldNoWrap = !!this.props.infiniteLoading && !this.state.cumulativeOffsets;

    const tableElement = (
      <table
        className={cn(this.styles.diffContainer, {
          [this.styles.splitView]: splitView,
          [this.styles.noWrap]: shouldNoWrap,
        })}
        onMouseUp={() => {
          const elements = document.getElementsByClassName("right");
          for (let i = 0; i < elements.length; i++) {
            const element = elements.item(i);
            element.classList.remove(this.styles.noSelect);
          }
          const elementsLeft = document.getElementsByClassName("left");
          for (let i = 0; i < elementsLeft.length; i++) {
            const element = elementsLeft.item(i);
            element.classList.remove(this.styles.noSelect);
          }
        }}
      >
        <colgroup>
          {!this.props.hideLineNumbers && <col width={"50px"} />}
          {!splitView && !this.props.hideLineNumbers && <col width={"50px"} />}
          {this.props.renderGutter && <col width={"50px"} />}
          <col width={"28px"} />
          <col width={"auto"} />
          {splitView && (
            <>
              {!this.props.hideLineNumbers && <col width={"50px"} />}
              {this.props.renderGutter && <col width={"50px"} />}
              <col width={"28px"} />
              <col width={"auto"} />
            </>
          )}
        </colgroup>
        <tbody>
          {nodes.diffNodes}
        </tbody>
      </table>
    );

    return (
      <div
        style={{ ...scrollDivStyle, position: 'relative' }}
        onScroll={this.onScroll}
        ref={this.state.scrollableContainerRef}
      >
        {(!this.props.hideSummary || leftTitle || rightTitle) && (
          <div ref={this.stickyHeaderRef} className={this.styles.stickyHeader}>
            {!this.props.hideSummary && (
              <div className={this.styles.summary} role={"banner"}>
                <button
                  type={"button"}
                  className={this.styles.allExpandButton}
                  onClick={() => {
                    this.setState(
                      {
                        expandedBlocks: allExpanded
                          ? []
                          : nodes.blocks.map((b) => b.index),
                      },
                      () => this.recalculateOffsets()
                    );
                  }}
                >
                  {allExpanded ? <Fold /> : <Expand />}
                </button>{" "}
                {totalChanges}
                <div style={{ display: "flex", gap: "1px" }}>{blocks}</div>
                {this.props.summary ? <span>{this.props.summary}</span> : null}
              </div>
            )}
            {(leftTitle || rightTitle) && (
              <div className={this.styles.columnHeaders}>
                <div className={this.styles.titleBlock}>
                  {leftTitle ? (
                    <pre className={this.styles.contentText}>{leftTitle}</pre>
                  ) : null}
                </div>
                {splitView && (
                  <div className={this.styles.titleBlock}>
                    {rightTitle ? (
                      <pre className={this.styles.contentText}>{rightTitle}</pre>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {this.state.isLoading && LoadingElement && <LoadingElement />}
        {this.props.infiniteLoading ? (
          <div style={{
            height: nodes.totalContentHeight,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute',
              top: nodes.topPadding,
              left: 0,
              right: 0,
            }}>
              {tableElement}
            </div>
          </div>
        ) : (
          tableElement
        )}
        {/* Hidden element for measuring character width */}
        <span
          ref={this.charMeasureRef}
          style={{
            position: 'absolute',
            top: 0,
            left: '-9999px',
            visibility: 'hidden',
            whiteSpace: 'pre',
            fontFamily: 'monospace',
            fontSize: 12,
          }}
          aria-hidden="true"
        >M</span>
        {/* Debug overlay */}
        {this.props.infiniteLoading && this.props.showDebugInfo && (
          <div
            style={{
              position: 'fixed',
              top: 10,
              right: 10,
              background: 'rgba(0,0,0,0.85)',
              color: '#0f0',
              padding: '10px',
              fontFamily: 'monospace',
              fontSize: '11px',
              zIndex: 9999,
              borderRadius: '4px',
              maxWidth: '300px',
              lineHeight: 1.4,
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '5px', color: '#fff' }}>Debug Info</div>
            <div>scrollTop: {nodes.debug.scrollTop}</div>
            <div>headerHeight: {nodes.debug.headerHeight}</div>
            <div>contentScrollTop: {nodes.debug.contentScrollTop}</div>
            <div>clientHeight: {nodes.debug.clientHeight}</div>
            <div style={{ marginTop: '5px', borderTop: '1px solid #444', paddingTop: '5px' }}>
              <div>visibleRowStart: {nodes.debug.visibleRowStart}</div>
              <div>visibleRowEnd: {nodes.debug.visibleRowEnd}</div>
            </div>
            <div style={{ marginTop: '5px', borderTop: '1px solid #444', paddingTop: '5px' }}>
              <div>totalRows: {nodes.debug.totalRows}</div>
              <div>offsetsLength: {nodes.debug.offsetsLength}</div>
              <div>renderedCount: {nodes.debug.renderedCount}</div>
            </div>
            <div style={{ marginTop: '5px', borderTop: '1px solid #444', paddingTop: '5px' }}>
              <div>topPadding: {nodes.topPadding.toFixed(0)}</div>
              <div>bottomPadding: {nodes.bottomPadding.toFixed(0)}</div>
              <div>totalContentHeight: {nodes.totalContentHeight.toFixed(0)}</div>
            </div>
            <div style={{ marginTop: '5px', borderTop: '1px solid #444', paddingTop: '5px', color: '#ff0' }}>
              <div>cumulativeOffsets: {this.state.cumulativeOffsets ? 'SET' : 'NULL'}</div>
              <div>columnWidth: {this.state.contentColumnWidth?.toFixed(0) ?? 'N/A'}px</div>
              <div>charWidth: {this.state.charWidth?.toFixed(2) ?? 'N/A'}px</div>
              <div>charsPerRow: {this.state.contentColumnWidth && this.state.charWidth ? Math.floor(this.state.contentColumnWidth / this.state.charWidth) : 'N/A'}</div>
            </div>
            {this.state.cumulativeOffsets && (
              <div style={{ marginTop: '5px', borderTop: '1px solid #444', paddingTop: '5px', color: '#0ff', fontSize: '10px' }}>
                <div>offsets[{nodes.debug.visibleRowEnd}]: {this.state.cumulativeOffsets[nodes.debug.visibleRowEnd]?.toFixed(0) ?? 'N/A'}</div>
                <div>offsets[{nodes.debug.totalRows - 1}]: {this.state.cumulativeOffsets[nodes.debug.totalRows - 1]?.toFixed(0) ?? 'N/A'}</div>
                <div>offsets[{nodes.debug.totalRows}]: {this.state.cumulativeOffsets[nodes.debug.totalRows]?.toFixed(0) ?? 'N/A'}</div>
                <div style={{ marginTop: '3px' }}>viewportEnd: {(nodes.debug.contentScrollTop + nodes.debug.clientHeight).toFixed(0)}</div>
                <div style={{ marginTop: '3px', color: '#f0f' }}>
                  scrollHeight: {this.state.scrollableContainerRef.current?.scrollHeight ?? 'N/A'}
                </div>
                <div>maxScrollTop: {(this.state.scrollableContainerRef.current?.scrollHeight ?? 0) - nodes.debug.clientHeight}</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };
}

export default DiffViewer;
export { DiffMethod };
export { default as computeStyles } from "./styles.js";
export type { ReactDiffViewerStylesOverride, ReactDiffViewerStyles };
export type { CommentRenderData } from "./comment-row.js";
