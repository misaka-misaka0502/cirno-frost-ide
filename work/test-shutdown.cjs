const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const electron = path.resolve("node_modules", "electron", "dist", "electron.exe");
const workDirectory = path.resolve("work");

function runInstance(extraEnv, expectedOutput, autoCloseDelay) {
  return new Promise((resolve, reject) => {
    const child = spawn(electron, ["."], {
      cwd: process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
        FROST_IDE_TEST_AUTO_CLOSE_MS: String(autoCloseDelay),
        FROST_IDE_TEST_REPORT_WORKSPACE: "1",
        ...extraEnv
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const expected = Array.isArray(expectedOutput)
        ? expectedOutput
        : [expectedOutput];
      if (
        code !== 0 ||
        expected.some((text) => !output.includes(text)) ||
        /\bEPIPE\b|uncaught exception/i.test(output)
      ) {
        reject(
          new Error(
            `Shutdown integration failed (code ${code})\n${output}`
          )
        );
        return;
      }
      resolve(output);
    });
  });
}

(async () => {
  await runInstance(
    { FROST_IDE_TEST_FORCE_EMPTY_WORKSPACE: "1" },
    "FROST_TEST_WORKSPACE_EMPTY",
    800
  );
  console.log("Empty startup workspace passed");

  const settingsPath = path.join(
    workDirectory,
    `settings-probe-${process.pid}.json`
  );
  fs.writeFileSync(
    settingsPath,
    JSON.stringify({ defaultWorkspacePath: process.cwd() }),
    "utf8"
  );
  try {
    await runInstance(
      { FROST_IDE_TEST_SETTINGS_FILE: settingsPath },
      "FROST_TEST_WORKSPACE_SET",
      1200
    );
    console.log("Default workspace startup passed");
  } finally {
    fs.rmSync(settingsPath, { force: true });
  }

  const intervalSavePath = path.join(
    workDirectory,
    `interval-autosave-probe-${process.pid}.py`
  );
  const intervalSavedContent = 'print("interval-autosave-ok")\n';
  fs.writeFileSync(intervalSavePath, 'print("old")\n', "utf8");
  try {
    await runInstance(
      {
        FROST_IDE_TEST_WORKSPACE: process.cwd(),
        FROST_IDE_TEST_AUTOSAVE_FILE: intervalSavePath,
        FROST_IDE_TEST_AUTOSAVE_CONTENT: intervalSavedContent,
        FROST_IDE_TEST_AUTOSAVE_INTERVAL_MS: "400"
      },
      "FROST_TEST_WORKSPACE_SET",
      2200
    );
    if (fs.readFileSync(intervalSavePath, "utf8") !== intervalSavedContent) {
      throw new Error("Timed autosave did not save the dirty document");
    }
    console.log("Timed autosave passed");
  } finally {
    fs.rmSync(intervalSavePath, { force: true });
  }

  const autoSavePath = path.join(
    workDirectory,
    `autosave-probe-${process.pid}.py`
  );
  const savedContent = 'print("close-autosave-ok")\n';
  fs.writeFileSync(autoSavePath, 'print("old")\n', "utf8");
  try {
    await runInstance(
      {
        FROST_IDE_TEST_WORKSPACE: process.cwd(),
        FROST_IDE_TEST_CLOSE_WINDOW: "1",
        FROST_IDE_TEST_AUTOSAVE_FILE: autoSavePath,
        FROST_IDE_TEST_AUTOSAVE_CONTENT: savedContent
      },
      ["FROST_TEST_WORKSPACE_SET", "FROST_TEST_LSP_READY"],
      5000
    );
    if (fs.readFileSync(autoSavePath, "utf8") !== savedContent) {
      throw new Error("Closing the window did not save the dirty document");
    }
    console.log("Close-time autosave passed without EPIPE");
  } finally {
    fs.rmSync(autoSavePath, { force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

setTimeout(() => {
  console.error("Shutdown integration timed out");
  process.exit(1);
}, 35_000).unref();
