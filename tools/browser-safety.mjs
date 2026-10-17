// Headless Chrome can confine the real Windows pointer. All local QA uses this launcher.
import { chromium as nativeChromium, webkit as nativeWebkit } from 'playwright-core';

export function blockNativePointerLock() {
  Element.prototype.requestPointerLock = function () {
    document.dispatchEvent(new Event('pointerlockerror'));
    return Promise.reject(new DOMException('Native pointer capture is disabled in Windows QA. Run capture acceptance on an isolated Linux runner.', 'NotAllowedError'));
  };
}

export function desktopSafeChromium(browserType, platform = process.platform) {
  return {
    async launch(options) {
      const browser = await browserType.launch(options);
      if (platform !== 'win32') return browser;
      const guarded = new WeakSet();
      const protect = async (context) => {
        if (guarded.has(context)) return;
        try {
          await context.addInitScript(blockNativePointerLock);
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
// WebKit (the iPhone Safari check) gets the same guard.
export const webkit = desktopSafeChromium(nativeWebkit);
