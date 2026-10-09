import {afterEach,describe,it,expect,vi} from "vitest";
import {readFile} from "node:fs/promises";
import {parseDocument,download,disposeDownloadUrls,exportDraft} from "../src/pdf";
import type {DocumentRef} from "../src/domain";
afterEach(()=>{disposeDownloadUrls();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
describe("document lifecycle",()=>{
 it("aborts an import before reading file bytes",async()=>{
  const read=vi.fn();const c=new AbortController();c.abort();
  await expect(parseDocument({size:1,arrayBuffer:read} as unknown as File,"target",undefined,c.signal)).rejects.toMatchObject({name:"AbortError"});
  expect(read).not.toHaveBeenCalled();
 });
 it("revokes pending downloads immediately at a clear boundary",()=>{
  vi.useFakeTimers();const revoke=vi.spyOn(URL,"revokeObjectURL");
  vi.spyOn(URL,"createObjectURL").mockReturnValue("blob:test");
  vi.stubGlobal("document",{createElement:()=>({click:vi.fn()})});
  download("personal answer","draft.json","application/json");
  disposeDownloadUrls();expect(revoke).toHaveBeenCalledWith("blob:test");
  expect(vi.getTimerCount()).toBe(0);
 });
 it("recovers when a local export font initially fails to load",async()=>{
  const target:DocumentRef={id:"form",name:"plain.pdf",hash:"a".repeat(64),bytes:new Uint8Array(),role:"target",pages:1,support:"plain"};
  const font=await readFile(new URL("../public/fonts/PlusJakartaSans-Regular.ttf",import.meta.url));
  const fetch=vi.spyOn(globalThis,"fetch").mockRejectedValueOnce(new Error("Temporarily unavailable")).mockResolvedValueOnce(new Response(font));
  await expect(exportDraft(target,[])).rejects.toThrow("Temporarily unavailable");
  expect((await exportDraft(target,[])).length).toBeGreaterThan(100);
  expect(fetch).toHaveBeenCalledTimes(2);
 });
});
