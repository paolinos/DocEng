import { useEffect, useState } from "react";
import { errorMessage, fileSystem } from "../lib/fs";
import {
  documentKindForPath,
  documentLanguageForPath,
  type OpenDocument,
  type Project,
  type ProjectRoot,
} from "../types";
import { basename } from "../lib/utils";
import { parseSessionSnapshot } from "../lib/session";
import { sessionDb, type SessionLoadResult } from "../lib/sessionDb";
import { useDocumentStore } from "../stores/documentStore";
import { useProjectStore } from "../stores/projectStore";
import { useToastStore } from "../stores/toastStore";

/**
 * Restores the previous workspace exactly once per app launch.
 *
 * React StrictMode mounts effects twice in development, so the restore work is
 * shared through a module-level promise instead of being repeated.
 */
let restorePromise: Promise<void> | null = null;

function warningForMissing(label: string, paths: string[]): string {
  const shown = paths.slice(0, 3).join(", ");
  const more =
    paths.length > 3 ? `, and ${paths.length - 3} more` : "";
  const noun =
    paths.length === 1 ? label.toLowerCase() : `${label.toLowerCase()}s`;

  return `Could not restore ${paths.length} ${noun}: ${shown}${more}.`;
}

async function performRestore(): Promise<void> {
  let loaded: SessionLoadResult;

  try {
    loaded = await sessionDb.load();
  } catch (error) {
    useToastStore.getState().push(
      `Could not load the previous session: ${errorMessage(error)}`,
      "warning",
      9000,
    );
    return;
  }

  const warnings: string[] = [];
  if (loaded.warning) warnings.push(loaded.warning);

  if (loaded.snapshot === null) {
    if (warnings.length > 0) {
      useToastStore
        .getState()
        .push(warnings.join(" "), "warning", 10000);
    }
    return;
  }

  const snapshot = parseSessionSnapshot(loaded.snapshot);
  if (snapshot === null) {
    warnings.push("The saved session could not be read and was ignored.");
    useToastStore.getState().push(warnings.join(" "), "warning", 10000);
    return;
  }

  const rootPaths = snapshot.project.roots.map((root) => root.path);
  let restoredRoots: ProjectRoot[] = [];

  if (rootPaths.length > 0) {
    try {
      const restored = await sessionDb.restoreProjectRoots(rootPaths);
      const canonicalByOriginal = new Map(
        restored.roots.map((root) => [root.originalPath, root.path]),
      );

      restoredRoots = snapshot.project.roots
        .map((root) => {
          const canonical = canonicalByOriginal.get(root.path);
          return canonical === undefined ? null : { ...root, path: canonical };
        })
        .filter((root): root is ProjectRoot => root !== null);

      if (restored.missing.length > 0) {
        warnings.push(warningForMissing("Workspace path", restored.missing));
      }
    } catch (error) {
      warnings.push(
        `Could not restore the workspace folders: ${errorMessage(error)}`,
      );
    }
  }

  const rootsRemoved =
    restoredRoots.length !== snapshot.project.roots.length;
  const project: Project = {
    version: 1,
    name: snapshot.project.name || "Untitled Project",
    roots: restoredRoots,
  };

  useProjectStore.getState().restoreProject(project, {
    projectPath: snapshot.project.projectPath,
    projectFilePath: snapshot.project.projectFilePath,
    projectFileModifiedMs: snapshot.project.projectFileModifiedMs,
    dirty: snapshot.project.dirty || rootsRemoved,
  });

  const documents: OpenDocument[] = [];
  const missingDocuments: string[] = [];

  for (const saved of snapshot.documents) {
    if (saved.path === null) {
      documents.push({
        ...saved,
        language: saved.detached
          ? documentLanguageForPath(saved.name, saved.kind)
          : null,
        image: null,
      });
      continue;
    }

    // Removed project roots leave detached tabs as recoverable in-memory
    // buffers. Do not re-authorize or reload their old paths during restore.
    if (saved.detached) {
      documents.push({
        ...saved,
        path: null,
        language: documentLanguageForPath(saved.name, saved.kind),
        image: null,
        modifiedMs: null,
      });
      continue;
    }

    try {
      const restoredKind = documentKindForPath(saved.path);

      if (restoredKind === "image") {
        // Image payloads are never persisted; reload the bytes from disk.
        const image = await fileSystem.readImageFile(saved.path);

        documents.push({
          ...saved,
          path: image.path,
          name: basename(image.path),
          kind: "image",
          language: null,
          image: { mimeType: image.mimeType, dataUrl: image.dataUrl },
          content: "",
          savedContent: "",
          size: image.size,
          modifiedMs: image.modifiedMs,
        });
        continue;
      }

      if (saved.content !== saved.savedContent) {
        // Dirty documents keep the persisted buffer. Statting the path proves
        // it still exists and is still inside the authorized workspace.
        const info = await fileSystem.statPath(saved.path);
        if (!info.isFile) throw new Error("Path is no longer a file.");

        const kind = documentKindForPath(saved.path);

        documents.push({
          ...saved,
          kind,
          language: documentLanguageForPath(saved.path, kind),
          image: null,
          size: info.size,
        });
      } else {
        // Clean documents are reloaded so external edits are picked up.
        const file = await fileSystem.readTextFile(saved.path);
        const kind = documentKindForPath(file.path);

        documents.push({
          ...saved,
          path: file.path,
          name: basename(file.path),
          kind,
          language: documentLanguageForPath(file.path, kind),
          image: null,
          content: file.content,
          savedContent: file.content,
          size: file.size,
          modifiedMs: file.modifiedMs,
        });
      }
    } catch {
      missingDocuments.push(saved.path);
    }
  }

  if (missingDocuments.length > 0) {
    warnings.push(warningForMissing("File", missingDocuments));
  }

  useDocumentStore
    .getState()
    .restoreDocuments(documents, snapshot.activeDocumentId);

  if (warnings.length > 0) {
    useToastStore.getState().push(warnings.join(" "), "warning", 10000);
  }
}

function restoreOnce(): Promise<void> {
  if (!restorePromise) {
    restorePromise = performRestore().catch((error) => {
      useToastStore.getState().push(
        `Could not restore the previous session: ${errorMessage(error)}`,
        "warning",
        9000,
      );
    });
  }

  return restorePromise;
}

export function useSessionRestore(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void restoreOnce().then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
