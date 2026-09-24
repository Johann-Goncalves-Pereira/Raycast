export function toCommandParams(command: DispatchKey): Record<string, unknown> {
  const params: Record<string, unknown> = {
    type: command.type,
    key: command.key,
  };
  if (command.text !== undefined) {
    params.text = command.text;
  }
  if (command.windowsVirtualKeyCode !== undefined) {
    params.windowsVirtualKeyCode = command.windowsVirtualKeyCode;
  }
  return params;
}

export interface DispatchKey {
  type: "keyDown" | "keyUp";
  text?: string;
  key: string;
  windowsVirtualKeyCode?: number;
}

const backspace = "BS";

/** One character from the Swift bridge becomes a down/up pair for that tab only. */
export function commandsForToken(token: string): DispatchKey[] {
  if (token === backspace) {
    return [
      { type: "keyDown", key: "Backspace", windowsVirtualKeyCode: 8 },
      { type: "keyUp", key: "Backspace", windowsVirtualKeyCode: 8 },
    ];
  }
  if (token === "\n" || token === "\r") {
    return [
      { type: "keyDown", key: "Enter", text: "\r", windowsVirtualKeyCode: 13 },
      { type: "keyUp", key: "Enter", windowsVirtualKeyCode: 13 },
    ];
  }
  return [
    { type: "keyDown", key: token, text: token },
    { type: "keyUp", key: token },
  ];
}
