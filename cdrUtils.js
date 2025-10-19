/**
 * CDR processing utilities
 */

function isPrimaryLeg(cdr) {
  const ctxBlock = new Set(['macro-dial', 'macro-dial-huntgroup', 'ivr-from-internal']);
  const isAnswered = cdr.disposition === 'ANSWERED' && Number(cdr.billableSeconds || cdr.billsec || 0) > 0;
  const notLocal = !(cdr.destChannel?.startsWith('Local/') || cdr.channel?.startsWith('Local/'));
  const realMedia = (cdr.channel?.startsWith('PJSIP/') || cdr.destChannel?.startsWith('PJSIP/'));
  const okContext = !ctxBlock.has(cdr.context || cdr.dcontext || '');
  const hasTalkTime = Number(cdr.billableSeconds || cdr.billsec || 0) > 0;
  
  return isAnswered && notLocal && realMedia && okContext && hasTalkTime;
}

function classifyCall(cdr) {
  const trunkCtx = new Set(['ext-did-1', 'from-trunk', 'from-pstn']);
  const outCtx = new Set(['from-internal', 'outbound-allroutes', 'from-internal-xfer']);

  if (trunkCtx.has(cdr.context) || trunkCtx.has(cdr.dcontext)) return 'Inbound';

  const dstLooksExternal = /^\+?\d{7,}$/.test(cdr.destination || cdr.dst || '');
  const chanIsTrunk = (cdr.destChannel || '').includes('PJSIP/') &&
                      /(trunk|provider|sipgate|twilio|telco)/i.test(cdr.destChannel);

  if (dstLooksExternal || chanIsTrunk || outCtx.has(cdr.dcontext)) return 'Outbound';

  return 'Internal';
}

function calculateCallTimes(cdr) {
  const talk = Number(cdr.billableSeconds || cdr.billsec || 0);
  const totalDuration = Number(cdr.duration || 0);
  const ring = Math.max(0, totalDuration - talk);
  
  return { talkTime: talk, ringTime: ring };
}

module.exports = {
  isPrimaryLeg,
  classifyCall,
  calculateCallTimes
};
