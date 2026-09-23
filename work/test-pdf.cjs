const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const {
  mkdtemp,
  rm,
  writeFile
} = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

function createTestPdf(pageCount, label) {
  const firstPageObject = 3;
  const firstContentObject = firstPageObject + pageCount;
  const fontObject = firstContentObject + pageCount;
  const pageReferences = Array.from(
    { length: pageCount },
    (_, index) => `${firstPageObject + index} 0 R`
  ).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageReferences}] /Count ${pageCount} >>`
  ];
  for (let index = 0; index < pageCount; index += 1) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${firstContentObject + index} 0 R >>`
    );
  }
  for (let index = 0; index < pageCount; index += 1) {
    const pageCommands =
      `BT /F1 18 Tf 72 720 Td (${label} page ${index + 1}) Tj ET\n`;
    objects.push(
      `<< /Length ${Buffer.byteLength(pageCommands, "binary")} >>\nstream\n${pageCommands}endstream`
    );
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body, "binary"));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "binary");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "binary");
}

async function main() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "frost-pdf-test-"));
  const pdfPath = path.join(workspace, "reference.pdf");
  const secondPdfPath = path.join(workspace, "second.pdf");
  await writeFile(pdfPath, createTestPdf(3, "Frost reference"));
  await writeFile(secondPdfPath, createTestPdf(2, "Frost second"));
  const electronPath = path.join(
    __dirname,
    "..",
    "node_modules",
    "electron",
    "dist",
    "electron.exe"
  );
  const projectPath = path.resolve(__dirname, "..");
  const electronEnvironment = {
    ...process.env,
    FROST_IDE_TEST_WORKSPACE: workspace,
    FROST_IDE_TEST_PDF_PATH: pdfPath,
    FROST_IDE_TEST_PDF_SECOND_PATH: secondPdfPath
  };
  delete electronEnvironment.ELECTRON_RUN_AS_NODE;

  try {
    const output = await new Promise((resolve, reject) => {
      const child = spawn(electronPath, [projectPath], {
        cwd: projectPath,
        env: electronEnvironment,
        windowsHide: true
      });
      let combined = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`PDF reader test timed out\n${combined}`));
      }, 45000);
      child.stdout.on("data", (chunk) => {
        combined += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        combined += chunk.toString();
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(combined);
        } else {
          reject(new Error(`PDF reader exited with ${code}\n${combined}`));
        }
      });
    });
    assert.match(output, /PDF_READER_UI_PASSED/);
    console.log(
      "Continuous PDF scrolling, multi-document switching, and position restore passed"
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
