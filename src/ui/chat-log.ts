interface ChatLogAPI {
  addMessage(agentId: string, text: string): void;
  addSystem(text: string): void;
  addDM(fromAgentId: string, toAgentId: string, preview: string): void;
  enableInput(): void;
}

/**
 * Scrollable chat log panel (bottom-left).
 * Shows broadcast messages and system events.
 * Includes a chat input field for player messages.
 */
export function setupChatLog(onSendChat?: (text: string) => void): ChatLogAPI {
  const container = document.getElementById("chat-log")!;

  const titleEl = document.createElement("div");
  titleEl.className = "chat-title";
  titleEl.textContent = "World Chat";
  container.appendChild(titleEl);

  const messagesEl = document.createElement("div");
  messagesEl.className = "chat-messages";
  container.appendChild(messagesEl);

  // Chat input
  const inputEl = document.createElement("input");
  inputEl.className = "chat-input";
  inputEl.type = "text";
  inputEl.placeholder = "Press Enter to chat...";
  inputEl.maxLength = 500;
  inputEl.disabled = true;
  container.appendChild(inputEl);

  // Stop WASD from firing while typing
  inputEl.addEventListener("keydown", (e) => {
    e.stopPropagation();

    if (e.key === "Enter") {
      const text = inputEl.value.trim();
      if (text && onSendChat) {
        onSendChat(text);
      }
      inputEl.value = "";
    }

    if (e.key === "Escape") {
      inputEl.blur();
    }
  });

  inputEl.addEventListener("keyup", (e) => {
    e.stopPropagation();
  });

  function addEntry(className: string, content: string): void {
    const el = document.createElement("div");
    el.className = `chat-entry ${className}`;
    el.textContent = content;
    messagesEl.appendChild(el);

    // Keep max 100 entries
    while (messagesEl.children.length > 100) {
      messagesEl.removeChild(messagesEl.firstChild!);
    }

    // Auto-scroll to bottom
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  return {
    addMessage(agentId: string, text: string) {
      const time = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      addEntry("chat-msg", `[${time}] ${agentId}: ${text}`);
    },
    addSystem(text: string) {
      addEntry("chat-system", `— ${text}`);
    },
    addDM(fromAgentId: string, toAgentId: string, preview: string) {
      addEntry("chat-dm", `[DM] ${fromAgentId} → ${toAgentId}: ${preview}`);
    },
    enableInput() {
      inputEl.disabled = false;
      inputEl.placeholder = "Type a message...";
    },
  };
}
