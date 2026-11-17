import { contextBridge, ipcRenderer } from "electron";

// Satu-satunya jembatan ke UI. Tidak ada akses Node atau file; semua lewat IPC yang divalidasi di proses utama.
contextBridge.exposeInMainWorld("simply", {
  connection: (): Promise<{ url: string; token: string }> => ipcRenderer.invoke("simply:connection"),
  getSettings: (): Promise<unknown> => ipcRenderer.invoke("simply:getSettings"),
  saveSettings: (s: unknown): Promise<unknown> => ipcRenderer.invoke("simply:saveSettings", s),
  chooseWorkspace: (): Promise<unknown> => ipcRenderer.invoke("simply:chooseWorkspace"),
  setToken: (provider: string, token: string): Promise<unknown> => ipcRenderer.invoke("simply:setToken", { provider, token }),
  authStatus: (): Promise<unknown> => ipcRenderer.invoke("simply:authStatus"),
  onOpenSettings: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on("simply:open-settings", listener);
    return () => ipcRenderer.removeListener("simply:open-settings", listener);
  },
});
