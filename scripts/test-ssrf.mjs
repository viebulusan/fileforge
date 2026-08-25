// Unit tests for the SSRF guard — every private/reserved shape must be blocked.
import { assertPublicUrl } from '../api/_lib/ssrf.js'

const cases = [
  // [url, shouldPass]
  ['http://127.0.0.1/video.mp4', false],
  ['http://localhost/video.mp4', false],
  ['http://LOCALHOST:8080/x.mp4', false],
  ['http://169.254.169.254/latest/meta-data/x.mp4', false],
  ['http://100.100.100.100/a.mp4', false],
  ['http://10.0.0.5/f.mp4', false],
  ['http://172.16.0.9/f.mp4', false],
  ['http://192.168.1.1/f.mp4', false],
  ['http://198.18.0.1/f.mp4', false],
  ['http://224.0.0.1/f.mp4', false],
  ['http://0.0.0.0/f.mp4', false],
  ['http://[::1]/f.mp4', false],
  ['http://[fe80::1]/f.mp4', false],
  ['http://[fd00::1]/f.mp4', false],
  ['http://[::ffff:127.0.0.1]/f.mp4', false],
  ['file:///etc/passwd', false],
  ['ftp://example.com/f.mp4', false],
  ['javascript:alert(1)', false],
  ['http://metadata.google.internal/computeMetadata/v1/x.mp4', false],
  ['http://db.internal/f.mp4', false],
  ['http://myhost.lan/f.mp4', false],
  ['https://example.com/video.mp4', true],
  ['https://example.com:8443/a/b/c.m4a', true],
  ['http://archive.org/download/x/y.ogg', true],
]

let pass = 0
let fail = 0
for (const [url, shouldPass] of cases) {
  let outcome = 'pass'
  try {
    await assertPublicUrl(url)
    outcome = 'allowed'
  } catch {
    outcome = 'blocked'
  }
  const ok = (outcome === 'allowed') === shouldPass
  if (ok) pass += 1
  else fail += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${shouldPass ? 'allow' : 'block'}  ${url}  → ${outcome}`)
}
console.log(`\n${pass}/${cases.length} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
