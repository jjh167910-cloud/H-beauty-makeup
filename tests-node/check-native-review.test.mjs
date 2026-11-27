import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyNativeContext,checkNativeReview,NATIVE_CHECKS,REVIEW_BRANCH} from '../scripts/bench/check_native_review.mjs';

const sha='a'.repeat(40);
const context={branch:REVIEW_BRANCH,sha,checkout:sha,config:{name:'h-beauty-makeup-review',main:'worker/preview.ts',compatibility_date:'2026-10-21',assets:{directory:'./dist',binding:'ASSETS'}}};
const runs=NATIVE_CHECKS.map((name,i)=>({name,head_sha:sha,event:'pull_request',status:'completed',conclusion:'success',id:i+1}));
const response=(workflow_runs)=>async(url,options)=>{
  assert.equal(new URL(url).searchParams.get('head_sha'),sha);
  assert.equal(options.headers.authorization,undefined);
  return {ok:true,json:async()=>({workflow_runs})};
};
test('only isolated review branch and exact checkout are accepted',()=>{
  assert.doesNotThrow(()=>verifyNativeContext(context));
  assert.throws(()=>verifyNativeContext({...context,branch:'main'}));
  assert.throws(()=>verifyNativeContext({...context,checkout:'b'.repeat(40)}));
  assert.throws(()=>verifyNativeContext({...context,config:{...context.config,name:'h-beauty-makeup'}}));
  assert.throws(()=>verifyNativeContext({...context,config:{...context.config,durable_objects:{}}}));
});
test('public exact-head checks authorize native review without a token',async()=>{
  assert.equal((await checkNativeReview(sha,response(runs))).passed,true);
});
test('missing, pending, rejected, stale, or newer failed checks block native review',async()=>{
  for(const bad of [runs.slice(1),runs.map((r,i)=>i?r:{...r,status:'in_progress'}),runs.map((r,i)=>i?r:{...r,conclusion:'failure'}),runs.map(r=>({...r,head_sha:'b'.repeat(40)})),[...runs,{...runs[0],id:100,conclusion:'failure'}]]){
    await assert.rejects(checkNativeReview(sha,response(bad)),/blocked/);
  }
  await assert.rejects(checkNativeReview(sha,async()=>({ok:false,status:403})),/HTTP 403/);
});
