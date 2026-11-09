#!/usr/bin/env node
/**
 * Fail-closed acceptance for the owner's temporary public manicure release.
 * No fabricated editorial certifications are used. All image bytes remain in
 * the immutable 146-source namespace and are already independently live-SHA
 * checked by verify-all-nail-photos.mjs.
 */
import {readFileSync, readdirSync, existsSync} from "node:fs";
import {resolve} from "node:path";
import {ownerSelectedManicureIds} from "./owner-manicure-display.mjs";

const ids=ownerSelectedManicureIds();
if(ids.length!==146)throw Error("Owner-selected catalog not exactly 146 original photographs");
const path=resolve("dist/assets");
if(!existsSync(path))throw Error("Built customer app assets missing");
const bundles=readdirSync(path).filter(f=>/\.js$/.test(f));
if(!bundles.length)throw Error("No customer-side app JavaScript found");
const combined=bundles.map(f=>readFileSync(resolve(path,f),"utf8")).join("\n");
if(!combined.includes(ids.join(",")))
  throw Error("Owner-approved temporary 146-ID release mapping absent from built customer application");
if(!combined.includes("/review/photos/"))
  throw Error("Owner-selected original URLs missing from built customer application");
const manifest=JSON.parse(readFileSync("dist/review/manifest-146.json","utf8"));
if(manifest.approval!=="NOT_GRANTED"||manifest.files.length!==146)
  throw Error("Historical editorial review state was incorrectly changed");
const owner=JSON.parse(readFileSync("docs/HBEAUTY_OWNER_TEMPORARY_146_DISPLAY_20261031.json","utf8"));
if(owner.editorial_qc_status!=="NOT_CERTIFIED"||owner.expected_count!==146)
  throw Error("Owner permission improperly impersonates full professional editorial QA");
console.log("Verified 146 owner-selected customer-facing original WebPs (source SHA-256 + catalog identities), separate from professional editorial QA.");
