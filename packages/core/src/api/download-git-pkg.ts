import * as tar from "tar-stream";
import { codeloadUrl } from "./codeload-url";
import { extractSubFolderOfEntries } from "../tar/extract-sub-folder";
import { addCustomScriptsToEntries } from "../tar/custom-scripts";
import { prependPathOfEntries } from "../tar/prepend-path";
import type { CommitIshInfo, PkgOptions } from "../parse-url-query";
import {
  HybridEntries,
  HybridEntry,
  hybridEntriesFromEntries,
} from "../tar/entry";
import { pack } from "../tar/pack";
import {
  DecompressionStream,
  CompressionStream,
} from "@gitpkg/edge-polyfill/compression-streams";
import { readableToWeb, writableToWeb } from "@gitpkg/edge-polyfill/web-stream";

export type PipelineItem =
  | NodeJS.ReadableStream
  | NodeJS.WritableStream
  | NodeJS.ReadWriteStream;

type GenFn = (entries: HybridEntries) => AsyncGenerator<HybridEntry>;

function pipelineToPkgTarEntries(pkgOpts: PkgOptions): GenFn[] {
  const { customScripts: cs, commitIshInfo: cii } = pkgOpts;

  return (
    [
      (entries: HybridEntries) =>
        extractSubFolderOfEntries(entries, cii.subdir),
      cs && cs.length > 0
        ? (entries: HybridEntries) => addCustomScriptsToEntries(entries, cs)
        : undefined,
      (entries: HybridEntries) => prependPathOfEntries(entries, "package/"),
    ] satisfies (GenFn | undefined)[]
  ).filter(Boolean as unknown as <T>(v: T) => v is Exclude<T, undefined>);
}

export function getTgzUrl(cii: CommitIshInfo): string {
  return codeloadUrl(`${cii.user}/${cii.repo}`, cii.commit);
}

export function downloadGitPkg(
  pkgOpts: PkgOptions,
  readable: ReadableStream,
  writable: WritableStream,
): Promise<unknown> {
  const extract = tar.extract();

  let gen: AsyncGenerator<HybridEntry> = hybridEntriesFromEntries(extract);
  for (const genFn of pipelineToPkgTarEntries(pkgOpts)) {
    gen = genFn(gen);
  }

  const pipe = readable
    .pipeThrough(new DecompressionStream("gzip"))
    .pipeTo(writableToWeb(extract) satisfies WritableStream);
  const [p, packPromise] = pack(gen);

  const pipeOut = (readableToWeb(p) satisfies ReadableStream)
    .pipeThrough(new CompressionStream("gzip"))
    .pipeTo(writable);
  return Promise.all([pipe, packPromise, pipeOut]);
}
