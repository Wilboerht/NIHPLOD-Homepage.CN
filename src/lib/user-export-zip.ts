import { ZipArchive } from "archiver";
import { PassThrough, Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { CSV_BOM, CSV_EOL, csvLine, type UserExportEntry } from "@/lib/user-export";

export interface UserExportArchive {
  output: PassThrough;
  append: (entry: UserExportEntry) => Promise<number>;
  finalize: () => Promise<void>;
}

async function* entryLines(entry: UserExportEntry): AsyncGenerator<string> {
  if (entry.kind === "jsonl") {
    for await (const line of entry.lines) yield line.endsWith("\n") ? line : `${line}\n`;
    return;
  }
  yield CSV_BOM + csvLine(entry.headers) + CSV_EOL;
  for await (const row of entry.rows) {
    yield csvLine(row) + CSV_EOL;
  }
}

export function createUserExportArchive(): UserExportArchive {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const output = new PassThrough();
  let archiveFailure: Error | null = null;
  let rejectArchiveFailure: ((error: Error) => void) | null = null;
  const archiveFailurePromise = new Promise<never>((_, reject) => {
    rejectArchiveFailure = reject;
  });
  archiveFailurePromise.catch(() => undefined);

  archive.on("error", (error: Error) => {
    archiveFailure = error;
    output.destroy(error);
    rejectArchiveFailure?.(error);
  });
  archive.pipe(output);
  output.on("error", () => undefined);

  async function append(entry: UserExportEntry): Promise<number> {
    if (archiveFailure) throw archiveFailure;
    let count = 0;
    const lines = (async function* () {
      let first = true;
      for await (const line of entryLines(entry)) {
        if (entry.kind === "csv") {
          if (first) {
            first = false;
            yield line;
            continue;
          }
          count += 1;
        } else {
          count += 1;
        }
        yield line;
      }
    })();
    const stream = Readable.from(lines);
    archive.append(stream, { name: entry.name });
    await Promise.race([finished(stream), archiveFailurePromise]);
    if (archiveFailure) throw archiveFailure;
    return count;
  }

  return {
    output,
    append,
    finalize: async () => {
      await archive.finalize();
    },
  };
}
