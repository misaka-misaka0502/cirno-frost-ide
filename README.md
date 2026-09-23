# Frost IDE

Frost IDE 是一个专注于 Python 的现代桌面编辑器：

- Monaco 编辑器与本地 Pyright LSP 智能补全、实时语法诊断
- 基于 Windows ConPTY 的流畅输入、输出与 `input()` 交互
- 项目内置、完全隔离的 Python 3.14.7 运行时
- PyPI 搜索、安装、卸载和已安装包管理
- 文件夹工作区、文件树、新建、重命名与回收站删除
- 可连续新建多个文件，并直接在编辑器标签中输入文件名
- 可设置启动时自动打开的默认工作区
- 每 20 秒自动保存，并在关闭软件前保存未保存内容
- 文件编程与多个互相隔离的 Python REPL

## 开发

```powershell
npm install
npm run dev
```

## 验证

```powershell
npm run test:integration
```

## 常用快捷键

- `Ctrl+S` 保存，`F5` 运行
- `Ctrl+F` 查找，`Ctrl+H` 替换，`Ctrl+G` 跳转到行
- `Ctrl+/` 切换行注释，`Alt+↑/↓` 移动行
- `Ctrl+W` 关闭当前文件，`Ctrl+Tab` / `Ctrl+Shift+Tab` 切换文件
- `Ctrl+O` 打开工作区，`Ctrl+N` 新建 Python 文件
- `Ctrl+J` 切换底部面板，`Ctrl+Shift+M` 显示问题列表
