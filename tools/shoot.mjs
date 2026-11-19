import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';

const outDir = path.resolve('out');
const inputFile = '../token-radar-01-kit/input/snapshot.json';
execFileSync(process.execPath, ['main.ts', '--input', inputFile], {
  cwd: process.cwd(),
  env: { ...process.env, MAKEFUN_OUTPUT_DIR: outDir },
  stdio: 'inherit',
});
const screenshotsDir = path.resolve('screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const relative = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
  const filePath = path.resolve(outDir, relative || 'dashboard/index.html');
  if (!filePath.startsWith(outDir + path.sep)) { res.statusCode = 403; return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    res.end(data);
  });
});

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const url = `http://127.0.0.1:${server.address().port}/dashboard/index.html`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(screenshotsDir, '1-board.png'), fullPage: false });

    const firstRow = page.locator('tbody tr').first();
    await firstRow.click();
    await page.locator('#detail-panel:not([hidden])').waitFor();
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.locator('#detail-panel').evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.waitForTimeout(300);
    if (!(await page.locator('#detail-panel').innerText()).includes('FARM PLAN')) throw new Error('Detail panel did not render');
    await page.screenshot({ path: path.join(screenshotsDir, '2-detail.png'), fullPage: false });
    await page.evaluate(() => window.backToBoard());

    // Change the ordering to produce a distinct, filtered presentation.
    const category = page.locator('#category');
    const categoryOptions = await category.locator('option').evaluateAll(options => options.map(option => ({ value: option.value, text: option.textContent })));
    const categoryOption = categoryOptions.find(option => option.value);
    if (categoryOption) await category.selectOption(categoryOption.value);
    else await page.locator('#sort').selectOption('conviction');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '3-filtered.png'), fullPage: false });
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
