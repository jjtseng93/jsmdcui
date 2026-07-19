import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fitKittyImageToWidth, prepareKittyImages } from "../src/cui/kitty-images.mjs";
import { Screen } from "../src/screen/screen.js";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("Bun-rendered Markdown image links reserve rows and retain Kitty data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-kitty-"));
  const markdownPath = join(dir, "app.md");
  await writeFile(join(dir, "pixel.png"), ONE_PIXEL_PNG);
  const ansi = Bun.markdown.ansi("before\n\n![pixel](pixel.png)\n\nafter\n", {
    hyperlinks: true,
    columns: 40,
  });
  const result = await prepareKittyImages(ansi, markdownPath, 40);

  expect(result.images).toHaveLength(1);
  expect(result.images[0]).toMatchObject({ mime: "image/png", cols: 1, rows: 1 });
  expect(result.images[0].data.equals(ONE_PIXEL_PNG)).toBe(true);
  expect(Bun.stripANSI(result.rendered)).toContain("📷 pixel");
});

test("Kitty image sizing subtracts the gutter width without depending on remaining rows", () => {
  // A 100-column pane with a 5-column gutter has 94 usable image columns:
  // five for the gutter and one final column reserved like viu.mjs.
  expect(fitKittyImageToWidth({ cols: 100, rows: 40 }, 94)).toEqual({ cols: 94, rows: 38 });
  expect(fitKittyImageToWidth({ cols: 62, rows: 21 }, 95)).toEqual({ cols: 62, rows: 21 });
  expect(fitKittyImageToWidth({ cols: 62, rows: 21 }, 40)).toEqual({ cols: 40, rows: 14 });
});

test("Screen emits chunked Kitty placement at the requested cell and deletes only its IDs", () => {
  const screen = new Screen({ mouse: false, kittyMode: "extended" });
  const writes = [];
  screen.write = (value) => writes.push(String(value));
  screen.setKittyImages([{
    id: 77,
    x: 3,
    y: 4,
    cols: 5,
    rows: 2,
    sourceX: 0,
    sourceY: 0,
    sourceWidth: 1,
    sourceHeight: 1,
    mime: "image/png",
    data: ONE_PIXEL_PNG,
  }]);
  screen.Show();
  const first = writes.join("");
  expect(first).toContain("\x1b[5;4H");
  expect(first).toContain("\x1b_Ga=T,f=100,t=d,i=77,p=77,q=2,x=0,y=0,w=1,h=1,c=5,r=2,C=1,U=image/png,m=0;");

  writes.length = 0;
  screen.setKittyImages([]);
  screen.Show();
  expect(writes.join("")).toContain("\x1b_Ga=d,d=i,i=77,q=2;");
  expect(writes.join("")).not.toContain("d=a");

  writes.length = 0;
  screen.setKittyImages([{
    id: 77, x: 3, y: 2, cols: 5, rows: 2,
    sourceX: 0, sourceY: 0, sourceWidth: 1, sourceHeight: 1,
    mime: "image/png", data: ONE_PIXEL_PNG,
  }]);
  screen.Show();
  const replaced = writes.join("");
  expect(replaced).toContain("\x1b_Ga=p,i=77,p=77,q=2,x=0,y=0,w=1,h=1,c=5,r=2,C=1,U=image/png;");
  expect(replaced).not.toContain("a=T");
  expect(replaced).not.toContain(ONE_PIXEL_PNG.toString("base64"));
});

test("Screen gates Kitty output by mode and compat mode omits the MIME U extension", () => {
  const image = {
    id: 88, x: 0, y: 0, cols: 1, rows: 1,
    sourceX: 0, sourceY: 0, sourceWidth: 1, sourceHeight: 1,
    mime: "image/jpeg", data: ONE_PIXEL_PNG,
  };

  const off = new Screen({ mouse: false });
  const offWrites = [];
  off.write = (value) => offWrites.push(String(value));
  off.setKittyImages([image]);
  off.Show();
  expect(offWrites.join("")).not.toContain("\x1b_G");

  const compat = new Screen({ mouse: false, kittyMode: "compat" });
  const compatWrites = [];
  compat.write = (value) => compatWrites.push(String(value));
  compat.setKittyImages([image]);
  compat.Show();
  const output = compatWrites.join("");
  expect(output).toContain("\x1b_Ga=T");
  expect(output).not.toContain("U=image/jpeg");
});
