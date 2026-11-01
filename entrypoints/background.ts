import {
  handleBackgroundMessage,
  isBackgroundMessage,
  registerDailyUpdateAlarm,
} from '../src/core/remote-lists';

export default defineBackground(() => {
  void registerDailyUpdateAlarm();

  if (typeof browser !== 'undefined' && browser.runtime?.onMessage) {
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (!isBackgroundMessage(message)) return undefined;
      return handleBackgroundMessage(message);
    });
  }
});
