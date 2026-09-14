/**
 * Where a demo keeps its media. A demo's files live at
 * `demos/<slug>/assets/<file>` and the config references them by that
 * relative path; the dev server, `validate`, `build` and `publish` all
 * resolve through the shared media walker (`media.ts`).
 */

/** Folder (inside a demo folder) that holds the demo's media files. */
export const ASSETS_DIR = 'assets';
