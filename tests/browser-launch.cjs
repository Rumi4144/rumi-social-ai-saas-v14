const fs = require('node:fs');

// CI uses Playwright's installed Chromium. Local runs may reuse installed Chrome.
module.exports = function browserLaunchOptions() {
  const requested = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return {
    headless: true,
    ...(requested ? {executablePath: requested}
      : !process.env.CI && fs.existsSync(localChrome) ? {executablePath: localChrome} : {}),
  };
};
