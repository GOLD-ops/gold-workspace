// Only confirmed executions unlock results. A changed sentence must be parsed again.
export function workflowState({stage='input',draftReady=false,hasRun=false,intent='',interpretedText=null,stale=false}={}) {
  const canReview=draftReady&&interpretedText===intent.trim();
  const canSeeResults=hasRun;
  const visibleStage=stage==='results'&&canSeeResults?'results':stage==='conditions'&&canReview?'conditions':'input';
  return {stage:visibleStage,canReview,canSeeResults,resultsArePrevious:canSeeResults&&stale};
}
