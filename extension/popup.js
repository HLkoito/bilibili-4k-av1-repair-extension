'use strict';
document.getElementById('open-room').addEventListener('submit', async event => {
  event.preventDefault();
  const error = document.getElementById('error');
  error.hidden = true;
  try {
    let value = document.getElementById('url').value.trim();
    if (/^live\.bilibili\.com\//i.test(value)) value = 'https://' + value;
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== 'live.bilibili.com' || url.port || url.username || url.password || !/^\/(?:blanc\/)?\d+\/?$/.test(url.pathname)) {
      throw new Error('Enter a valid Bilibili Live room URL.');
    }
    url.protocol = 'https:';
    url.hash = '';
    await chrome.tabs.create({ url: url.href });
    window.close();
  } catch (cause) {
    error.textContent = cause instanceof TypeError ? 'Enter a valid Bilibili Live room URL.' : cause.message;
    error.hidden = false;
  }
});
