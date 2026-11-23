// Google Drive for the GP Song Tools (shared library). songdrive.js is a vendored UMD file that is never edited;
// as a module it sets globalThis.SongDrive, so import it for that effect. Import this before songSpec so the shared
// Song spec panel finds it and shows Save to Drive / Open from Drive.
import '../vendor/songdrive.js';
import type { SongDriveApi } from '../vendor/songdrive';

const lib = (globalThis as { SongDrive?: SongDriveApi }).SongDrive;
if (!lib) throw new Error('songdrive.js did not load');
export const SongDrive: SongDriveApi = lib;
