import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { errorMessage } from "../lib/fs";
import {
  documentToSnapshot,
  rootToSnapshot,
  SESSION_VERSION,
  type SessionSnapshot,
} from "../lib/session";
import { sessionDb } from "../lib/sessionDb";
import { useDocumentStore } from "../stores/documentStore";
import { useProjectStore } from "../stores/projectStore";
import { useToastStore } from "../stores/toastStore";

const CONTENT_SAVE_DELAY_MS = 500;

type DocumentStateSnapshot = ReturnType<typeof useDocumentStore.getState>;

let active = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let writing = false;
let pendingSnapshot: SessionSnapshot | null = null;
let pendingSerialized: string | null = null;
let lastSerialized: string | null = null;
let failureReported = false;
let writeChain: Promise<void> = Promise.resolve();

function createSnapshot(): SessionSnapshot {
  const projectState = useProjectStore.getState();
  const documentState = useDocumentStore.getState();

  return {
    version: SESSION_VERSION,
    activeDocumentId: documentState.activeId,
    project: {
      name: projectState.project.name,
      projectPath: projectState.projectPath,
      projectFilePath: projectState.projectFilePath,
      projectFileModifiedMs: projectState.projectFileModifiedMs,
      dirty: projectState.dirty,
      roots: projectState.project.roots.map(rootToSnapshot),
    },
    documents: documentState.documents.map(documentToSnapshot),
  };
}

async function writeLoop(): Promise<void> {
  while (pendingSnapshot !== null) {
    const snapshot = pendingSnapshot;
    const serialized = pendingSerialized;

    pendingSnapshot = null;
    pendingSerialized = null;

    if (serialized === null) continue;

    try {
      await sessionDb.save(snapshot);
      lastSerialized = serialized;
      failureReported = false;
    } catch (error) {
      if (!failureReported) {
        failureReported = true;
        useToastStore.getState().push(
          `Could not save the session: ${errorMessage(error)}`,
          "error",
          7000,
        );
      }

      break;
    }
  }
}

function queueWrite(): void {
  if (!active) return;

  const snapshot = createSnapshot();
  const serialized = JSON.stringify(snapshot);
  if (serialized === lastSerialized) return;

  pendingSnapshot = snapshot;
  pendingSerialized = serialized;

  if (writing) return;

  writing = true;
  writeChain = writeLoop().finally(() => {
    writing = false;
  });
}

function scheduleWrite(delayMs: number): void {
  if (!active) return;

  if (timer) {
    clearTimeout(timer);
  }

  timer = setTimeout(() => {
    timer = null;
    queueWrite();
  }, delayMs);
}

/**
 * Returns true when the only difference between two document-store states is
 * the content of one tab. Those changes can be debounced; tab changes, saves,
 * and project changes are written immediately.
 */
function isContentOnlyChange(
  next: DocumentStateSnapshot,
  previous: DocumentStateSnapshot,
): boolean {
  if (next.activeId !== previous.activeId) return false;
  if (next.documents.length !== previous.documents.length) return false;

  let changed = 0;

  for (let index = 0; index < next.documents.length; index += 1) {
    const nextDocument = next.documents[index];
    const previousDocument = previous.documents[index];

    if (nextDocument === previousDocument) continue;
    changed += 1;

    if (changed > 1) return false;

    if (
      nextDocument.id !== previousDocument.id ||
      nextDocument.path !== previousDocument.path ||
      nextDocument.name !== previousDocument.name ||
      nextDocument.kind !== previousDocument.kind ||
      nextDocument.savedContent !== previousDocument.savedContent ||
      nextDocument.size !== previousDocument.size ||
      nextDocument.modifiedMs !== previousDocument.modifiedMs
    ) {
      return false;
    }
  }

  return changed === 1;
}

/**
 * Flushes the current session immediately. Used by the window close handler
 * and when the app becomes hidden.
 */
export async function flushSession(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  if (!active) return;

  queueWrite();
  await writeChain;
}

async function registerCloseHandler(): Promise<() => void> {
  if (!isTauri()) return () => {};

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const window = getCurrentWindow();

    return await window.onCloseRequested(async (event) => {
      event.preventDefault();

      try {
        await flushSession();
      } finally {
        await window.destroy();
      }
    });
  } catch {
    // Session persistence should never prevent the app from closing.
    return () => {};
  }
}

export function useSessionPersistence(ready: boolean): void {
  useEffect(() => {
    if (!ready) return;

    active = true;

    const unsubscribeDocuments = useDocumentStore.subscribe((next, previous) => {
      if (
        next.documents === previous.documents &&
        next.activeId === previous.activeId
      ) {
        return;
      }

      scheduleWrite(
        isContentOnlyChange(next, previous) ? CONTENT_SAVE_DELAY_MS : 0,
      );
    });

    const unsubscribeProject = useProjectStore.subscribe(() => {
      scheduleWrite(0);
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void flushSession();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    // Normalize the restored state (for example after missing paths were
    // skipped) and persist it as the new baseline.
    scheduleWrite(0);

    return () => {
      unsubscribeDocuments();
      unsubscribeProject();
      document.removeEventListener("visibilitychange", onVisibilityChange);

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      active = false;
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;

    let disposed = false;
    let unlisten: (() => void) | null = null;

    void registerCloseHandler().then((stop) => {
      if (disposed) {
        stop();
        return;
      }

      unlisten = stop;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [ready]);
}
