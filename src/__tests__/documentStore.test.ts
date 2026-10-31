import { useDocumentStore } from "../stores/documentStore";
import { isDocumentDirty, type OpenDocument } from "../types";

function document(id: string, path: string): OpenDocument {
  return {
    id,
    path,
    name: path.split(/[\\/]/).pop() ?? path,
    kind: "markdown",
    language: "markdown",
    image: null,
    content: "edited content",
    savedContent: "original content",
    size: 15,
    modifiedMs: 1,
  };
}

describe("detachDocumentsUnderRoot", () => {
  afterEach(() => {
    useDocumentStore.getState().closeAllDocuments();
  });

  it("detaches documents under a removed folder and preserves their buffers", () => {
    const nested = document("nested", "/workspace/docs/guide.md");
    const outside = document("outside", "/other/readme.md");
    useDocumentStore.getState().restoreDocuments([nested, outside], nested.id);

    useDocumentStore
      .getState()
      .detachDocumentsUnderRoot("/workspace/docs", true, []);

    const docs = useDocumentStore.getState().documents;
    expect(docs[0]).toMatchObject({
      id: "nested",
      path: null,
      name: "guide.md",
      content: "edited content",
      savedContent: "original content",
      detached: true,
    });
    expect(isDocumentDirty(docs[0])).toBe(true);
    expect(docs[1]).toEqual(outside);
  });

  it("keeps a tab attached when an overlapping remaining root still covers it", () => {
    const nested = document("nested", "/workspace/shared/guide.md");
    useDocumentStore.getState().restoreDocuments([nested], nested.id);

    useDocumentStore.getState().detachDocumentsUnderRoot(
      "/workspace",
      true,
      [{ path: "/workspace/shared", type: "folder" }],
    );

    expect(useDocumentStore.getState().documents[0]).toEqual(nested);
  });

  it("detaches a root file unless another remaining root covers that exact path", () => {
    const opened = document("file", "/workspace/readme.md");
    useDocumentStore.getState().restoreDocuments([opened], opened.id);

    useDocumentStore
      .getState()
      .detachDocumentsUnderRoot("/workspace/readme.md", false, []);

    expect(useDocumentStore.getState().documents[0]).toMatchObject({
      path: null,
      detached: true,
    });
  });

  it("keeps a clean detached tab clean so it can close without a discard prompt", () => {
    const clean: OpenDocument = {
      ...document("clean", "/workspace/clean.md"),
      content: "unchanged",
      savedContent: "unchanged",
    };
    useDocumentStore.getState().restoreDocuments([clean], clean.id);

    useDocumentStore
      .getState()
      .detachDocumentsUnderRoot("/workspace", true, []);

    expect(isDocumentDirty(useDocumentStore.getState().documents[0])).toBe(false);
  });
});
