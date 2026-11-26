export async function runMaintenanceTransition({
  gate,preflight,waitForCoverage,stopPrevious,select,start,verify,stopCandidate,reopenPrevious,
}) {
  await preflight();
  const {epoch}=gate.begin();
  try {
    const coverage=await waitForCoverage(epoch);
    gate.seal(coverage);
  } catch(error) {
    gate.reopen();
    throw error;
  }

  let stoppingPrevious=true;
  let candidateMayBeRunning=false;
  let candidate;
  try {
    await stopPrevious();
    stoppingPrevious=false;
    await select('candidate');
    candidateMayBeRunning=true;
    candidate=await start('candidate',{initiallyClosed:true});
    await verify(candidate);
  } catch(error) {
    if(stoppingPrevious)throw error;
    if(candidateMayBeRunning)await stopCandidate();
    await select('previous');
    await reopenPrevious();
    return {active:'previous',rolledBack:true};
  }
  // An ambiguous reopen must not trigger a rollback after writes may have resumed.
  await candidate.reopen();
  return {active:'candidate',rolledBack:false};
}
