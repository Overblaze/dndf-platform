import { buildLibrary, type SrdChapter, type SrdLibrary } from './srd52';

// Fetched only when the shelf is opened: thirteen chapters, about 2.5 MB, that the sheet never needs.
const loaders = import.meta.glob<SrdChapter>('../../../data/reference/srd-5.2/*.json', { import: 'default' });

let loading: Promise<SrdLibrary> | undefined;

/** The whole SRD 5.2.1, read once. A failed read (no connection, files not yet kept on the device) can be tried again. */
export function loadSrd52(): Promise<SrdLibrary> {
  loading ??= Promise.all(Object.values(loaders).map((load) => load()))
    .then(buildLibrary)
    .catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  return loading;
}
