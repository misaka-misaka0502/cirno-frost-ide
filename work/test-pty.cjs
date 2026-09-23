const path = require("node:path");
const pty = require("@lydell/node-pty");

const python = path.resolve("runtime", "python", "python.exe");
const child = pty.spawn(
  python,
  [
    "-u",
    "-c",
    [
      'name = input("name: ")',
      'print("hello", name)',
      'print("snowflake-ok")'
    ].join("; ")
  ],
  {
    cwd: process.cwd(),
    cols: 80,
    rows: 24,
    useConpty: true,
    env: {
      ...process.env,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8"
    }
  }
);

let output = "";
let answered = false;

child.onData((data) => {
  output += data;
  process.stdout.write(data);
  if (!answered && output.includes("name:")) {
    answered = true;
    child.write("Cirno\r");
  }
});

child.onExit(({ exitCode }) => {
  if (
    exitCode !== 0 ||
    !output.includes("hello Cirno") ||
    !output.includes("snowflake-ok")
  ) {
    console.error("PTY integration failed");
    process.exit(1);
  }
  console.log("PTY integration passed");
  process.exit(0);
});

setTimeout(() => {
  console.error("PTY integration timed out");
  child.kill();
  process.exit(1);
}, 10_000).unref();
