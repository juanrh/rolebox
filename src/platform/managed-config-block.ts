/**
 * Managed TOML config blocks — the shared machinery behind rolebox's
 * comment-delimited registration blocks in host `config.toml` files.
 *
 * A managed block is a start-marker comment line, block content, and an
 * end-marker comment line. Registration replaces the first block in place and
 * removes duplicates, or appends after a single newline separator; removal
 * restores the pre-existing bytes. The scanner is string-aware: markers inside
 * single- or multi-line TOML strings are content, not block delimiters.
 *
 * Extracted from the Codex plugin-bundle writer so every CLI host with a
 * `config.toml` (Codex, Vibe) shares one implementation.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** The marker pair delimiting one host's managed block. */
export interface ManagedBlockMarkers {
  /** Whole trimmed line that opens the block. */
  start: string;
  /** Whole trimmed line that closes the block. */
  end: string;
}

// TOML basic strings have a fixed short-escape set; every other control
// character (C0 plus DEL) must be written as \uXXXX or the document is invalid.
const TOML_STRING_ESCAPES: Record<string, string> = {
  "\b": "\\b",
  "\t": "\\t",
  "\n": "\\n",
  "\f": "\\f",
  "\r": "\\r",
  '"': '\\"',
  "\\": "\\\\",
};

/**
 * Escape a TOML basic-string value: the named short escapes (\b \t \n \f \r
 * \" \\) plus \uXXXX for every other control character. Paths and prompts come
 * from the user's environment, so an embedded newline or tab must not be able
 * to produce an unparseable config.toml.
 */
export function escapeTomlString(value: string): string {
  return value.replace(/["\\\u0000-\u001f\u007f]/g, (char) => {
    const escape = TOML_STRING_ESCAPES[char];
    return escape ?? `\\u${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
  });
}

/** A managed block's byte range in a config file. */
export interface ManagedRegion {
  /** First byte of the start-marker line (indentation included). */
  start: number;
  /** Exclusive end of the end-marker line; does NOT consume its newline. */
  end: number;
}

/** Delimiter that opened the multi-line TOML string the scanner is inside. */
type MultilineStringDelimiter = '"""' | "'''";

/** Index just past the single-line string starting at `start` (basic or literal). */
function skipSingleLineString(line: string, start: number): number {
  const quote = line[start];
  let index = start + 1;
  while (index < line.length) {
    if (quote === '"' && line[index] === "\\") {
      index += 2;
      continue;
    }
    if (line[index] === quote) return index + 1;
    index++;
  }
  return index;
}

/**
 * Advance the multi-line string state across one physical line. Comments and
 * single-line strings are skipped, so a triple quote in either cannot swallow
 * the rest of the file. Multi-line basic strings honour backslash escapes,
 * literal strings do not, and content after a delimiter closed on the same
 * line is scanned normally.
 */
function advanceMultilineStringState(
  line: string,
  state: MultilineStringDelimiter | null,
): MultilineStringDelimiter | null {
  let index = 0;
  while (index < line.length) {
    if (state !== null) {
      if (state === '"""' && line[index] === "\\") {
        index += 2;
        continue;
      }
      if (line.startsWith(state, index)) {
        state = null;
        index += 3;
        continue;
      }
      index++;
      continue;
    }

    const char = line[index];
    if (char === "#") return null;
    if (char === '"' || char === "'") {
      const delimiter: MultilineStringDelimiter = char === '"' ? '"""' : "'''";
      if (line.startsWith(delimiter, index)) {
        state = delimiter;
        index += 3;
        continue;
      }
      index = skipSingleLineString(line, index);
      continue;
    }
    index++;
  }
  return state;
}

/**
 * Locate every managed block in an existing config.
 *
 * A region exists only when a whole line (after trimming) IS the start marker
 * and a later whole line IS the end marker. Marker text behind a comment, or
 * inside a single- or multi-line TOML string, is string content rather than a
 * region. A start marker with no closing end marker is refused loudly:
 * appending a second block there could leave a config.toml that no longer
 * parses, so the user has to remove the stray marker by hand.
 */
export function findManagedRegions(
  configPath: string,
  content: string,
  markers: ManagedBlockMarkers,
): ManagedRegion[] {
  const regions: ManagedRegion[] = [];
  let pendingStart: number | null = null;
  let multiline: MultilineStringDelimiter | null = null;
  let lineStart = 0;

  while (lineStart <= content.length) {
    const newline = content.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? content.length : newline;
    const rawLine = content.slice(lineStart, lineEnd);
    const line = rawLine.trim();

    if (multiline === null) {
      if (line === markers.start && pendingStart === null) {
        pendingStart = lineStart;
      } else if (line === markers.end && pendingStart !== null) {
        regions.push({ start: pendingStart, end: lineEnd });
        pendingStart = null;
      }
    }
    multiline = advanceMultilineStringState(rawLine, multiline);

    if (newline === -1) break;
    lineStart = newline + 1;
  }

  if (pendingStart !== null) {
    throw new Error(
      `The config file ${configPath} contains the rolebox start marker ` +
        `${markers.start} without a matching end marker ${markers.end}. ` +
        "Remove the stray start marker by hand, then re-run the rolebox sync.",
    );
  }
  return regions;
}

/**
 * Write `block` as the config file's single managed block.
 *
 * When a block is already present it is replaced in place (so a second run
 * with the same content is byte-identical), otherwise it is appended after a
 * single newline separator (a blank line when the file already ends with one).
 * Duplicate blocks, left behind by a hand-edit, are repaired: the first is
 * replaced with the fresh block and every later one is removed. No other byte
 * of the user's file is touched. `changed` reports whether the file's bytes
 * actually changed.
 */
export function applyManagedBlock(
  configPath: string,
  block: string,
  markers: ManagedBlockMarkers,
): { changed: boolean } {
  const existing = existsSync(configPath) ? readFileSync(configPath, "utf-8") : null;

  if (existing === null) {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, `${block}\n`, "utf-8");
    return { changed: true };
  }

  const regions = findManagedRegions(configPath, existing, markers);
  let next: string;
  if (regions.length > 0) {
    next = existing.slice(0, regions[0].start) + block;
    let after = regions[0].end;
    for (const region of regions.slice(1)) {
      next += existing.slice(after, region.start);
      after = region.end + (existing[region.end] === "\n" ? 1 : 0);
    }
    next += existing.slice(after);
  } else {
    // Exactly one leading newline: it terminates a non-empty file that lacks a
    // trailing one, and forms the blank line before the block otherwise. It is
    // also the single separator removal restores, so the pre-existing bytes
    // come back either way.
    const separator = existing.length === 0 ? "" : "\n";
    next = `${existing}${separator}${block}\n`;
  }

  if (next === existing) return { changed: false };
  writeFileSync(configPath, next, "utf-8");
  return { changed: true };
}

/**
 * Remove every managed block from a config file.
 *
 * Exactly the blocks and the single newline separator registration introduced
 * are removed, so a pre-existing file is restored byte for byte whether or not
 * it ended with a trailing newline. Duplicate blocks are all rolebox's own, so
 * all of them go. A file without a managed block (or a missing file) is a no-op;
 * a lone start marker is refused exactly as in registration, because an
 * unclosed block has no reliable extent to remove.
 */
export function removeManagedBlock(
  configPath: string,
  markers: ManagedBlockMarkers,
): { changed: boolean } {
  if (!existsSync(configPath)) return { changed: false };
  const existing = readFileSync(configPath, "utf-8");
  const regions = findManagedRegions(configPath, existing, markers);
  if (regions.length === 0) return { changed: false };

  // Remove from the end so the earlier regions' offsets stay valid.
  let next = existing;
  for (let i = regions.length - 1; i >= 0; i--) {
    let start = regions[i].start;
    let end = regions[i].end;
    if (next[end] === "\n") end++;
    // Drop the single separator newline the append introduced before the first
    // block, but never the LF half of a CRLF the block did not introduce: that
    // would leave a lone \r behind.
    if (
      i === 0 &&
      start > 0 &&
      next[start - 1] === "\n" &&
      (start === 1 || next[start - 2] !== "\r")
    ) {
      start -= 1;
    }

    next = next.slice(0, start) + next.slice(end);
  }

  if (next === existing) return { changed: false };
  writeFileSync(configPath, next, "utf-8");
  return { changed: true };
}
