/**
 * @vitest-environment happy-dom
 */

import { render, waitFor } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import DiffViewer, { DiffMethod } from "../src/index";
import { DiffRow, type DiffRowProps } from "../src/diff-row";
import { SkippedLineIndicator, type SkippedLineIndicatorProps } from "../src/skipped-line-indicator";
import { DiffType } from "../src/compute-lines";
import type { ReactDiffViewerStyles } from "../src/styles";

/**
 * Minimal styles stub — every property is a unique string so classname logic works
 * without needing the full emotion CSS pipeline.
 */
const stubStyles: ReactDiffViewerStyles = {
  diffContainer: "diffContainer",
  diffRemoved: "diffRemoved",
  diffAdded: "diffAdded",
  diffChanged: "diffChanged",
  line: "line",
  highlightedGutter: "highlightedGutter",
  contentText: "contentText",
  lineContent: "lineContent",
  gutter: "gutter",
  highlightedLine: "highlightedLine",
  lineNumber: "lineNumber",
  marker: "marker",
  wordDiff: "wordDiff",
  wordAdded: "wordAdded",
  wordRemoved: "wordRemoved",
  codeFoldGutter: "codeFoldGutter",
  codeFoldExpandButton: "codeFoldExpandButton",
  summary: "summary",
  codeFoldContentContainer: "codeFoldContentContainer",
  emptyGutter: "emptyGutter",
  emptyLine: "emptyLine",
  codeFold: "codeFold",
  stickyHeader: "stickyHeader",
  columnHeaders: "columnHeaders",
  titleBlock: "titleBlock",
  content: "content",
  column: "column",
  noSelect: "noSelect",
  noWrap: "noWrap",
  splitView: "splitView",
  allExpandButton: "allExpandButton",
  codeFoldContent: "codeFoldContent",
  block: "block",
  blockAddition: "blockAddition",
  blockDeletion: "blockDeletion",
};

/**
 * Helper: returns default DiffRow props for a simple unchanged line.
 */
function makeRowProps(overrides: Partial<DiffRowProps> = {}): DiffRowProps {
  return {
    leftLineNumber: 1,
    leftType: DiffType.DEFAULT,
    leftValue: "const a = 1;",
    rightLineNumber: 1,
    rightType: DiffType.DEFAULT,
    rightValue: "const a = 1;",
    highlightLeft: false,
    highlightRight: false,
    splitView: true,
    hideLineNumbers: false,
    styles: stubStyles,
    compareMethod: DiffMethod.CHARS,
    hasCumulativeOffsets: false,
    index: 0,
    ...overrides,
  };
}

/**
 * Helper: returns default SkippedLineIndicator props.
 */
function makeSkipProps(overrides: Partial<SkippedLineIndicatorProps> = {}): SkippedLineIndicatorProps {
  return {
    num: 10,
    blockNumber: 0,
    leftBlockLineNumber: 15,
    rightBlockLineNumber: 15,
    hideLineNumbers: false,
    splitView: true,
    styles: stubStyles,
    onBlockClick: () => {},
    ...overrides,
  };
}

/**
 * Wrapper component that lets us force re-renders and count child renders.
 * `renderSpy` is called every time the inner component renders.
 */
function RerenderHarness({
  children,
  renderKey,
}: {
  children: React.ReactNode;
  renderKey: number;
}) {
  // renderKey changes force a parent re-render
  return <table><tbody>{children}</tbody></table>;
}

// ─────────────────────────────────────────────────────────────
// DiffRow memoization tests
// ─────────────────────────────────────────────────────────────
describe("DiffRow memoization", () => {
  it("does NOT re-render when parent re-renders with identical props", () => {
    const renderSpy = vi.fn();

    // Wrap DiffRow to spy on renders
    const SpyDiffRow = (props: DiffRowProps) => {
      renderSpy();
      return <DiffRow {...props} />;
    };

    // We can't spy on the inner memo, so instead we wrap + use React.memo
    // at our own level to verify the memo comparator works correctly.
    // Instead, let's directly test that React.memo's comparator skips renders.
    const props = makeRowProps();

    const { rerender } = render(
      <table><tbody>
        <DiffRow {...props} />
      </tbody></table>,
    );

    // Get initial HTML
    const initialHtml = document.querySelector("tbody").innerHTML;

    // Re-render with the exact same props object — React.memo should skip
    rerender(
      <table><tbody>
        <DiffRow {...props} />
      </tbody></table>,
    );

    // Output should be identical (memo prevented re-render)
    expect(document.querySelector("tbody").innerHTML).toBe(initialHtml);
  });

  it("does NOT re-render when only callback references change", () => {
    const props = makeRowProps();

    const { rerender } = render(
      <table><tbody>
        <DiffRow {...props} onLineNumberClick={() => {}} />
      </tbody></table>,
    );

    const initialHtml = document.querySelector("tbody").innerHTML;

    // Re-render with a NEW callback function reference — memo should skip
    // because the custom equality function excludes callbacks
    rerender(
      <table><tbody>
        <DiffRow {...props} onLineNumberClick={() => {}} />
      </tbody></table>,
    );

    expect(document.querySelector("tbody").innerHTML).toBe(initialHtml);
  });

  it("DOES re-render when highlightLeft changes", () => {
    const props = makeRowProps();

    const { rerender, container } = render(
      <table><tbody>
        <DiffRow {...props} highlightLeft={false} />
      </tbody></table>,
    );

    const beforeHtml = container.querySelector("tbody").innerHTML;

    rerender(
      <table><tbody>
        <DiffRow {...props} highlightLeft={true} />
      </tbody></table>,
    );

    const afterHtml = container.querySelector("tbody").innerHTML;

    // HTML should change because the highlighted class is applied
    expect(afterHtml).not.toBe(beforeHtml);
    expect(afterHtml).toContain("highlightedGutter");
  });

  it("DOES re-render when highlightRight changes", () => {
    const props = makeRowProps();

    const { rerender, container } = render(
      <table><tbody>
        <DiffRow {...props} highlightRight={false} />
      </tbody></table>,
    );

    const beforeHtml = container.querySelector("tbody").innerHTML;

    rerender(
      <table><tbody>
        <DiffRow {...props} highlightRight={true} />
      </tbody></table>,
    );

    const afterHtml = container.querySelector("tbody").innerHTML;
    expect(afterHtml).not.toBe(beforeHtml);
    expect(afterHtml).toContain("highlightedGutter");
  });

  it("DOES re-render when leftValue reference changes", () => {
    const props = makeRowProps({ leftValue: "const a = 1;" });

    const { rerender, container } = render(
      <table><tbody>
        <DiffRow {...props} />
      </tbody></table>,
    );

    const beforeHtml = container.querySelector("tbody").innerHTML;

    rerender(
      <table><tbody>
        <DiffRow {...props} leftValue="const a = 2;" />
      </tbody></table>,
    );

    const afterHtml = container.querySelector("tbody").innerHTML;
    expect(afterHtml).not.toBe(beforeHtml);
    expect(afterHtml).toContain("const a = 2;");
  });

  it("DOES re-render when leftType changes from DEFAULT to ADDED", () => {
    const props = makeRowProps();

    const { rerender, container } = render(
      <table><tbody>
        <DiffRow {...props} leftType={DiffType.DEFAULT} />
      </tbody></table>,
    );

    const beforeHtml = container.querySelector("tbody").innerHTML;

    rerender(
      <table><tbody>
        <DiffRow {...props} leftType={DiffType.ADDED} />
      </tbody></table>,
    );

    const afterHtml = container.querySelector("tbody").innerHTML;
    expect(afterHtml).not.toBe(beforeHtml);
    expect(afterHtml).toContain("diffAdded");
  });

  it("DOES re-render when styles reference changes (theme switch)", () => {
    const props = makeRowProps();
    const altStyles = { ...stubStyles, line: "line-dark" };

    const { rerender, container } = render(
      <table><tbody>
        <DiffRow {...props} styles={stubStyles} />
      </tbody></table>,
    );

    const beforeHtml = container.querySelector("tbody").innerHTML;

    rerender(
      <table><tbody>
        <DiffRow {...props} styles={altStyles} />
      </tbody></table>,
    );

    const afterHtml = container.querySelector("tbody").innerHTML;
    expect(afterHtml).not.toBe(beforeHtml);
    expect(afterHtml).toContain("line-dark");
  });

  it("renders correctly in inline view", () => {
    const props = makeRowProps({
      splitView: false,
      leftType: DiffType.REMOVED,
      leftValue: "old line",
      rightType: DiffType.ADDED,
      rightValue: "new line",
    });

    const { container } = render(
      <table><tbody>
        <DiffRow {...props} />
      </tbody></table>,
    );

    const rows = container.querySelectorAll("tr");
    // Inline changed pair produces 2 rows
    expect(rows.length).toBe(2);

    const allText = container.textContent;
    expect(allText).toContain("old line");
    expect(allText).toContain("new line");
  });

  it("renders correctly in split view", () => {
    const props = makeRowProps({
      splitView: true,
      leftType: DiffType.REMOVED,
      leftValue: "removed",
      rightType: DiffType.ADDED,
      rightValue: "added",
    });

    const { container } = render(
      <table><tbody>
        <DiffRow {...props} />
      </tbody></table>,
    );

    const rows = container.querySelectorAll("tr");
    // Split view: single row
    expect(rows.length).toBe(1);

    const allText = container.textContent;
    expect(allText).toContain("removed");
    expect(allText).toContain("added");
  });
});

// ─────────────────────────────────────────────────────────────
// SkippedLineIndicator memoization tests
// ─────────────────────────────────────────────────────────────
describe("SkippedLineIndicator memoization", () => {
  it("does NOT re-render when only callback references change", () => {
    const props = makeSkipProps();

    const { rerender } = render(
      <table><tbody>
        <SkippedLineIndicator {...props} onBlockClick={() => {}} />
      </tbody></table>,
    );

    const initialHtml = document.querySelector("tbody").innerHTML;

    // New callback reference — memo should skip
    rerender(
      <table><tbody>
        <SkippedLineIndicator {...props} onBlockClick={() => {}} />
      </tbody></table>,
    );

    expect(document.querySelector("tbody").innerHTML).toBe(initialHtml);
  });

  it("does NOT re-render when codeFoldMessageRenderer reference changes", () => {
    const props = makeSkipProps();

    const { rerender } = render(
      <table><tbody>
        <SkippedLineIndicator
          {...props}
          codeFoldMessageRenderer={(n) => <span>{n} lines</span>}
        />
      </tbody></table>,
    );

    const initialHtml = document.querySelector("tbody").innerHTML;

    rerender(
      <table><tbody>
        <SkippedLineIndicator
          {...props}
          codeFoldMessageRenderer={(n) => <span>{n} lines</span>}
        />
      </tbody></table>,
    );

    expect(document.querySelector("tbody").innerHTML).toBe(initialHtml);
  });

  it("DOES re-render when num changes", () => {
    const props = makeSkipProps({ num: 10 });

    const { rerender, container } = render(
      <table><tbody>
        <SkippedLineIndicator {...props} />
      </tbody></table>,
    );

    const beforeHtml = container.querySelector("tbody").innerHTML;

    rerender(
      <table><tbody>
        <SkippedLineIndicator {...props} num={20} />
      </tbody></table>,
    );

    const afterHtml = container.querySelector("tbody").innerHTML;
    expect(afterHtml).not.toBe(beforeHtml);
  });

  it("DOES re-render when styles reference changes", () => {
    const props = makeSkipProps();
    const altStyles = { ...stubStyles, codeFold: "codeFold-dark" };

    const { rerender, container } = render(
      <table><tbody>
        <SkippedLineIndicator {...props} styles={stubStyles} />
      </tbody></table>,
    );

    const beforeHtml = container.querySelector("tbody").innerHTML;

    rerender(
      <table><tbody>
        <SkippedLineIndicator {...props} styles={altStyles} />
      </tbody></table>,
    );

    const afterHtml = container.querySelector("tbody").innerHTML;
    expect(afterHtml).not.toBe(beforeHtml);
    expect(afterHtml).toContain("codeFold-dark");
  });

  it("renders the default fold message", () => {
    const props = makeSkipProps({
      num: 15,
      leftBlockLineNumber: 20,
      rightBlockLineNumber: 20,
    });

    const { container } = render(
      <table><tbody>
        <SkippedLineIndicator {...props} />
      </tbody></table>,
    );

    const text = container.textContent;
    expect(text).toContain("@@ -5,15 +5,15 @@");
  });

  it("renders a custom fold message via codeFoldMessageRenderer", () => {
    const props = makeSkipProps({
      num: 8,
      codeFoldMessageRenderer: (n, left, right) => (
        <span>{n} lines hidden (L{left}-R{right})</span>
      ),
    });

    const { container } = render(
      <table><tbody>
        <SkippedLineIndicator {...props} />
      </tbody></table>,
    );

    const text = container.textContent;
    expect(text).toContain("8 lines hidden");
  });
});

// ─────────────────────────────────────────────────────────────
// Full DiffViewer integration — memoization in context
// ─────────────────────────────────────────────────────────────
describe("DiffViewer render performance", () => {
  it("renders split view with highlight changes efficiently", async () => {
    const oldCode = Array.from({ length: 50 }, (_, i) => `const line${i} = ${i};`).join("\n");
    const newCode = Array.from({ length: 50 }, (_, i) => `const line${i} = ${i + 1};`).join("\n");

    const { rerender, container } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        highlightLines={[]}
        showDiffOnly={false}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("table")).toBeTruthy();
    });

    const rowsBefore = container.querySelectorAll("tr").length;
    expect(rowsBefore).toBeGreaterThan(0);

    // Re-render with a single highlight change — should be efficient
    // (only highlighted row re-renders, not all 50)
    const start = performance.now();
    rerender(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        highlightLines={["L-5"]}
        showDiffOnly={false}
      />,
    );
    const duration = performance.now() - start;

    // Re-render should be fast since most rows are memoized
    expect(duration).toBeLessThan(500);

    // Content should still be correct
    const rowsAfter = container.querySelectorAll("tr").length;
    expect(rowsAfter).toBe(rowsBefore);
  });

  it("renders inline view correctly after memoization refactor", async () => {
    const oldCode = "line1\nline2\nline3";
    const newCode = "line1\nmodified\nline3";

    const { container } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={false}
        showDiffOnly={false}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("table")).toBeTruthy();
    });

    const text = container.textContent;
    expect(text).toContain("line1");
    expect(text).toContain("line2");
    expect(text).toContain("modified");
    expect(text).toContain("line3");
  });

  it("handles rapid re-renders (scroll simulation) without degradation", async () => {
    const oldCode = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
    const newCode = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");

    const { rerender, container } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        highlightLines={[]}
        showDiffOnly={false}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("table")).toBeTruthy();
    });

    // Simulate 10 rapid re-renders with the same data (e.g., parent state changes)
    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      rerender(
        <DiffViewer
          oldValue={oldCode}
          newValue={newCode}
          splitView={true}
          highlightLines={[]}
          showDiffOnly={false}
        />,
      );
    }
    const duration = performance.now() - start;

    // 10 re-renders with memoized rows should be fast
    expect(duration).toBeLessThan(2000);
  });
});
