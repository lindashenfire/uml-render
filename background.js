// UML Render - Background Service Worker
// Copyright (C) 2026  UML Render Contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'rescan') {
    // 通知所有标签页重新扫描
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { action: 'rescan' }).catch(() => {
          // 忽略无法接收消息的标签页
        });
      });
    });
    sendResponse({ success: true });
  }
  
  // 处理跨域图片获取（用于绕过 CORS 限制）
  if (message.action === 'fetchImage') {
    fetch(message.url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.blob();
      })
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ 
            success: true, 
            data: reader.result,
            type: blob.type
          });
        };
        reader.onerror = () => {
          sendResponse({ success: false, error: 'FileReader error' });
        };
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开启以支持异步响应
  }
  
  return true;
});
