// popup.js - UML Render 设置页面
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

document.addEventListener('DOMContentLoaded', async () => {
  const renderEnabledCheckbox = document.getElementById('renderEnabled');
  const debugModeCheckbox = document.getElementById('debugMode');
  const serverPresetSelect = document.getElementById('serverPreset');
  const serverUrlInput = document.getElementById('serverUrl');
  const customServerContainer = document.getElementById('customServerContainer');
  const outputFormatSelect = document.getElementById('outputFormat');
  const plantUmlThemeSelect = document.getElementById('plantUmlTheme');
  const rescanBtn = document.getElementById('rescanBtn');
  const statusEl = document.getElementById('status');
  
  // 预设服务器列表
  const serverPresets = {
    'https://www.plantuml.com/plantuml': '官方服务器（推荐）',
    'https://kroki.io': 'Kroki.io（备用）',
    'http://www.plantuml.com/plantuml': '官方HTTP（备用）'
  };
  
  // 读取当前设置
  const result = await chrome.storage.sync.get(['renderEnabled', 'debugMode', 'serverUrl', 'outputFormat', 'plantUmlTheme']);
  renderEnabledCheckbox.checked = result.renderEnabled !== false;
  debugModeCheckbox.checked = result.debugMode || false;
  outputFormatSelect.value = result.outputFormat || 'png';
  plantUmlThemeSelect.value = result.plantUmlTheme || 'default';
  
  // 设置服务器地址
  const currentServerUrl = result.serverUrl || 'https://www.plantuml.com/plantuml';
  serverUrlInput.value = currentServerUrl;
  
  if (serverPresets[currentServerUrl]) {
    // 是预设服务器
    serverPresetSelect.value = currentServerUrl;
    customServerContainer.style.display = 'none';
  } else {
    // 是自定义服务器
    serverPresetSelect.value = 'custom';
    customServerContainer.style.display = 'block';
  }
  
  // 监听渲染开关切换
  renderEnabledCheckbox.addEventListener('change', async () => {
    const renderEnabled = renderEnabledCheckbox.checked;
    await chrome.storage.sync.set({ renderEnabled });
    
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { 
          action: 'updateSettings', 
          renderEnabled 
        });
      } catch (e) {
        // 忽略无法发送消息的标签页
      }
    }
    
    showStatus(renderEnabled ? '渲染已开启' : '渲染已关闭', 'success');
  });
  
  // 监听服务器预设选择
  serverPresetSelect.addEventListener('change', async () => {
    const preset = serverPresetSelect.value;
    
    if (preset === 'custom') {
      // 显示自定义输入框
      customServerContainer.style.display = 'block';
    } else {
      // 使用预设服务器
      customServerContainer.style.display = 'none';
      serverUrlInput.value = preset;
      
      await chrome.storage.sync.set({ serverUrl: preset });
      
      // Kroki 服务器不支持 materia 主题，自动切换到 default
      if (preset.includes('kroki.io') && plantUmlThemeSelect.value === 'materia') {
        plantUmlThemeSelect.value = 'default';
        await chrome.storage.sync.set({ plantUmlTheme: 'default' });
      }
      
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, { 
            action: 'updateSettings', 
            serverUrl: preset
          });
        } catch (e) {
          // 忽略
        }
      }
      
      if (preset.includes('kroki.io') && plantUmlThemeSelect.value === 'materia') {
        showStatus('已切换到 Kroki（materia 主题不支持）', 'info');
      } else {
        showStatus('服务器已切换', 'success');
      }
    }
  });
  
  // 监听自定义服务器地址变化
  serverUrlInput.addEventListener('blur', async () => {
    if (serverPresetSelect.value !== 'custom') {
      return; // 只有在自定义模式下才处理
    }
    
    let serverUrl = serverUrlInput.value.trim();
    if (!serverUrl) {
      serverUrl = 'https://www.plantuml.com/plantuml';
      serverUrlInput.value = serverUrl;
    }
    
    // 移除末尾的斜杠
    serverUrl = serverUrl.replace(/\/$/, '');
    serverUrlInput.value = serverUrl;
    
    await chrome.storage.sync.set({ serverUrl });
    
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { 
          action: 'updateSettings', 
          serverUrl 
        });
      } catch (e) {
        // 忽略
      }
    }
    
    showStatus('自定义服务器已更新', 'success');
  });
  
  // 监听输出格式变化
  outputFormatSelect.addEventListener('change', async () => {
    const outputFormat = outputFormatSelect.value;
    await chrome.storage.sync.set({ outputFormat });
    
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { 
          action: 'updateSettings', 
          outputFormat 
        });
      } catch (e) {
        // 忽略
      }
    }
    
    showStatus('输出格式已更新', 'success');
  });
  
  // 监听主题变化
  plantUmlThemeSelect.addEventListener('change', async () => {
    const plantUmlTheme = plantUmlThemeSelect.value;
    await chrome.storage.sync.set({ plantUmlTheme });
    
    // 检查当前服务器是否为 Kroki 且选择了不支持的主题
    const currentServerUrl = serverUrlInput.value || 'https://www.plantuml.com/plantuml';
    const isKroki = currentServerUrl.includes('kroki.io');
    const unsupportedOnKroki = plantUmlTheme === 'materia';
    
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { 
          action: 'updateSettings', 
          plantUmlTheme 
        });
      } catch (e) {
        // 忽略
      }
    }
    
    if (isKroki && unsupportedOnKroki) {
      showStatus('Kroki 服务器不支持 materia 主题', 'info');
    } else {
      showStatus('主题已更新', 'success');
    }
  });
  
  // 监听调试模式切换
  debugModeCheckbox.addEventListener('change', async () => {
    const debugMode = debugModeCheckbox.checked;
    await chrome.storage.sync.set({ debugMode });
    
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { 
          action: 'updateSettings', 
          debugMode 
        });
      } catch (e) {
        // 忽略
      }
    }
    
    showStatus(debugMode ? '调试模式已开启' : '调试模式已关闭', 'success');
  });
  
  // 重新扫描按钮
  rescanBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'rescan' });
        showStatus('正在刷新所有图表...', 'info');
      } catch (e) {
        showStatus('无法连接到当前页面', 'info');
      }
    }
  });
  
  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
    setTimeout(() => {
      statusEl.className = 'status';
    }, 2000);
  }
});
