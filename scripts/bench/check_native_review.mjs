/** Tokenless, fail-closed preflight for Cloudflare's native Git integration.
 * This validates an exact public PR head. It does NOT create or deploy assets.
 * Cloudflare must be configured to use the isolated review Worker.
 */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {evaluateRequiredChecks, REQUIRED_CHECKS} from './check_review_checks.mjs';

export const REVIEW_REPO='jjh167910-cloud/H-beauty-makeup';
export const REVIEW_BRANCH='quality/integrated-review-20261126';
export const NATIVE_CHECKS=[...REQUIRED_CHECKS,'Review-only makeup preview (never production)'];

export function verifyNativeContext({branch,sha,checkout,config}) {
  if(branch!==REVIEW_BRANCH)throw Error('Native research build requires the dedicated review branch');
  if(!/^[a-f0-9]{40}$/.test(sha||'')||sha!==checkout)throw Error('Cloudflare commit SHA does not match checkout');
  if(config?.name!=='h-beauty-makeup-review'||config?.main!=='worker/preview.ts'||
      config?.assets?.directory!=='./dist'||config?.assets?.binding!=='ASSETS')
    throw Error('Review Worker configuration is not isolated');
  const allowed=new Set(['name','compatibility_date','main','assets']);
  if(Object.keys(config).some(k=>!allowed.has(k)))throw Error('Unexpected review Worker configuration or binding');
}
export async function checkNativeReview(sha,fetcher=fetch) {
  if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('Invalid exact review SHA');
  const url='https://api.github.com/repos/'+REVIEW_REPO+'/actions/runs?head_sha='+sha+'&event=pull_request&per_page=100';
  const response=await fetcher(url,{headers:{accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Cannot verify public GitHub checks: HTTP '+response.status);
  const body=await response.json();
  const state=evaluateRequiredChecks(body.workflow_runs,sha,NATIVE_CHECKS);
  if(!state.passed)throw Error('Native staging blocked: '+JSON.stringify(state));
  return state;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const sha=process.env.WORKERS_CI_COMMIT_SHA,branch=process.env.WORKERS_CI_BRANCH;
    const checkout=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    const config=JSON.parse(readFileSync('wrangler.preview.jsonc','utf8'));
    verifyNativeContext({branch,sha,checkout,config});
    console.log('NATIVE_REVIEW_GATE '+JSON.stringify(await checkNativeReview(sha)));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
