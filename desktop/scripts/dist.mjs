// Bangun paket untuk platform mesin ini: Linux .deb, Windows NSIS, macOS dmg.
// Pakai: node scripts/dist.mjs [--dir]   (--dir = app jadi tanpa installer, untuk tes)
// Tiap platform dibangun di mesinnya sendiri: binary claude dan installer-nya khusus platform.
import { build, Platform } from "electron-builder";

delete process.env.ELECTRON_RUN_AS_NODE; // diwariskan terminal VS Code; merusak build
const TARGET = { linux: "deb", win32: "nsis", darwin: "dmg" }[process.platform];
if (!TARGET) throw new Error(`platform tidak didukung: ${process.platform}`);

const dir = process.argv.includes("--dir");
const files = await build({ targets: Platform.current().createTarget(dir ? "dir" : TARGET), publish: "never" });
console.log(files.join("\n"));
