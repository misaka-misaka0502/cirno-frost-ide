const WINDOWS_RESERVED_NAME =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function normalizePythonFileName(value) {
  let stem = String(value ?? "").trim();
  if (/\.py$/i.test(stem)) {
    stem = stem.slice(0, -3);
  }
  stem = stem.trim().replace(/[. ]+$/g, "");
  if (!stem) {
    throw new Error("请输入 Python 文件名");
  }
  const fileName = `${stem}.py`;
  if (
    /[<>:"/\\|?*\u0000-\u001f]/.test(fileName) ||
    WINDOWS_RESERVED_NAME.test(fileName)
  ) {
    throw new Error("文件名包含 Windows 不允许使用的字符或保留名称");
  }
  return fileName;
}
