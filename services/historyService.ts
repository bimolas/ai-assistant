/**
 * Context7
 * ----------
 * History service for Unit 2B voice assistant.
 * Stores a small JSON file in the app document directory containing
 * recent voice commands and timestamps.
 *
 * Migration note:
 * The modern Expo Filesystem API introduced `File` / `Directory` classes.
 * For compatibility across the project we import the legacy API from
 * `expo-file-system/legacy` which preserves `readAsStringAsync` /
 * `writeAsStringAsync` helpers. To migrate fully to the new API, move
 * storage to `File` and `Directory` types and use the async methods
 * described in the Expo Filesystem docs.
 *
 * See: https://docs.expo.dev/versions/latest/sdk/filesystem/
 */

import * as FileSystem from "expo-file-system/legacy";

export interface HistoryEntry {
  id: string;
  command: string;
  timestamp: number;
  response?: string;
  type?: string;
  short?: string; // Truncated display text
  expandable?: boolean; // If true, can expand to see full details
  day?: string; // two-digit day
  month?: string; // two-digit month
  year?: string; // two-digit year
  time?: string; // HH:MM
}

const FILENAME = `${FileSystem.documentDirectory}db-history.json`;

async function readFile(): Promise<HistoryEntry[]> {
  try {
    const info = await FileSystem.getInfoAsync(FILENAME);
    if (!info.exists) return [];
    const content = await FileSystem.readAsStringAsync(FILENAME);
    return JSON.parse(content || "[]") as HistoryEntry[];
  } catch (e) {
    console.warn("historyService: readFile error", e);
    return [];
  }
}

async function writeFile(items: HistoryEntry[]) {
  try {
    await FileSystem.writeAsStringAsync(FILENAME, JSON.stringify(items));
  } catch (e) {
    console.warn("historyService: writeFile error", e);
  }
}

export const historyService = {
  async add(command: string) {
    const items = await readFile();
    const entry: HistoryEntry = {
      id: String(Date.now()) + Math.random().toString(36).slice(2, 8),
      command,
      timestamp: Date.now(),
    };
    // add numeric day/month/year (two-digit) and HH:MM time
    try {
      const d = new Date(entry.timestamp);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yy = String(d.getFullYear()).slice(-2).padStart(2, "0");
      const tt = `${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes()
      ).padStart(2, "0")}`;
      entry.day = dd;
      entry.month = mm;
      entry.year = yy;
      entry.time = tt;
    } catch (e) {
      /* ignore */
    }
    // Deduplicate immediate repeats (same command within a short window).
    // Normalize whitespace and case for comparison so minor formatting
    // differences don't cause duplicates.
    const normalize = (s: string) =>
      (s || "").trim().replace(/\s+/g, " ").toLowerCase();
    const last = items[0];
    if (
      last &&
      normalize(last.command) === normalize(entry.command) &&
      Math.abs(last.timestamp - entry.timestamp) < 3000
    ) {
      // update timestamp instead of adding duplicate
      last.timestamp = entry.timestamp;
      try {
        const d = new Date(entry.timestamp);
        last.day = String(d.getDate()).padStart(2, "0");
        last.month = String(d.getMonth() + 1).padStart(2, "0");
        last.year = String(d.getFullYear()).slice(-2).padStart(2, "0");
        last.time = `${String(d.getHours()).padStart(2, "0")}:${String(
          d.getMinutes()
        ).padStart(2, "0")}`;
      } catch (e) {
        /* ignore */
      }
      await writeFile(items);
      return last;
    }

    items.unshift(entry);
    await writeFile(items);
    return entry;
  },

  /**
   * Record a question and the assistant/LLM response together.
   * This creates a HistoryEntry with `command` set to the question and
   * `response` set to the assistant reply; `type` will be 'llm' by default.
   */
  /**
   * Record an LLM/2B interaction, storing only the interpreted question or answer.
   * If the response is long, store a truncated version in `short` and mark as expandable.
   */
  async addWithResponse(question: string, response: string, type = "llm") {
    const items = await readFile();
    // Prefer the LLM's answer for display, fallback to question if no answer
    let display =
      response && typeof response === "string" && response.trim()
        ? response.trim()
        : question && typeof question === "string" && question.trim()
        ? question.trim()
        : "";
    let short: string | undefined = undefined;
    let expandable = false;
    const MAX_LEN = 80;
    if (typeof display === "string" && display.length > MAX_LEN) {
      short = display.slice(0, MAX_LEN) + "...";
      expandable = true;
    }

    // For LLM/2B interactions we only store the assistant `response` to
    // avoid duplicating the answer in both `command` and `response`.
    // `command` is left empty for these entries. If the response is
    // long we store a truncated `short` and mark as `expandable`.
    const entry: HistoryEntry = {
      id: String(Date.now()) + Math.random().toString(36).slice(2, 8),
      command: "",
      response: display,
      type,
      short,
      expandable,
      timestamp: Date.now(),
    };

    // populate numeric date/time fields
    try {
      const d = new Date(entry.timestamp);
      entry.day = String(d.getDate()).padStart(2, "0");
      entry.month = String(d.getMonth() + 1).padStart(2, "0");
      entry.year = String(d.getFullYear()).slice(-2).padStart(2, "0");
      entry.time = `${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes()
      ).padStart(2, "0")}`;
    } catch (e) {
      /* ignore */
    }

    // Deduplicate consecutive identical responses (within a short time
    // window) to avoid double registration caused by overlapping
    // processing paths or retries.
    const last = items[0];
    const normalizeResp = (s?: string) =>
      (s || "").trim().replace(/\s+/g, " ").toLowerCase();
    if (
      last &&
      last.type === entry.type &&
      normalizeResp(last.response) === normalizeResp(entry.response) &&
      Math.abs(last.timestamp - entry.timestamp) < 3000
    ) {
      // Update timestamp on existing entry instead of adding a duplicate
      last.timestamp = entry.timestamp;
      try {
        const d = new Date(entry.timestamp);
        last.day = String(d.getDate()).padStart(2, "0");
        last.month = String(d.getMonth() + 1).padStart(2, "0");
        last.year = String(d.getFullYear()).slice(-2).padStart(2, "0");
        last.time = `${String(d.getHours()).padStart(2, "0")}:${String(
          d.getMinutes()
        ).padStart(2, "0")}`;
      } catch (e) {
        /* ignore */
      }
      await writeFile(items);
      return last;
    }
    items.unshift(entry);
    await writeFile(items);
    return entry;
  },

  async getAll(): Promise<HistoryEntry[]> {
    return readFile();
  },

  async clear() {
    try {
      await FileSystem.deleteAsync(FILENAME, { idempotent: true });
    } catch (e) {
      console.warn("historyService: clear error", e);
    }
  },

  async search(q: string): Promise<HistoryEntry[]> {
    const all = await readFile();
    const normalized = q.trim().toLowerCase();
    if (!normalized) return all;
    return all.filter((h) => {
      const cmd = (h.command || "").toLowerCase();
      const resp = (h.response || "").toLowerCase();
      return cmd.includes(normalized) || resp.includes(normalized);
    });
  },
};

export default historyService;
