import { basename, clamp, formatBytes } from "../lib/utils";
import {
  isMarkdownFile,
  isTextFile,
  isImageFile,
  isLikeC4File,
  isCodeFile,
  imageMimeForPath,
  codeLanguageForPath,
  documentKindForPath,
  isEditableKind,
  isDocumentDirty,
} from "../types";

describe("basename", () => {
  it("returns the last path segment for forward slashes", () => {
    expect(basename("/home/user/file.txt")).toBe("file.txt");
  });

  it("returns the last path segment for backslashes", () => {
    expect(basename("C:\\Users\\user\\file.txt")).toBe("file.txt");
  });

  it("handles multiple consecutive slashes", () => {
    expect(basename("/home///user//file.txt")).toBe("file.txt");
  });

  it("returns the input as-is when there is no slash", () => {
    expect(basename("file.txt")).toBe("file.txt");
  });

  it("handles trailing slashes", () => {
    expect(basename("/home/user/")).toBe("user");
  });

  it("handles empty string", () => {
    expect(basename("")).toBe("");
  });
});

describe("clamp", () => {
  it("clamps value within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("returns min when below", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });

  it("returns max when above", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("formatBytes", () => {
  it("formats bytes under 1KB", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });
});

describe("isMarkdownFile", () => {
  it("returns true for .md files", () => {
    expect(isMarkdownFile("README.md")).toBe(true);
  });

  it("returns true for .markdown files (case-insensitive)", () => {
    expect(isMarkdownFile("readme.MARKDOWN")).toBe(true);
  });

  it("returns false for non-markdown files", () => {
    expect(isMarkdownFile("script.py")).toBe(false);
  });

  it("handles paths with directories", () => {
    expect(isMarkdownFile("/docs/guide.md")).toBe(true);
  });
});

describe("isTextFile", () => {
  it("returns true for .txt files", () => {
    expect(isTextFile("notes.txt")).toBe(true);
  });

  it("returns true for .log files", () => {
    expect(isTextFile("app.log")).toBe(true);
  });

  it("returns true for .csv files", () => {
    expect(isTextFile("data.csv")).toBe(true);
  });

  it("returns true for .tsv files", () => {
    expect(isTextFile("table.tsv")).toBe(true);
  });

  it("returns true for .lock files", () => {
    expect(isTextFile("file.lock")).toBe(true);
  });

  it("returns false for non-text files", () => {
    expect(isTextFile("image.png")).toBe(false);
  });
});

describe("isImageFile", () => {
  it("returns true for .png files", () => {
    expect(isImageFile("photo.png")).toBe(true);
  });

  it("returns true for .jpg files (case-insensitive)", () => {
    expect(isImageFile("image.JPG")).toBe(true);
  });

  it("returns true for .jpeg files", () => {
    expect(isImageFile("photo.jpeg")).toBe(true);
  });

  it("returns true for .webp files", () => {
    expect(isImageFile("screenshot.webp")).toBe(true);
  });

  it("returns false for non-image files", () => {
    expect(isImageFile("code.ts")).toBe(false);
  });
});

describe("isLikeC4File", () => {
  it("returns true for .c4 files", () => {
    expect(isLikeC4File("diagram.c4")).toBe(true);
  });

  it("returns true for .likec4 files (case-insensitive)", () => {
    expect(isLikeC4File("model.LIKEC4")).toBe(true);
  });

  it("returns false for non-likec4 files", () => {
    expect(isLikeC4File("readme.md")).toBe(false);
  });
});

describe("isCodeFile", () => {
  it("returns true for .ts files", () => {
    expect(isCodeFile("index.ts")).toBe(true);
  });

  it("returns true for .tsx files", () => {
    expect(isCodeFile("component.tsx")).toBe(true);
  });

  it("returns true for special filenames like dockerfile", () => {
    expect(isCodeFile("Dockerfile")).toBe(true);
  });

  it("returns true for .dockerfile files", () => {
    expect(isCodeFile(".dockerignore")).toBe(true);
  });

  it("returns true for makefile variants", () => {
    expect(isCodeFile("Makefile")).toBe(true);
  });

  it("returns true for gnumakefile", () => {
    expect(isCodeFile("gnumakefile")).toBe(true);
  });

  it("returns false for non-code files like images", () => {
    expect(isCodeFile("photo.png")).toBe(false);
  });

  it("handles paths with directories", () => {
    expect(isCodeFile("/src/app.tsx")).toBe(true);
  });
});

describe("imageMimeForPath", () => {
  it("returns image/png for .png files", () => {
    expect(imageMimeForPath("photo.png")).toBe("image/png");
  });

  it("returns image/jpeg for .jpg files", () => {
    expect(imageMimeForPath("photo.jpg")).toBe("image/jpeg");
  });

  it("returns image/jpeg for .jpeg files", () => {
    expect(imageMimeForPath("photo.jpeg")).toBe("image/jpeg");
  });

  it("returns image/webp for .webp files", () => {
    expect(imageMimeForPath("screenshot.webp")).toBe("image/webp");
  });

  it("returns null for non-image files", () => {
    expect(imageMimeForPath("code.ts")).toBeNull();
  });
});

describe("codeLanguageForPath", () => {
  it("returns TypeScript for .ts files", () => {
    expect(codeLanguageForPath("index.ts")).toBe("TypeScript");
  });

  it("returns JavaScript for .js files", () => {
    expect(codeLanguageForPath("script.js")).toBe("JavaScript");
  });

  it("returns Rust for .rs files", () => {
    expect(codeLanguageForPath("main.rs")).toBe("Rust");
  });

  it("returns Python for .py files", () => {
    expect(codeLanguageForPath("app.py")).toBe("Python");
  });

  it("returns Dockerfile for Dockerfile filename", () => {
    expect(codeLanguageForPath("Dockerfile")).toBe("Dockerfile");
  });

  it("returns Makefile for .makefile files", () => {
    expect(codeLanguageForPath(".makefile")).toBe("Makefile");
  });

  it("returns Plain Text for unknown extensions", () => {
    expect(codeLanguageForPath("unknown.xyz")).toBe("Plain Text");
  });

  it("handles paths with directories", () => {
    expect(codeLanguageForPath("/src/app.tsx")).toBe("TypeScript");
  });
});

describe("documentKindForPath", () => {
  it("returns 'markdown' for .md files", () => {
    expect(documentKindForPath("README.md")).toBe("markdown");
  });

  it("returns 'likec4' for .c4 files", () => {
    expect(documentKindForPath("diagram.c4")).toBe("likec4");
  });

  it("returns 'image' for .png files", () => {
    expect(documentKindForPath("photo.png")).toBe("image");
  });

  it("returns 'code' for .ts files", () => {
    expect(documentKindForPath("index.ts")).toBe("code");
  });

  it("returns 'text' for .txt files", () => {
    expect(documentKindForPath("notes.txt")).toBe("text");
  });

  it("returns 'unsupported' for unknown file types", () => {
    expect(documentKindForPath("unknown.xyz")).toBe("unsupported");
  });

  it("prioritizes markdown over code (same extension)", () => {
    // .md is markdown, not code
    expect(documentKindForPath("readme.md")).toBe("markdown");
  });

  it("handles paths with directories", () => {
    expect(documentKindForPath("/docs/guide.md")).toBe("markdown");
  });
});

describe("isEditableKind", () => {
  it("returns true for markdown kind", () => {
    expect(isEditableKind("markdown")).toBe(true);
  });

  it("returns true for text kind", () => {
    expect(isEditableKind("text")).toBe(true);
  });

  it("returns true for code kind", () => {
    expect(isEditableKind("code")).toBe(true);
  });

  it("returns true for likec4 kind", () => {
    expect(isEditableKind("likec4")).toBe(true);
  });

  it("returns false for image kind", () => {
    expect(isEditableKind("image")).toBe(false);
  });

  it("returns false for unsupported kind", () => {
    expect(isEditableKind("unsupported")).toBe(false);
  });
});

describe("isDocumentDirty", () => {
  it("returns true when content differs from savedContent", () => {
    const doc = {
      id: "1",
      path: "/test.md",
      name: "Test",
      kind: "markdown" as const,
      language: null,
      image: null,
      content: "modified",
      savedContent: "original",
      size: 8,
      modifiedMs: Date.now(),
    };
    expect(isDocumentDirty(doc)).toBe(true);
  });

  it("returns false when content matches savedContent", () => {
    const doc = {
      id: "2",
      path: "/test.md",
      name: "Test",
      kind: "markdown" as const,
      language: null,
      image: null,
      content: "same",
      savedContent: "same",
      size: 4,
      modifiedMs: Date.now(),
    };
    expect(isDocumentDirty(doc)).toBe(false);
  });

  it("returns false for null document", () => {
    expect(isDocumentDirty(null)).toBe(false);
  });

  it("returns false for image documents regardless of content", () => {
    const doc = {
      id: "3",
      path: "/photo.png",
      name: "Photo",
      kind: "image" as const,
      language: null,
      image: { mimeType: "image/png", dataUrl: "data:image/png;base64,test" },
      content: "",
      savedContent: "",
      size: 0,
      modifiedMs: Date.now(),
    };
    expect(isDocumentDirty(doc)).toBe(false);
  });

  it("returns true for documents without a path", () => {
    const doc = {
      id: "4",
      path: null,
      name: "Untitled",
      kind: "markdown" as const,
      language: null,
      image: null,
      content: "content",
      savedContent: "",
      size: 7,
      modifiedMs: Date.now(),
    };
    expect(isDocumentDirty(doc)).toBe(true);
  });

  it("treats a clean detached document as clean", () => {
    const doc = {
      id: "5",
      path: null,
      name: "Detached.md",
      kind: "markdown" as const,
      language: null,
      image: null,
      content: "same",
      savedContent: "same",
      size: 4,
      modifiedMs: null,
      detached: true,
    };
    expect(isDocumentDirty(doc)).toBe(false);
  });

  it("keeps detached documents dirty when their buffer has unsaved changes", () => {
    const doc = {
      id: "6",
      path: null,
      name: "Detached.md",
      kind: "markdown" as const,
      language: null,
      image: null,
      content: "edited",
      savedContent: "original",
      size: 8,
      modifiedMs: null,
      detached: true,
    };
    expect(isDocumentDirty(doc)).toBe(true);
  });
});
