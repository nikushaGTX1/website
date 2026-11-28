/**
 * Photos of an unsent listing draft, kept in this browser (IndexedDB) in their order, so
 * "Save draft" followed by a refresh does not lose them. localStorage is too small for photos.
 */
const DB = 'velven-listing-draft';
const STORE = 'photos';
const KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDraftPhotos(files: File[]): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(files.map((file) => ({ name: file.name, type: file.type, blob: file })), KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* Private window or storage blocked: the text draft is still saved. */
  }
}

export async function loadDraftPhotos(): Promise<File[]> {
  try {
    const db = await open();
    const stored = await new Promise<Array<{ name: string; type: string; blob: Blob }> | undefined>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return (stored || []).map((item) => new File([item.blob], item.name, { type: item.type }));
  } catch {
    return [];
  }
}
