import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { terminalBus } from "../lib/terminalBus";
import { createPairedTerminalInput } from "../lib/pairedTerminalInput";
import "@xterm/xterm/css/xterm.css";

interface TerminalSurfaceProps {
  sessionId: string;
  visible?: boolean;
  className?: string;
  fontSize?: number;
}

export function TerminalSurface({
  sessionId,
  visible = true,
  className = "",
  fontSize = 13
}: TerminalSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      disableStdin: false,
      drawBoldTextInBrightColors: true,
      fontFamily:
        '"JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace',
      fontSize,
      fontWeight: "400",
      fontWeightBold: "600",
      letterSpacing: 0.2,
      lineHeight: 1.25,
      macOptionIsMeta: true,
      rightClickSelectsWord: true,
      scrollback: 12_000,
      smoothScrollDuration: 110,
      theme: {
        background: "#07111f",
        foreground: "#dce9f7",
        cursor: "#73e7ff",
        cursorAccent: "#07111f",
        selectionBackground: "#2b6f8f77",
        black: "#0b1422",
        red: "#ff6b84",
        green: "#74e6b2",
        yellow: "#f4d78b",
        blue: "#7fb8ff",
        magenta: "#c59bff",
        cyan: "#65def1",
        white: "#dce9f7",
        brightBlack: "#617188",
        brightRed: "#ff8ca0",
        brightGreen: "#97f0ca",
        brightYellow: "#ffe3a1",
        brightBlue: "#9bc8ff",
        brightMagenta: "#d8b8ff",
        brightCyan: "#8cecff",
        brightWhite: "#ffffff"
      }
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(hostRef.current);
    terminalRef.current = terminal;
    fitRef.current = fitAddon;

    const resize = () => {
      if (!hostRef.current || hostRef.current.clientWidth < 20) {
        return;
      }
      try {
        fitAddon.fit();
        window.frost.terminal.resize(
          sessionId,
          terminal.cols,
          terminal.rows
        );
      } catch {
        // Hidden panels can briefly have no measurable dimensions.
      }
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(hostRef.current);
    const pairedInput = createPairedTerminalInput((data) =>
      window.frost.terminal.write(sessionId, data)
    );
    const inputDisposable = terminal.onData((data) =>
      pairedInput.handle(data)
    );
    const unsubscribeData = terminalBus.subscribe(sessionId, (data) =>
      terminal.write(data)
    );
    const unsubscribeClear = terminalBus.onClear(sessionId, () =>
      terminal.clear()
    );

    requestAnimationFrame(() => {
      resize();
      terminal.focus();
    });

    return () => {
      resizeObserver.disconnect();
      inputDisposable.dispose();
      unsubscribeData();
      unsubscribeClear();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [fontSize, sessionId]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
        const terminal = terminalRef.current;
        if (terminal) {
          window.frost.terminal.resize(
            sessionId,
            terminal.cols,
            terminal.rows
          );
          terminal.focus();
        }
      } catch {
        // The next ResizeObserver event will fit it.
      }
    });
  }, [sessionId, visible]);

  return (
    <div
      ref={hostRef}
      className={`terminal-surface ${className}`}
      onMouseDown={() => terminalRef.current?.focus()}
    />
  );
}
