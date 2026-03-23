/**
 * @vitest-environment happy-dom
 */

import { render, waitFor, cleanup } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, afterEach } from "vitest";

import DiffViewer from "../src/index";
import type { CommentRenderData } from "../src/index";

const oldCode = `const a = 123
const b = 456
const c = 789
const d = 101112`;

const newCode = `const a = 123
const b = 999
const c = 789
const d = 101112`;

describe("Comment feature", () => {
  afterEach(() => {
    cleanup();
  });
  it("renders comment rows below commented lines in split view", async () => {
    const renderComment = (data: CommentRenderData) => (
      <div data-testid={`comment-${data.lineId}`}>Comment on {data.lineId}</div>
    );

    const { getByTestId } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        commentLineIds={["L-2"]}
        renderComment={renderComment}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("comment-L-2")).toBeTruthy();
      expect(getByTestId("comment-L-2").textContent).toBe("Comment on L-2");
    });
  });

  it("renders comment rows below commented lines in unified view", async () => {
    const renderComment = (data: CommentRenderData) => (
      <div data-testid={`comment-${data.lineId}`}>Comment on {data.lineId}</div>
    );

    const { getByTestId } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={false}
        commentLineIds={["R-2"]}
        renderComment={renderComment}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("comment-R-2")).toBeTruthy();
    });
  });

  it("renders comments on both L-N and R-N as separate rows", async () => {
    const renderComment = (data: CommentRenderData) => (
      <div data-testid={`comment-${data.lineId}`}>Comment on {data.side}</div>
    );

    const { getByTestId } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        commentLineIds={["L-2", "R-2"]}
        renderComment={renderComment}
      />,
    );

    await waitFor(() => {
      const leftComment = getByTestId("comment-L-2");
      const rightComment = getByTestId("comment-R-2");
      expect(leftComment).toBeTruthy();
      expect(rightComment).toBeTruthy();
      expect(leftComment.textContent).toBe("Comment on left");
      expect(rightComment.textContent).toBe("Comment on right");
    });
  });

  it("does not render comment rows when renderComment returns null", async () => {
    const renderComment = () => null;

    const { container } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        commentLineIds={["L-1"]}
        renderComment={renderComment}
      />,
    );

    await waitFor(() => {
      const commentRows = container.querySelectorAll("[data-comment-line]");
      expect(commentRows.length).toBe(0);
    });
  });

  it("does not render comment rows when commentLineIds is empty", async () => {
    const renderComment = (data: CommentRenderData) => (
      <div>Comment</div>
    );

    const { container } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        commentLineIds={[]}
        renderComment={renderComment}
      />,
    );

    await waitFor(() => {
      const commentRows = container.querySelectorAll("[data-comment-line]");
      expect(commentRows.length).toBe(0);
    });
  });

  it("renders multiple comments on different lines", async () => {
    const renderComment = (data: CommentRenderData) => (
      <div data-testid={`comment-${data.lineId}`}>
        Line {data.lineNumber}
      </div>
    );

    const { getByTestId } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        commentLineIds={["L-1", "L-3", "R-4"]}
        renderComment={renderComment}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("comment-L-1")).toBeTruthy();
      expect(getByTestId("comment-L-3")).toBeTruthy();
      expect(getByTestId("comment-R-4")).toBeTruthy();
    });
  });

  it("passes correct CommentRenderData to renderComment", async () => {
    let capturedData: CommentRenderData | null = null;
    const renderComment = (data: CommentRenderData) => {
      capturedData = data;
      return <div data-testid="comment">test</div>;
    };

    render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        commentLineIds={["L-3"]}
        renderComment={renderComment}
      />,
    );

    await waitFor(() => {
      expect(capturedData).not.toBeNull();
      expect(capturedData?.lineId).toBe("L-3");
      expect(capturedData?.lineNumber).toBe(3);
      expect(capturedData?.side).toBe("left");
      expect(capturedData?.splitView).toBe(true);
    });
  });

  it("comment row spans full width with correct colSpan", async () => {
    const renderComment = () => <div>Comment</div>;

    const { container } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={true}
        commentLineIds={["L-1"]}
        renderComment={renderComment}
      />,
    );

    await waitFor(() => {
      const commentRow = container.querySelector("[data-comment-line='L-1']");
      expect(commentRow).toBeTruthy();
      const td = commentRow?.querySelector("td");
      expect(td).toBeTruthy();
      // Split view: 2 gutters + 2 markers + 2 content = 6
      expect(td?.getAttribute("colspan")).toBe("6");
    });
  });

  it("comment row has correct colSpan in unified view", async () => {
    const renderComment = () => <div>Comment</div>;

    const { container } = render(
      <DiffViewer
        oldValue={oldCode}
        newValue={newCode}
        splitView={false}
        commentLineIds={["L-1"]}
        renderComment={renderComment}
      />,
    );

    await waitFor(() => {
      const commentRow = container.querySelector("[data-comment-line='L-1']");
      expect(commentRow).toBeTruthy();
      const td = commentRow?.querySelector("td");
      expect(td).toBeTruthy();
      // Unified view: 2 gutters + 1 marker + 1 content = 4
      expect(td?.getAttribute("colspan")).toBe("4");
    });
  });
});
