// Types for the vendored songdrive.js (GP Song Tools, v1.1.0). The library is a UMD file: in a browser module it
// registers itself as globalThis.SongDrive, so src/lib/drive.ts imports it for the side effect and reads that global.
export interface DriveFile { id: string; name: string; mimeType?: string; size?: string; modifiedTime?: string; version?: string }
export interface DriveFolder { id: string; name: string; created?: boolean }
export interface SongDriveErrorLike extends Error { code: string; status: number }
export interface DriveAuth {
  token: () => string | null | undefined;
  signIn: (opts?: { prompt?: string }) => Promise<void>;
  signOut?: () => Promise<void>;
}
export interface DriveFileMeta extends DriveFile { parents?: string[] }
export interface SongDriveApi {
  VERSION: string;
  SUBFOLDERS: string[];
  SongDriveError: new (message: string, opts?: { code?: string; status?: number }) => SongDriveErrorLike;
  configure(opts?: { clientId?: string; fetch?: typeof fetch; chunk?: number; sleep?: (ms: number) => Promise<void>; auth?: DriveAuth | null }): void;
  signedIn(): boolean;
  /** Call straight from a click: Google's popup is blocked otherwise. */
  signIn(opts?: { prompt?: string }): Promise<void>;
  signOut(): Promise<void>;
  folderName(title: string): string;
  songFolder(doc: unknown, opts?: { create?: boolean; confirm?: (name: string) => boolean | Promise<boolean> }): Promise<DriveFolder | null>;
  subfolder(songFolderId: string, name: string, opts?: { create?: boolean }): Promise<{ id: string; name: string } | null>;
  list(folderId: string, opts?: { mimePrefix?: string }): Promise<DriveFile[]>;
  download(fileId: string): Promise<Blob>;
  move(fileId: string, toFolderId: string, opts?: { fromFolderId?: string }): Promise<DriveFileMeta>;
  rename(fileId: string, name: string): Promise<DriveFileMeta>;
  trash(fileId: string): Promise<DriveFileMeta>;
  findFolder(parentId: string, name: string): Promise<{ id: string; name: string } | null>;
  children(folderId: string, opts?: { foldersOnly?: boolean; filesOnly?: boolean; q?: string }): Promise<DriveFile[]>;
  upload(
    folderId: string,
    name: string,
    blob: Blob,
    opts?: { mimeType?: string; fileId?: string; onProgress?: (sent: number, total: number) => void; signal?: AbortSignal },
  ): Promise<DriveFile>;
}
