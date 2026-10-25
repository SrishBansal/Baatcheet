// Usage: node smoke.mjs [baseUrl=http://localhost:5173] [optionalJobUrl]
// Calls the REAL running server (and real Gemini if a key is set). Exit code 1 if any check fails.
const base = process.argv[2] || 'http://localhost:5173';
const jobUrl = process.argv[3];
let fails = 0;
const post = async (p, b) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const line = (id, ok, detail) => { if (ok === false) fails++; console.log(`${ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL'} ${id}: ${detail}`); };
const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const job = { title: 'Frontend Engineer', company: 'Acme', summary: 'Build and maintain customer-facing React web apps.', responsibilities: ['Build React features', 'Improve web performance'],
  requirements: [{ name: 'React', kind: 'required' }, { name: 'Web performance', kind: 'required' }, { name: 'Testing', kind: 'preferred' }] };
const vague = 'I improved the performance of our app.';
const detailed = 'Our dashboard took about six seconds to load because it rendered a table with three thousand rows. I profiled it with Chrome DevTools, added list virtualization with react-window, and moved the chart code behind lazy loading. I also added a performance budget to our CI pipeline. Load time dropped from six seconds to under two seconds, and support tickets about slowness fell by about forty percent over the next quarter.';
const T = (...x) => x.map(([role, text, action]) => ({ role, text, action }));

try {
  const h = await (await fetch(base + '/api/health')).json();
  line('a health', h.geminiConfigured === true, JSON.stringify(h));
  if (!h.geminiConfigured) { console.log('Gemini key not visible to the server. Stop here and fix .env.local.'); process.exit(1); }

  let r = await post('/api/turn', { job, transcript: [] });
  line('b intro', r.body.action === 'INTRO' && /frontend|react|role/i.test(r.body.say || ''), `${r.status} ${r.body.action || r.body.error} | ${r.body.say}`);
  const intro = r.body.say || 'Welcome.';

  r = await post('/api/turn', { job, transcript: T(['interviewer', intro, 'INTRO'], ['candidate', vague]) });
  line('c follow-up on vague answer', r.body.action === 'FOLLOW_UP' && (r.body.say.match(/\?/g) || []).length === 1, `${r.status} ${r.body.action || r.body.error} | QUESTION GENERATED: ${r.body.say}`);

  r = await post('/api/turn', { job, transcript: T(['interviewer', intro, 'INTRO'], ['candidate', detailed]) });
  line('d advance on detailed answer', r.body.action === 'NEXT_QUESTION' || r.body.action === 'WRAP_UP', `${r.status} ${r.body.action || r.body.error} | ${r.body.say}`);

  const planned = { ...job, questions: [{ text: 'Tell me about a React project you are proud of.', requirementName: 'React' }] };
  r = await post('/api/turn', { job: planned, transcript: T(['interviewer', intro, 'INTRO'], ['candidate', vague], ['interviewer', 'What was slow?', 'FOLLOW_UP'], ['candidate', 'The page.'], ['interviewer', 'How did you measure it?', 'FOLLOW_UP'], ['candidate', 'Not sure.']) });
  line('e limits force WRAP_UP', r.body.action === 'WRAP_UP', `${r.status} ${r.body.action || r.body.error}`);

  const tr = T(['interviewer', intro, 'INTRO'], ['candidate', detailed], ['interviewer', 'Thanks. How do you decide what to test?', 'NEXT_QUESTION'], ['candidate', 'I mostly test the critical user flows, like checkout, with end to end tests, and unit test the pure logic.']);
  r = await post('/api/report', { job, transcript: tr });
  const corpus = tr.filter((x) => x.role === 'candidate').map((x) => norm(x.text));
  const quotes = (r.body.requirements || []).flatMap((q) => q.evidence);
  line('f report quotes verified', r.status === 200 && quotes.length > 0 && quotes.every((q) => corpus.some((c) => c.includes(norm(q)))), `${r.status} statuses=${(r.body.requirements || []).map((q) => q.name + ':' + q.status).join(', ') || r.body.error}`);
  r = await post('/api/report', { job: { ...job, requirements: [...job.requirements, { name: 'Kubernetes', kind: 'preferred' }] }, transcript: tr });
  const k = (r.body.requirements || []).find((q) => q.name === 'Kubernetes');
  line('g uncovered requirement is Not assessed', !!k && k.status === 'Not assessed', k ? k.status : r.body.error);

  const jd = 'Senior Frontend Engineer at Northwind. You will build customer-facing React applications, improve web performance, and mentor junior engineers. Requirements: 4+ years of React and TypeScript, experience measuring and improving web performance, strong testing habits with Jest and Cypress. Nice to have: experience with accessibility and design systems. Responsibilities: ship features end to end, review code, collaborate with designers and product managers.';
  r = await post('/api/job', { text: jd });
  line('h paste import', r.status === 200 && r.body.job && r.body.job.requirements.length > 0, `${r.status} title="${r.body.job && r.body.job.title}" reqs=${r.body.job && r.body.job.requirements.map((x) => x.name).join('|')} discarded=${r.body.discarded}`);

  r = await post('/api/questions', { job: { ...job }, existing: [], count: 5 });
  const n = (r.body.questions || []).length;
  line('i suggested questions', r.status === 200 && n >= 3 && n <= 5, `${r.status} n=${n} ${(r.body.questions || []).map((q) => q.requirementName).join('|') || r.body.error}`);

  for (const u of ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://169.254.169.254/latest/meta-data', 'http://[::1]:5173']) {
    r = await post('/api/job', { url: u });
    line('j ssrf blocked ' + u, r.status === 422 && r.body.error === 'blocked_address', `${r.status} ${r.body.error}`);
  }

  const lines = ['Frontend Engineer at Northwind', 'We need React and TypeScript experience,', 'web performance optimization skills,', 'and strong testing habits with Jest and Cypress.', 'You will build customer-facing web apps and mentor junior engineers.', 'Responsibilities include shipping features, code review, and working with designers.'];
  const stream = 'BT /F1 11 Tf 40 760 Td 14 TL ' + lines.map((l) => `(${l}) Tj T*`).join(' ') + ' ET';
  const objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>', `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`, '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'];
  let pdf = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xr = pdf.length; pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xr}\n%%EOF`;
  r = await post('/api/job', { pdfBase64: Buffer.from(pdf, 'latin1').toString('base64') });
  line('k pdf import', r.status === 200 && r.body.job && r.body.job.requirements.length > 0, `${r.status} source=${r.body.source && r.body.source.label} reqs=${r.body.job ? r.body.job.requirements.map((x) => x.name).join('|') : r.body.error}`);

  if (jobUrl) { r = await post('/api/job', { url: jobUrl }); line('l real url', null, `${r.status} ${r.body.error || 'title="' + r.body.job.title + '" source=' + r.body.source.label + ' reqs=' + r.body.job.requirements.length + ' (outcome only, blocked is acceptable)'}`); }
  else line('l real url', null, 'SKIPPED (no URL argument)');
} catch (e) { console.log('FAIL smoke crashed: ' + e.message); fails++; }
console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
