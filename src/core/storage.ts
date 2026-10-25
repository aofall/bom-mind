import { deserializeProject, serializeProject } from './parser';
import type { Project } from './types';
const DB = 'bom-mind-v1';
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveRecent(project: Project | null) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      if (project) {
        tx.objectStore('projects').put(serializeProject(project), 'recent');
      } else {
        tx.objectStore('projects').delete('recent');
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function loadRecent(): Promise<Project | null> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('projects', 'readonly').objectStore('projects').get('recent');
      request.onsuccess = () => {
        try {
          resolve(typeof request.result === 'string' ? deserializeProject(request.result) : null);
        } catch (e) {
          reject(e);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
