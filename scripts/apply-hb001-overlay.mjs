import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installHb001Overlay } from "./install-hb001-overlay.mjs";
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {console.log(installHb001Overlay()?"HB-001 overlay verified and installed":"HB-001 overlay not configured");}
  catch(error){console.error(error);process.exitCode=1;}
}
