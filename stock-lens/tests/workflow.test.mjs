import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowState} from '../public/workflow.js';

test('首次打开只能输入，不展示未确认条件或结果',()=>{
  for(const stage of ['input','conditions','results'])assert.deepEqual(workflowState({stage}),{stage:'input',canReview:false,canSeeResults:false,resultsArePrevious:false});
});
test('整理条件后可检查，尚未执行不能进入结果',()=>{
  const draft={draftReady:true,intent:'收入增长',interpretedText:'收入增长'};
  assert.equal(workflowState({...draft,stage:'conditions'}).stage,'conditions');
  assert.equal(workflowState({...draft,stage:'results'}).stage,'input');
  assert.equal(workflowState({...draft,stage:'input'}).canReview,true);
});
test('修改原句必须重新整理，仍可查看明确标记的旧结果',()=>{
  const modified={draftReady:true,hasRun:true,intent:'收入增长至少10%',interpretedText:'收入增长',stale:true};
  assert.equal(workflowState({...modified,stage:'conditions'}).stage,'input');
  assert.deepEqual(workflowState({...modified,stage:'results'}),{stage:'results',canReview:false,canSeeResults:true,resultsArePrevious:true});
});
test('修改阈值可返回确认，重新执行后解除旧结果标记',()=>{
  const changed={draftReady:true,hasRun:true,intent:' 收入增长 ',interpretedText:'收入增长',stale:true};
  assert.equal(workflowState({...changed,stage:'conditions'}).stage,'conditions');
  assert.equal(workflowState({...changed,stage:'results'}).resultsArePrevious,true);
  assert.equal(workflowState({...changed,stage:'results',stale:false}).resultsArePrevious,false);
});
