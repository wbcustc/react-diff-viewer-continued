/**
 * @vitest-environment happy-dom
 */

import { fireEvent, render, waitFor } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import DiffViewer, { DiffMethod } from "../src/index";
import { DiffRow, type DiffRowProps } from "../src/diff-row";
import { DiffType } from "../src/compute-lines";
import type { ReactDiffViewerStyles } from "../src/styles";

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

const oldCode = "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10";
const newCode = "line1\nline2\nmodified3\nline4\nline5\nline6\nline7\nline8\nline9\nline10";

// ─────────────────────────────────────────────────────────────
// DiffRow — onRowContextMenu and data attributes
// ─────────────────────────────────────────────────────────────
describe("DiffRow context menu and data attributes", () => {
  it("attaches data-left-line and data-right-line attributes in split view", () => {
    const props = makeRowProps({
      leftLineNumber: 5,
      rightLineNumber: 8,
      splitView: true,
    });

    const { container } = render(
      <table><tbody>
        <DiffRow {...props} />
      </tbody></table>,
    );

    const tr = container.querySelector("tr");
    expect(tr.dataset.leftLine).toBe("5");
    expect(tr.dataset.rightLine).toBe("8");
  });

  it("attaches data attributes in inline view (default line)", () => {
    const props = makeRowProps({
      leftLineNumber: 3,
      rightLineNumber: 3,
      splitView: false,
      leftType: DiffType.DEFAULT,
      rightType: DiffType.DEFAULT,
    });

    const { container } = render(
      <table><tbody>
        <DiffRow {...props} />
      </tbody></table>,
    );

    const tr = container.querySelector("tr");
    expect(tr.dataset.leftLine).toBe("3");
    expect(tr.dataset.rightLine).toBe("3");
  });

  it("attaches data attributes in inline view (changed pair — two rows)", () => {
    const props = makeRowProps({
      leftLineNumber: 4,
      rightLineNumber: 4,
      splitView: false,
      leftType: DiffType.REMOVED,
      leftValue: "old",
      rightType: DiffType.ADDED,
      rightValue: "new",
    });

    const { container } = render(
      <table><tbody>
        <DiffRow {...props} />
      </tbody></table>,
    );

    const rows = container.querySelectorAll("tr");
    expect(rows.length).toBe(2);
    for (const tr of rows) {
      expect(tr.dataset.leftLine).toBe("4");
      expect(tr.dataset.rightLine).toBe("4");
    }
  });

  it("fires onRowContextMenu when right-clicking the row", () => {
    const contextMenuSpy = vi.fn();
    const props = makeRowProps({ leftLineNumber: 7, rightLineNumber: 7 });

    const { container } = render(
      <table><tbody>
        <DiffRow {...props} onRowContextMenu={contextMenuSpy} />
      </tbody></table>,
    );

    const tr = container.querySelector("tr");
    fireEvent.contextMenu(tr);

    expect(contextMenuSpy).toHaveBeenCalledTimes(1);
  });

  it("does not error when onRowContextMenu is not provided", () => {
    const props = makeRowProps();

    const { container } = render(
      <table><tbody>
        <DiffRow {...props} />
      </tbody></table>,
    );

    const tr = container.querySelector("tr");
    // Should not throw
    fireEvent.contextMenu(tr);
  });

  it("does NOT re-render when onRowContextMenu reference changes", () => {
    const props = makeRowProps();

    const { rerender } = render(
      <table><tbody>
        <DiffRow {...props} onRowContextMenu={() => {}} />
      </tbody></table>,
    );

    const initialHtml = document.querySelector("tbody").innerHTML;

    rerender(
      <table><tbody>
        <DiffRow {...props} onRowContextMenu={() => {}} />
      </tbody></table>,
    );

    expect(document.querySelector("tbody").innerHTML).toBe(initialHtml);
  });
});

// ─────────────────────────────────────────────────────────────
// Helper: find clickable gutter <td> elements within a rendered DiffViewer.
// Gutter cells have a <pre> child with a line number; we filter out empty ones.
// ─────────────────────────────────────────────────────────────
function findGutterCells(container: HTMLElement): HTMLTableCellElement[] {
  // All rows rendered by DiffViewer have data-left-line or data-right-line
  const rows = container.querySelectorAll("tr[data-left-line]");
  const cells: HTMLTableCellElement[] = [];
  for (const row of rows) {
    // Gutter cells are the first <td> elements that contain a <pre> with a number
    const tds = row.querySelectorAll("td");
    for (const td of tds) {
      const pre = td.querySelector("pre");
      if (pre && /^\d+$/.test(pre.textContent?.trim() || "")) {
        cells.push(td as HTMLTableCellElement);
        break; // Take only the first (left) gutter cell per row
      }
    }
  }
  return cells;
}

// ─────────────────────────────────────────────────────────────
// DiffViewer — line range selection integration
// ─────────────────────────────────────────────────────────────
describe("DiffViewer line range selection", () => {
  it("does not fire onLineRangeSelected when enableLineRangeSelection is false", async () => {
    const onLineNumberClick = vi.fn();
    const onLineRangeSelected = vi.fn();

    const { container } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        showDiffOnly={false}
        onLineNumberClick={onLineNumberClick}
        onLineRangeSelected={onLineRangeSelected}
      />,
    );

    let gutterCells: HTMLTableCellElement[] = [];
    await waitFor(() => {
      gutterCells = findGutterCells(container);
      expect(gutterCells.length).toBeGreaterThan(2);
    });

    fireEvent.click(gutterCells[0]);
    fireEvent.click(gutterCells[2], { shiftKey: true });

    expect(onLineNumberClick).toHaveBeenCalledTimes(2);
    expect(onLineRangeSelected).not.toHaveBeenCalled();
  });

  it("fires onLineNumberClick on every click even when range selection is enabled", async () => {
    const onLineNumberClick = vi.fn();

    const { container } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        showDiffOnly={false}
        enableLineRangeSelection={true}
        onLineNumberClick={onLineNumberClick}
      />,
    );

    let gutterCells: HTMLTableCellElement[] = [];
    await waitFor(() => {
      gutterCells = findGutterCells(container);
      expect(gutterCells.length).toBeGreaterThan(2);
    });

    fireEvent.click(gutterCells[0]);
    fireEvent.click(gutterCells[2], { shiftKey: true });

    expect(onLineNumberClick).toHaveBeenCalledTimes(2);
  });

  it("fires onLineRangeSelected on shift+click when enableLineRangeSelection is true", async () => {
    const onLineRangeSelected = vi.fn();

    const { container } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        showDiffOnly={false}
        enableLineRangeSelection={true}
        onLineRangeSelected={onLineRangeSelected}
      />,
    );

    let gutterCells: HTMLTableCellElement[] = [];
    await waitFor(() => {
      gutterCells = findGutterCells(container);
      expect(gutterCells.length).toBeGreaterThan(2);
    });

    fireEvent.click(gutterCells[0]);
    fireEvent.click(gutterCells[2], { shiftKey: true });

    expect(onLineRangeSelected).toHaveBeenCalledTimes(1);
    const [startId, endId] = onLineRangeSelected.mock.calls[0];
    expect(startId).toMatch(/^[LR]-\d+$/);
    expect(endId).toMatch(/^[LR]-\d+$/);
  });

  it("clears range and sets new anchor on non-shift click", async () => {
    const onLineRangeSelected = vi.fn();

    const { container } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        showDiffOnly={false}
        enableLineRangeSelection={true}
        onLineRangeSelected={onLineRangeSelected}
      />,
    );

    let gutterCells: HTMLTableCellElement[] = [];
    await waitFor(() => {
      gutterCells = findGutterCells(container);
      expect(gutterCells.length).toBeGreaterThan(5);
    });

    // Select first range
    fireEvent.click(gutterCells[0]);
    fireEvent.click(gutterCells[2], { shiftKey: true });
    expect(onLineRangeSelected).toHaveBeenCalledTimes(1);

    // Non-shift click resets anchor
    fireEvent.click(gutterCells[4]);

    // Shift+click from the new anchor
    fireEvent.click(gutterCells[5], { shiftKey: true });
    expect(onLineRangeSelected).toHaveBeenCalledTimes(2);
  });

  it("fires onLineRangeContextMenu when right-clicking a row within the range", async () => {
    const onLineRangeContextMenu = vi.fn();

    const { container } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        showDiffOnly={false}
        enableLineRangeSelection={true}
        onLineRangeContextMenu={onLineRangeContextMenu}
      />,
    );

    let gutterCells: HTMLTableCellElement[] = [];
    await waitFor(() => {
      gutterCells = findGutterCells(container);
      expect(gutterCells.length).toBeGreaterThan(3);
    });

    // Select range: lines 0..2
    fireEvent.click(gutterCells[0]);
    fireEvent.click(gutterCells[2], { shiftKey: true });

    // Right-click row in the middle of the range
    const middleRow = gutterCells[1].closest("tr");
    fireEvent.contextMenu(middleRow);

    expect(onLineRangeContextMenu).toHaveBeenCalledTimes(1);
    const [, startId, endId] = onLineRangeContextMenu.mock.calls[0];
    expect(startId).toMatch(/^[LR]-\d+$/);
    expect(endId).toMatch(/^[LR]-\d+$/);
  });

  it("does NOT fire onLineRangeContextMenu when right-clicking outside the range", async () => {
    const onLineRangeContextMenu = vi.fn();

    const { container } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        showDiffOnly={false}
        enableLineRangeSelection={true}
        onLineRangeContextMenu={onLineRangeContextMenu}
      />,
    );

    let gutterCells: HTMLTableCellElement[] = [];
    await waitFor(() => {
      gutterCells = findGutterCells(container);
      expect(gutterCells.length).toBeGreaterThan(5);
    });

    // Select range of first two lines
    fireEvent.click(gutterCells[0]);
    fireEvent.click(gutterCells[1], { shiftKey: true });

    // Right-click on a row well outside the range
    const outsideRow = gutterCells[gutterCells.length - 1].closest("tr");
    fireEvent.contextMenu(outsideRow);

    expect(onLineRangeContextMenu).not.toHaveBeenCalled();
  });

  it("does NOT fire onLineRangeContextMenu when no range is selected", async () => {
    const onLineRangeContextMenu = vi.fn();

    const { container } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        showDiffOnly={false}
        enableLineRangeSelection={true}
        onLineRangeContextMenu={onLineRangeContextMenu}
      />,
    );

    await waitFor(() => {
      const rows = container.querySelectorAll("tr[data-left-line]");
      expect(rows.length).toBeGreaterThan(0);
    });

    // Right-click without selecting any range
    const firstRow = container.querySelector("tr[data-left-line]");
    fireEvent.contextMenu(firstRow);

    expect(onLineRangeContextMenu).not.toHaveBeenCalled();
  });

  it("works correctly in inline view", async () => {
    const onLineRangeSelected = vi.fn();

    const { container } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={false}
        showDiffOnly={false}
        enableLineRangeSelection={true}
        onLineRangeSelected={onLineRangeSelected}
      />,
    );

    let gutterCells: HTMLTableCellElement[] = [];
    await waitFor(() => {
      gutterCells = findGutterCells(container);
      expect(gutterCells.length).toBeGreaterThan(2);
    });

    fireEvent.click(gutterCells[0]);
    fireEvent.click(gutterCells[2], { shiftKey: true });

    expect(onLineRangeSelected).toHaveBeenCalledTimes(1);
  });
});
