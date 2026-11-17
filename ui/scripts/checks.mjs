// Pemeriksaan UI inti yang dipakai bersama oleh smoke web (Vite) dan smoke desktop (Electron).
// Halaman harus sudah `live` dan terhubung ke server dengan runner palsu (scripts/fake-runner.ts).
import { join } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function coreChecks(page, check, OUT) {
  await page.waitForSelector(".react-flow__node-agent");
  const agentCount = await page.$$eval(".react-flow__node-agent", (els) => els.length);
  check("8 kartu agent tampil", agentCount === 8, String(agentCount));
  const groupCount = await page.$$eval(".react-flow__node-group", (els) => els.length);
  check("4 bingkai grup peran", groupCount === 4, String(groupCount));
  const heights = await page.$$eval(".react-flow__node-agent > div", (els) => [...new Set(els.map((e) => e.offsetHeight))].sort());
  check("tinggi kartu tetap (2 ukuran: biasa dan koordinator)", heights.length === 2, heights.join(","));
  const miniNodes = await page.$$eval(".react-flow__minimap-node", (els) => els.length);
  check("minimap menggambar grup dan agent", miniNodes >= 12, String(miniNodes));
  await page.screenshot({ path: join(OUT, "1-overview.png") });

  const clickSidebar = (name) => page.evaluate((n) => [...document.querySelectorAll("nav button")].find((b) => b.textContent.includes(n)).click(), name);
  const drawer = () => page.$eval("aside", (e) => e.getAttribute("aria-label")).catch(() => null);
  await clickSidebar("Dax");
  await sleep(300);
  check("klik sidebar membuka drawer", (await drawer()) === "Detail Dax", await drawer());
  await page.keyboard.press("ArrowRight");
  await sleep(300);
  check("panah kanan pindah ke agent berikutnya", (await drawer()) === "Detail Maya", await drawer());
  await page.keyboard.press("Escape");
  await sleep(150);
  check("Esc menutup drawer", (await drawer()) === null);
  await page.keyboard.press("/");
  check("/ memfokuskan command bar", (await page.evaluate(() => document.activeElement?.id)) === "command");

  await page.keyboard.type("@Pi");
  await sleep(150);
  const options = await page.$$eval('[role="option"]', (els) => els.map((e) => e.textContent));
  check("@mention menyarankan Pip", options.some((o) => o.startsWith("@Pip")), options.join("|"));
  await page.keyboard.press("Tab");
  check("Tab melengkapi mention", (await page.$eval("#command", (e) => e.value)) === "@Pip ");
  await page.keyboard.type("cek login");
  await page.keyboard.press("Enter");

  // Delegasi Pip -> Dax dan Ken: label edge muncul, lalu kedua agent selesai.
  const edgeLabel = await page.waitForFunction(
    () => [...document.querySelectorAll(".react-flow__edgelabel-renderer div")].map((d) => d.textContent).find((t) => t.includes("review: cek login")),
    { timeout: 10000 },
  ).then(() => true).catch(() => false);
  check("label delegasi muncul di edge", edgeLabel);
  // Posisi label dihitung ulang sesaat setelah muncul; tunggu sampai tata letak stabil (maks 2 detik).
  const labelCover = await page.evaluate(async () => {
    const find = () => [...document.querySelectorAll(".react-flow__edgelabel-renderer div")].find((d) => d.textContent.includes("review: cek login"));
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    let last = "label tidak ditemukan";
    for (let i = 0; i < 40; i++) {
      await frame();
      const el = find();
      if (!el) continue;
      // Label memakai pointer-events: none; aktifkan sementara supaya elementFromPoint bisa mengenainya.
      el.style.pointerEvents = "auto";
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      el.style.pointerEvents = "";
      if (hit === el || el.contains(hit)) return null;
      last = `tertutup oleh <${hit?.tagName?.toLowerCase()} class="${String(hit?.className).slice(0, 60)}">`;
      await new Promise((r) => setTimeout(r, 50));
    }
    return last;
  });
  const labelOnTop = labelCover === null;
  check("label edge tidak tertutup kartu", labelOnTop, labelCover ?? "");
  await page.screenshot({ path: join(OUT, "2-delegasi.png") });
  const finished = await page.waitForFunction(
    () => ["Dax", "Ken"].every((n) => [...document.querySelectorAll("nav button")].find((b) => b.textContent.includes(n))?.textContent.includes("done")),
    { timeout: 10000 },
  ).then(() => true).catch(() => false);
  check("Dax dan Ken selesai setelah delegasi", finished);
  // Regresi: edge pernah hilang permanen setelah update agent (node tanpa `measured`). Harus 7 garis koordinator.
  await sleep(500);
  const edgeCount = await page.$$eval(".react-flow__edge", (els) => els.length);
  check("7 edge tetap tergambar setelah update agent", edgeCount === 7, String(edgeCount));

  await clickSidebar("Dax");
  await sleep(300);
  const drawerText = await page.$eval("aside", (e) => e.textContent);
  check("drawer menampilkan file yang disentuh", drawerText.includes("src/app.ts"));
  check("drawer menampilkan biaya", /\$0\.00\d/.test(drawerText));
  const topText = await page.$eval("header", (e) => e.textContent);
  check("bar atas menampilkan biaya dan budget", topText.includes("$1.00"), topText.replace(/\s+/g, " ").slice(-60));
  await page.screenshot({ path: join(OUT, "3-drawer.png") });
}
