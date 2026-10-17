// Headless Chrome can confine the real Windows pointer. All local QA uses this launcher.
import { chromium as nativeChromium } from 'playwright-core';

export const startupTimeout = (local = 60000) => process.env.GITHUB_ACTIONS === 'true' ? 120000 : local;

export function blockNativePointerLock() {
  Element.prototype.requestPointerLock = function () {
    document.dispatchEvent(new Event('pointerlockerror'));
    return Promise.reject(new DOMException('Native pointer capture is disabled in Windows QA. Run capture acceptance on an isolated Linux runner.', 'NotAllowedError'));
  };
}

export function desktopSafeChromium(browserType, platform = process.platform, ci = process.env.GITHUB_ACTIONS === 'true') {
  return {
    async launch(options) {
      if (ci) {
        options = { ...options, args: [...new Set([...(options?.args || []), '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'])] };
      }
      if (process.env.HELICOPTEA_SOFTWARE_GL === '1') {
        options = { ...options, args: [...(options?.args || []).filter(arg => !arg.startsWith('--use-angle=')), '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
      }
      const browser = await browserType.launch(options);
      if (platform !== 'win32' && !ci) return browser;
      const guarded = new WeakSet();
      const protect = async (context) => {
        if (guarded.has(context)) return;
        try {
          if (platform === 'win32') await context.addInitScript(blockNativePointerLock);
          // Hosted software renderers take longer to construct the neighbourhood. Keep explicit
          // behavioural deadlines intact; only Playwright's implicit 30 s action/navigation limit grows.
          if (ci) {
            context.setDefaultTimeout(120000);
            context.setDefaultNavigationTimeout(120000);
            const diagnose = (page) => {
              page.on('pageerror', error => console.error(`[browser pageerror] ${page.url()}: ${error.message}`));
              page.on('crash', () => console.error(`[browser crash] ${page.url()}`));
              page.on('console', message => { if (message.type() === 'error') console.error(`[browser console] ${page.url()}: ${message.text()}`); });
            };
            context.on?.('page', diagnose);
            for (const page of context.pages?.() || []) diagnose(page);
          }
          guarded.add(context);
        } catch (error) {
          await context.close();
          throw error;
        }
      };
      const newContext = browser.newContext.bind(browser);
      const newPage = browser.newPage.bind(browser);
      browser.newContext = async (...args) => {
        const context = await newContext(...args);
        await protect(context);
        return context;
      };
      browser.newPage = async (...args) => {
        const page = await newPage(...args);
        await protect(page.context());
        return page;
      };
      return browser;
    },
  };
}

export const chromium = desktopSafeChromium(nativeChromium);
