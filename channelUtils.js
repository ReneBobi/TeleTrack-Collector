/**
 * Channel normalization utilities
 */

function normalizeChannel(raw) {
  if (!raw) return '';
  
  // Drop SIP params and per-call suffixes
  let s = raw.split(';')[0]; // remove ;transport etc.
  s = s.replace(/-[0-9a-f]+$/i, ''); // strip -000024a5
  s = s.replace(/^PJSIP\//, ''); // PJSIP/141 -> 141
  s = s.replace(/^SIP\//, ''); // SIP/141 -> 141
  s = s.replace(/^Local\//, ''); // Local/xyz -> xyz
  
  return s;
}

module.exports = {
  normalizeChannel
};
