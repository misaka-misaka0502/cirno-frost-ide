const PAIRS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'"
};

const CLOSERS = new Set(Object.values(PAIRS));
const LEFT = "\x1b[D";
const RIGHT = "\x1b[C";
const DELETE = "\x1b[3~";

interface InputState {
  text: string;
  cursor: number;
}

export function createPairedTerminalInput(
  write: (data: string) => void
) {
  const state: InputState = { text: "", cursor: 0 };

  const reset = () => {
    state.text = "";
    state.cursor = 0;
  };

  return {
    handle(data: string) {
      if (data === "\r" || data === "\n" || data === "\x03") {
        reset();
        write(data);
        return;
      }

      if (data === "\x7f" || data === "\b") {
        const before = state.text[state.cursor - 1];
        const after = state.text[state.cursor];
        if (
          state.cursor > 0 &&
          after &&
          PAIRS[before] === after
        ) {
          state.text =
            state.text.slice(0, state.cursor - 1) +
            state.text.slice(state.cursor + 1);
          state.cursor -= 1;
          write(`${data}${DELETE}`);
          return;
        }
        if (state.cursor > 0) {
          state.text =
            state.text.slice(0, state.cursor - 1) +
            state.text.slice(state.cursor);
          state.cursor -= 1;
        }
        write(data);
        return;
      }

      if (data === LEFT) {
        state.cursor = Math.max(0, state.cursor - 1);
        write(data);
        return;
      }
      if (data === RIGHT) {
        state.cursor = Math.min(state.text.length, state.cursor + 1);
        write(data);
        return;
      }
      if (data === "\x01" || data === "\x1b[H") {
        state.cursor = 0;
        write(data);
        return;
      }
      if (data === "\x05" || data === "\x1b[F") {
        state.cursor = state.text.length;
        write(data);
        return;
      }

      if (
        data.length === 1 &&
        CLOSERS.has(data) &&
        state.text[state.cursor] === data
      ) {
        state.cursor += 1;
        write(RIGHT);
        return;
      }

      if (data.length === 1 && PAIRS[data]) {
        const closing = PAIRS[data];
        state.text =
          state.text.slice(0, state.cursor) +
          data +
          closing +
          state.text.slice(state.cursor);
        state.cursor += 1;
        write(`${data}${closing}${LEFT}`);
        return;
      }

      if (data.length === 1 && data >= " ") {
        state.text =
          state.text.slice(0, state.cursor) +
          data +
          state.text.slice(state.cursor);
        state.cursor += 1;
      } else if (
        data.length > 1 &&
        !data.startsWith("\x1b")
      ) {
        state.text =
          state.text.slice(0, state.cursor) +
          data +
          state.text.slice(state.cursor);
        state.cursor += data.length;
      }
      write(data);
    },
    reset
  };
}
