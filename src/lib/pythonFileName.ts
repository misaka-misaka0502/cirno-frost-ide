export function normalizePythonFileName(value: string) {
  let stem = value.trim();
  if (/\.py$/i.test(stem)) {
    stem = stem.slice(0, -3);
  }
  stem = stem.trim().replace(/[. ]+$/g, "");
  if (!stem) {
    throw new Error("请输入 Python 文件名");
  }
  return `${stem}.py`;
}

export function pythonFileStem(value: string) {
  return /\.py$/i.test(value) ? value.slice(0, -3) : value;
}
