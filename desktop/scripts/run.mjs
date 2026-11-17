// Jalankan Electron. Terminal VS Code mewarisi ELECTRON_RUN_AS_NODE=1, yang membuat Electron
// berjalan sebagai Node biasa (modul `app` jadi undefined), jadi variabel itu harus dihapus.
import { spawn } from "node:child_process";
import electron from "electron";

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, process.argv.slice(2), { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
