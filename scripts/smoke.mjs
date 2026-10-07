// Smoke test: opens the home page and every game route in headless Chromium,
// fails on uncaught errors or console errors. Usage: node scripts/smoke.mjs [baseUrl] [--shots dir]
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:4173/'
const shotIdx = process.argv.indexOf('--shots')
const shotDir = shotIdx > 0 ? process.argv[shotIdx + 1] : null
const only = process.env.ONLY?.split(',')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))

await page.goto(base)
await page.waitForSelector('.game-card')
const ids = await page.$$eval('.game-card', () => [])
const games = await page.evaluate(async () => {
  const cards = [...document.querySelectorAll('.game-card .game-name')].map((e) => e.textContent)
  return cards
})
console.log(`home: ${games.length} games`)
if (shotDir) await page.screenshot({ path: `${shotDir}/home.png`, fullPage: true })

// Collect ids by clicking each card
const routes = []
for (let i = 0; i < games.length; i++) {
  await page.goto(base)
  await page.waitForSelector('.game-card')
  await page.locator('.game-card').nth(i).click()
  await page.waitForSelector('.game-main')
  routes.push(new URL(page.url()).hash)
}
void ids

let failed = 0
for (const route of routes) {
  const id = route.split('/').pop()
  if (only && !only.includes(id)) continue
  errors.length = 0
  await page.goto(base + route)
  await page.waitForSelector('.game-main > *:not(.loading)', { timeout: 10000 })
  // Click the first primary button (usually "start") to exercise the game screen.
  const start = page.locator('.game-main .btn.primary').first()
  if (await start.count()) await start.click().catch(() => {})
  await page.waitForTimeout(800)
  if (shotDir) await page.screenshot({ path: `${shotDir}/${id}.png`, fullPage: true })
  if (errors.length) {
    failed++
    console.log(`✗ ${id}\n  ${errors.join('\n  ')}`)
  } else console.log(`✓ ${id}`)
}
await browser.close()
process.exit(failed ? 1 : 0)
