// UML Render - Content Script
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

(function() {
  'use strict';

  // 设置开关
  let DEBUG = false;
  let RENDER_ENABLED = true;
  let SERVER_URL = 'https://www.plantuml.com/plantuml';
  let OUTPUT_FORMAT = 'png';
  let PLANTUML_THEME = 'default';
  
  // 初始化时从 storage 读取设置
  chrome.storage.sync.get(['debugMode', 'renderEnabled', 'serverUrl', 'outputFormat', 'plantUmlTheme'], (result) => {
    DEBUG = result.debugMode || false;
    RENDER_ENABLED = result.renderEnabled !== false;
    SERVER_URL = result.serverUrl || 'https://www.plantuml.com/plantuml';
    OUTPUT_FORMAT = result.outputFormat || 'png';
    PLANTUML_THEME = result.plantUmlTheme || 'default';
    if (DEBUG) console.log('[UMLRender] 调试模式已开启');
    if (DEBUG) console.log('[UMLRender] 渲染状态:', RENDER_ENABLED ? '开启' : '关闭');
    if (DEBUG) console.log('[UMLRender] 服务器:', SERVER_URL);
    if (DEBUG) console.log('[UMLRender] 主题:', PLANTUML_THEME);
  });
  
  // 监听设置变化
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
      if (changes.debugMode) {
        DEBUG = changes.debugMode.newValue || false;
      }
      if (changes.renderEnabled !== undefined) {
        const newValue = changes.renderEnabled.newValue !== false;
        const oldValue = RENDER_ENABLED;
        RENDER_ENABLED = newValue;
        
        if (oldValue && !newValue) {
          restoreAllRenderedBlocks();
        } else if (!oldValue && newValue && isRunning) {
          scanAndReplace();
        }
      }
      if (changes.serverUrl) {
        SERVER_URL = changes.serverUrl.newValue || 'https://www.plantuml.com/plantuml';
        if (DEBUG) console.log('[UMLRender] 服务器更新为:', SERVER_URL);
      }
      if (changes.outputFormat) {
        OUTPUT_FORMAT = changes.outputFormat.newValue || 'png';
      }
      if (changes.plantUmlTheme) {
        PLANTUML_THEME = changes.plantUmlTheme.newValue || 'default';
        if (DEBUG) console.log('[UMLRender] 主题更新为:', PLANTUML_THEME);
      }
    }
  });
  
  function debug(...args) {
    if (DEBUG) console.log('[UMLRender]', ...args);
  }
  
  function debugError(...args) {
    if (DEBUG) console.error('[UMLRender]', ...args);
  }

  // 状态管理
  let domObserver = null;
  let isRunning = false;
  let isScanning = false;
  let renderCache = new Map();
  
  // 简单的字符串 hash 函数
  function hashCode(str) {
    const normalized = str.trim()
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/[ ]+/g, ' ')
      .replace(/\n+/g, '\n');
    
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  // Toast 消息
  function showToast(message) {
    const existingToast = document.querySelector('.uml-toast');
    if (existingToast) {
      existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'uml-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 1000000;
      animation: umlToastIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'umlToastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  // 复制图片到剪贴板
  async function copyImageToClipboard(imageUrl) {
    try {
      let blob;
      
      // 检测是否是 Kroki.io 服务器，使用 background.js 绕过 CORS
      if (SERVER_URL.includes('kroki.io')) {
        debug('使用 background.js 获取 Kroki.io 图片');
        const response = await chrome.runtime.sendMessage({
          action: 'fetchImage',
          url: imageUrl
        });
        
        if (!response.success) {
          throw new Error(response.error || 'Background fetch failed');
        }
        
        // 将 base64 转换回 blob
        const base64Response = await fetch(response.data);
        blob = await base64Response.blob();
      } else {
        // 官方服务器直接 fetch（保持原有方式）
        debug('直接 fetch 图片');
        const response = await fetch(imageUrl);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        blob = await response.blob();
      }
      
      // 如果是 SVG 格式，同时复制为文本和图片
      if (OUTPUT_FORMAT === 'svg') {
        const text = await blob.text();
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'image/svg+xml': blob
          })
        ]);
      } else {
        // PNG 格式只复制图片
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob })
        ]);
      }
      
      showToast('图片已复制到剪贴板');
      return true;
    } catch (e) {
      debugError('复制到剪贴板失败:', e);
      showToast('复制失败，请重试或右键图片另存为');
      return false;
    }
  }

  // 检查是否是 PlantUML 代码
  function isPlantUmlCode(text) {
    if (!text || text.length < 5) {
      return false;
    }
    
    const trimmed = text.trim().toLowerCase();
    
    // 必须以 @start 开头
    const startsWithTag = trimmed.startsWith('@startuml') || 
                          trimmed.startsWith('@startmindmap') ||
                          trimmed.startsWith('@startsalt') ||
                          trimmed.startsWith('@startditaa') ||
                          trimmed.startsWith('@startdot') ||
                          trimmed.startsWith('@startyaml') ||
                          trimmed.startsWith('@startjson');
    
    if (startsWithTag) {
      // 如果以 @start 开头，检查是否有对应的 @end 标签
      const hasEndTag = trimmed.includes('@enduml') ||
                       trimmed.includes('@endmindmap') ||
                       trimmed.includes('@endsalt') ||
                       trimmed.includes('@endditaa') ||
                       trimmed.includes('@enddot') ||
                       trimmed.includes('@endyaml') ||
                       trimmed.includes('@endjson');
      
      if (!hasEndTag) {
        debug('代码块缺少结束标签');
        return false;
      }
      
      // 检查是否包含实际的 UML 语法（箭头、冒号等）
      const hasUmlSyntax = trimmed.includes('->') || 
                          trimmed.includes('-->') ||
                          trimmed.includes('--|>') ||
                          trimmed.includes('|>') ||
                          trimmed.includes('<|') ||
                          trimmed.includes('*>') ||
                          trimmed.includes('<*') ||
                          trimmed.includes(':') ||
                          trimmed.includes('{') ||
                          trimmed.includes('participant ') ||
                          trimmed.includes('actor ') ||
                          trimmed.includes('class ') ||
                          trimmed.includes('interface ') ||
                          trimmed.includes('state ');
      
      if (!hasUmlSyntax) {
        debug('代码块不包含有效的 UML 语法');
        return false;
      }
      
      return true;
    }
    
    // 如果不以 @start 开头，检查是否包含足够多的 PlantUML 特征
    const keywords = [
      'participant', 'actor', 'boundary', 'control', 'entity', 'database',
      'activate', 'deactivate',
      'alt ', 'else ', 'opt ', 'loop ', 'par ',
      'note left', 'note right', 'note over'
    ];
    
    const hasKeyword = keywords.some(kw => trimmed.includes(kw));
    
    // 必须同时有关键字和箭头语法
    const hasArrow = trimmed.includes('->') || 
                     trimmed.includes('-->') ||
                     trimmed.includes('--|>');
    
    if (hasKeyword && hasArrow) {
      return true;
    }
    
    // 排除明显不是 UML 的代码
    const invalidPatterns = ['console.log', 'function ', 'const ', 'let ', 'var ', 'import ', 'export '];
    if (invalidPatterns.some(p => trimmed.includes(p))) {
      return false;
    }
    
    return false;
  }

  // 从文档代码块中提取代码
  function extractCodeFromDocument(element) {
    // 优先处理 code 标签（GitHub、标准 Markdown）
    if (element.tagName === 'CODE') {
      return element.textContent?.trim() || '';
    }
    
    // 处理 pre > code 结构（GitHub）
    const codeEl = element.querySelector('code');
    if (codeEl) {
      return codeEl.textContent?.trim() || '';
    }
    
    // 处理金山文档的行结构
    const codeLines = element.querySelectorAll('.code-line, [class*="code-line"]');
    if (codeLines.length > 0) {
      const lines = Array.from(codeLines).map(line => line.textContent || '');
      return lines.join('\n').trim();
    }
    
    // 处理金山文档的内容区域
    const codeContent = element.querySelector('.code-block-content, [class*="code-content"]');
    if (codeContent) {
      return codeContent.textContent?.trim() || '';
    }
    
    // 处理嵌套的 pre 标签
    const preEl = element.querySelector('pre');
    if (preEl) {
      return preEl.textContent?.trim() || '';
    }
    
    // 最后尝试直接获取文本（移除工具栏）
    const clone = element.cloneNode(true);
    const toolbars = clone.querySelectorAll('[class*="toolbar"], [class*="header"], [class*="footer"], [class*="lang"], [class*="copy"], button');
    toolbars.forEach(el => el.remove());
    
    return clone.textContent?.trim() || '';
  }

  // 检查元素是否已经被处理
  function isElementProcessed(element) {
    if (element.style.display === 'none') {
      return true;
    }
    
    const prevSibling = element.previousElementSibling;
    if (prevSibling && prevSibling.dataset.umlRendered === 'true') {
      return true;
    }
    
    return false;
  }

  // 生成 PlantUML 图片 URL
  function generatePlantUmlUrl(code) {
    if (!window.plantumlEncoder || !window.plantumlEncoder.encode) {
      debugError('plantumlEncoder 未加载');
      return null;
    }
    
    // 应用主题设置
    let codeWithTheme = code;
    const isKrokiServer = SERVER_URL.includes('kroki.io');
    
    // Kroki 服务器不支持 materia 主题，其他主题可以使用
    const unsupportedThemesOnKroki = ['materia'];
    const shouldApplyTheme = PLANTUML_THEME && PLANTUML_THEME !== 'default' && 
                            !(isKrokiServer && unsupportedThemesOnKroki.includes(PLANTUML_THEME));
    
    if (shouldApplyTheme) {
      codeWithTheme = applyTheme(code, PLANTUML_THEME);
    }
    
    const encoded = window.plantumlEncoder.encode(codeWithTheme);
    
    if (!encoded) {
      debugError('编码失败');
      return null;
    }
    
    // 特殊处理 Kroki 服务器
    let url;
    if (isKrokiServer) {
      url = `${SERVER_URL}/plantuml/${OUTPUT_FORMAT}/${encoded}`;
    } else {
      url = `${SERVER_URL}/${OUTPUT_FORMAT}/${encoded}`;
    }
    
    debug('生成 URL:', url);
    
    return url;
  }
  
  // 应用主题到代码
  function applyTheme(code, theme) {
    // 检查代码是否已经包含主题设置
    if (code.includes('!theme ') || code.includes('skinparam style')) {
      return code;
    }
    
    // 在 @startuml 后添加主题
    const lines = code.split('\n');
    const result = [];
    let themeAdded = false;
    
    for (let i = 0; i < lines.length; i++) {
      result.push(lines[i]);
      
      // 在 @startuml 之后添加主题
      if (!themeAdded && lines[i].trim().startsWith('@start')) {
        if (theme === 'materia') {
          result.push('!theme materia');
        } else if (theme === 'spacelab') {
          result.push('!theme spacelab');
        } else if (theme === 'cerulean-outline') {
          result.push('!theme cerulean-outline');
        } else if (theme === 'vibrant') {
          result.push('!theme vibrant');
        } else if (theme === 'plain') {
          result.push('!theme plain');
        }
        themeAdded = true;
      }
    }
    
    return result.join('\n');
  }

  // 创建图片预览容器
  function createImageContainer(imageUrl, originalWidth, hash, code) {
    const container = document.createElement('div');
    container.className = 'uml-rendered-container';
    container.dataset.umlRendered = 'true';
    container.dataset.umlHash = hash;
    
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #fff;
      border-radius: 8px;
      padding: 16px;
      margin: 8px 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      width: ${originalWidth ? originalWidth + 'px' : '100%'};
      max-width: 100%;
      box-sizing: border-box;
      cursor: pointer;
      transition: box-shadow 0.2s ease;
      position: relative;
    `;
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.className = 'uml-preview-img';
    img.style.cssText = `
      max-width: 100%;
      height: auto;
      display: block;
    `;
    img.alt = 'PlantUML Diagram';
    
    // 图片加载失败处理
    img.onerror = function() {
      debugError('图片加载失败');
      showRenderError(container, '图片加载失败，请检查网络连接或代码语法');
    };
    
    // 图片加载成功
    img.onload = function() {
      debug('图片加载成功');
    };
    
    // 点击放大查看
    container.addEventListener('click', () => {
      showImageModal(imageUrl);
    });
    
    container.appendChild(img);
    
    // 复制按钮
    const hint = document.createElement('div');
    hint.style.cssText = `
      margin-top: 8px;
      font-size: 12px;
      color: #888;
      text-align: center;
    `;
    hint.textContent = '点击放大查看';
    container.appendChild(hint);
    
    return container;
  }

  // 创建可缩放的图片查看器
  function createZoomableImageViewer(modal, img) {
    // 缩放状态
    let displayWidth = 0;
    let displayHeight = 0;
    let naturalWidth = 0;
    let naturalHeight = 0;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartTranslateX = 0;
    let dragStartTranslateY = 0;
    let isFitMode = true;
    let fitWidth = 0;
    let fitHeight = 0;
    
    const minScale = 0.1;
    const maxScale = 10;
    
    // 缩放比例显示
    const zoomIndicator = document.createElement('div');
    zoomIndicator.className = 'uml-zoom-indicator';
    zoomIndicator.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
      z-index: 1000001;
    `;
    
    // 操作提示
    const controlsHint = document.createElement('div');
    controlsHint.className = 'uml-controls-hint';
    controlsHint.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      color: rgba(255,255,255,0.7);
      font-size: 13px;
      pointer-events: none;
      text-align: center;
      line-height: 1.6;
      z-index: 1000001;
    `;
    controlsHint.innerHTML = '滚轮缩放 · 拖拽移动 · 双击切换大小 · ESC/点击背景关闭';
    
    // 设置图片样式
    img.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      cursor: grab;
      user-select: none;
      -webkit-user-drag: none;
      z-index: 1000000;
      opacity: 0;
      max-width: 90vw;
      max-height: 85vh;
    `;
    
    // 获取当前缩放比例
    function getCurrentScale() {
      if (!naturalWidth) return 1;
      return displayWidth / naturalWidth;
    }
    
    // 更新图片位置和大小
    function updateImage(animate = false) {
      img.style.transition = animate ? 'all 0.2s ease-out' : 'none';
      img.style.width = displayWidth + 'px';
      img.style.height = displayHeight + 'px';
      img.style.transform = `translate(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px))`;
    }
    
    // 显示缩放比例
    let hideIndicatorTimer = null;
    function showZoomIndicator() {
      const percentage = Math.round(getCurrentScale() * 100);
      zoomIndicator.textContent = `${percentage}%`;
      zoomIndicator.style.opacity = '1';
      
      if (hideIndicatorTimer) clearTimeout(hideIndicatorTimer);
      hideIndicatorTimer = setTimeout(() => {
        zoomIndicator.style.opacity = '0';
      }, 1500);
    }
    
    // 计算适应窗口的尺寸
    function calculateFitSize() {
      if (!naturalWidth || !naturalHeight) return { width: 400, height: 300 };
      
      const maxWidth = window.innerWidth * 0.9;
      const maxHeight = window.innerHeight * 0.85;
      
      const scaleX = maxWidth / naturalWidth;
      const scaleY = maxHeight / naturalHeight;
      const scale = Math.min(scaleX, scaleY, 1);
      
      return {
        width: naturalWidth * scale,
        height: naturalHeight * scale
      };
    }
    
    // 限制平移范围
    function constrainTranslate() {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      if (displayWidth <= viewportWidth) {
        translateX = 0;
      } else {
        const maxX = (displayWidth - viewportWidth) / 2 + 50;
        translateX = Math.max(-maxX, Math.min(maxX, translateX));
      }
      
      if (displayHeight <= viewportHeight) {
        translateY = 0;
      } else {
        const maxY = (displayHeight - viewportHeight) / 2 + 50;
        translateY = Math.max(-maxY, Math.min(maxY, translateY));
      }
    }
    
    // 滚轮缩放
    function handleWheel(e) {
      e.preventDefault();
      e.stopPropagation();
      
      if (!naturalWidth) return;
      
      const currentScale = getCurrentScale();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(minScale, Math.min(maxScale, currentScale * delta));
      
      if (Math.abs(newScale - currentScale) > 0.001) {
        const imgCenterX = window.innerWidth / 2 + translateX;
        const imgCenterY = window.innerHeight / 2 + translateY;
        const mouseOffsetX = e.clientX - imgCenterX;
        const mouseOffsetY = e.clientY - imgCenterY;
        
        const scaleRatio = newScale / currentScale;
        displayWidth = naturalWidth * newScale;
        displayHeight = naturalHeight * newScale;
        
        translateX += mouseOffsetX * (1 - scaleRatio);
        translateY += mouseOffsetY * (1 - scaleRatio);
        
        isFitMode = false;
        constrainTranslate();
        updateImage();
        showZoomIndicator();
      }
    }
    
    // 拖拽开始
    function handleMouseDown(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartTranslateX = translateX;
      dragStartTranslateY = translateY;
      img.style.cursor = 'grabbing';
      img.style.transition = 'none';
    }
    
    // 拖拽移动
    function handleMouseMove(e) {
      if (!isDragging) return;
      e.preventDefault();
      
      translateX = dragStartTranslateX + (e.clientX - dragStartX);
      translateY = dragStartTranslateY + (e.clientY - dragStartY);
      
      constrainTranslate();
      updateImage();
    }
    
    // 拖拽结束
    function handleMouseUp(e) {
      if (isDragging) {
        isDragging = false;
        img.style.cursor = 'grab';
      }
    }
    
    // 双击切换缩放
    function handleDoubleClick(e) {
      e.preventDefault();
      e.stopPropagation();
      
      if (!naturalWidth) return;
      
      if (isFitMode && getCurrentScale() < 1) {
        displayWidth = naturalWidth;
        displayHeight = naturalHeight;
        translateX = 0;
        translateY = 0;
        isFitMode = false;
      } else {
        const fit = calculateFitSize();
        displayWidth = fit.width;
        displayHeight = fit.height;
        translateX = 0;
        translateY = 0;
        isFitMode = true;
      }
      
      constrainTranslate();
      updateImage(true);
      showZoomIndicator();
    }
    
    // 图片加载完成后初始化
    function initializeViewer() {
      naturalWidth = img.naturalWidth || img.width || 800;
      naturalHeight = img.naturalHeight || img.height || 600;
      
      const fit = calculateFitSize();
      fitWidth = fit.width;
      fitHeight = fit.height;
      displayWidth = fit.width;
      displayHeight = fit.height;
      translateX = 0;
      translateY = 0;
      isFitMode = true;
      
      img.style.maxWidth = 'none';
      img.style.maxHeight = 'none';
      
      updateImage();
      
      requestAnimationFrame(() => {
        img.style.transition = 'opacity 0.15s ease';
        img.style.opacity = '1';
      });
      
      showZoomIndicator();
    }
    
    // 绑定事件
    img.addEventListener('wheel', handleWheel, { passive: false });
    img.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    img.addEventListener('dblclick', handleDoubleClick);
    
    // 图片加载完成
    if (img.complete && img.naturalWidth) {
      setTimeout(initializeViewer, 0);
    } else {
      img.addEventListener('load', initializeViewer);
    }
    
    // 窗口大小变化时重新计算
    const handleResize = () => {
      const fit = calculateFitSize();
      fitWidth = fit.width;
      fitHeight = fit.height;
      if (isFitMode) {
        displayWidth = fit.width;
        displayHeight = fit.height;
        translateX = 0;
        translateY = 0;
        updateImage(true);
      } else {
        constrainTranslate();
        updateImage();
      }
    };
    window.addEventListener('resize', handleResize);
    
    // 清理函数
    const cleanup = () => {
      img.removeEventListener('wheel', handleWheel);
      img.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      img.removeEventListener('dblclick', handleDoubleClick);
      window.removeEventListener('resize', handleResize);
      if (hideIndicatorTimer) clearTimeout(hideIndicatorTimer);
    };
    
    return {
      img,
      zoomIndicator,
      controlsHint,
      cleanup
    };
  }

  // 显示图片放大模态框
  function showImageModal(imageUrl) {
    const existingModal = document.querySelector('.uml-image-modal');
    if (existingModal) {
      if (existingModal._cleanup) existingModal._cleanup();
      existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'uml-image-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.92);
      z-index: 999999;
      cursor: default;
      animation: umlModalFadeIn 0.2s ease;
    `;
    
    // 创建图片元素
    const img = document.createElement('img');
    img.className = 'uml-modal-img';
    img.src = imageUrl;
    img.alt = 'PlantUML Diagram';
    
    // 创建可缩放查看器
    const viewer = createZoomableImageViewer(modal, img);
    
    // 复制按钮
    const copyBtn = document.createElement('button');
    copyBtn.className = 'uml-copy-btn';
    copyBtn.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #66BB6A 0%, #43A047 100%);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      z-index: 1000001;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      transition: all 0.2s ease;
    `;
    copyBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span>复制图片</span>
    `;
    
    copyBtn.addEventListener('mouseenter', () => {
      copyBtn.style.transform = 'translateX(-50%) translateY(-2px)';
      copyBtn.style.boxShadow = '0 4px 12px rgba(102, 187, 106, 0.4)';
    });
    
    copyBtn.addEventListener('mouseleave', () => {
      copyBtn.style.transform = 'translateX(-50%)';
      copyBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    });
    
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const success = await copyImageToClipboard(imageUrl);
      if (success) {
        copyBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>已复制</span>
        `;
        setTimeout(() => {
          if (document.contains(copyBtn)) {
            copyBtn.innerHTML = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>复制图片</span>
            `;
          }
        }, 2000);
      }
    });
    
    // 关闭模态框
    const closeModal = () => {
      viewer.cleanup();
      document.removeEventListener('keydown', handleKeyDown);
      if (viewer.img.parentNode) viewer.img.remove();
      if (viewer.zoomIndicator.parentNode) viewer.zoomIndicator.remove();
      if (viewer.controlsHint.parentNode) viewer.controlsHint.remove();
      if (copyBtn.parentNode) copyBtn.remove();
      modal.remove();
    };
    
    // 键盘事件
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    // 点击背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
    
    // 存储清理函数
    modal._cleanup = closeModal;
    
    // 添加所有元素到 body
    document.body.appendChild(modal);
    document.body.appendChild(viewer.img);
    document.body.appendChild(viewer.zoomIndicator);
    document.body.appendChild(viewer.controlsHint);
    document.body.appendChild(copyBtn);
  }

  // 替换代码块为渲染后的图片
  function replaceCodeBlockWithImage(element, imageUrl, hash, code) {
    if (!element || !element.parentNode) {
      return null;
    }
    
    const originalWidth = element.offsetWidth;
    const container = createImageContainer(imageUrl, originalWidth, hash, code);
    
    element.parentNode.insertBefore(container, element);
    element.style.display = 'none';
    
    debug('已替换代码块为 UML 图片');
    return container;
  }

  // 显示渲染错误
  function showRenderError(element, errorMsg) {
    if (!element || !element.parentNode) {
      return;
    }
    
    const errorBadge = document.createElement('div');
    errorBadge.className = 'uml-error-badge';
    errorBadge.style.cssText = `
      background: #fff3cd;
      color: #856404;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      margin-top: 8px;
      display: inline-block;
    `;
    errorBadge.textContent = `PlantUML 渲染失败: ${errorMsg}`;
    
    element.appendChild(errorBadge);
  }

  // 扫描代码块
  function scanDocumentCodeBlocks() {
    const results = [];
    
    const selectors = [
      // 金山文档
      'pre.code-block-wrapper',
      '.code-block-wrapper',
      'pre[class*="code-block"]',
      // GitHub
      '.highlight pre',
      'pre > code',
      // 通用 Markdown
      'pre',
      'code[class*="language-"]'
    ];
    
    const allWrappers = document.querySelectorAll(selectors.join(','));
    debug(`扫描到 ${allWrappers.length} 个代码块`);
    
    allWrappers.forEach((wrapper, index) => {
      if (isElementProcessed(wrapper)) {
        return;
      }
      
      // 找到实际要替换的容器（GitHub 的 .highlight 或其他父容器）
      let targetElement = wrapper;
      if (wrapper.parentElement && wrapper.parentElement.classList.contains('highlight')) {
        targetElement = wrapper.parentElement;
      }
      
      // 避免重复处理
      if (isElementProcessed(targetElement)) {
        return;
      }
      
      // 检查是否明确标记为 PlantUML（GitHub 等平台）
      const codeElement = wrapper.tagName === 'CODE' ? wrapper : wrapper.querySelector('code');
      const isMarkedAsPlantUML = codeElement && (
        codeElement.classList.contains('language-plantuml') ||
        codeElement.classList.contains('lang-plantuml') ||
        codeElement.className.includes('plantuml')
      );
      
      const code = extractCodeFromDocument(wrapper);
      if (!code) {
        return;
      }
      
      // 如果明确标记为 PlantUML 或代码内容符合 PlantUML 特征
      if (isMarkedAsPlantUML || isPlantUmlCode(code)) {
        const codeHash = hashCode(code);
        debug(`识别 PlantUML #${index}`);
        results.push({
          element: targetElement,
          code: code,
          hash: codeHash,
          index: index
        });
      }
    });
    
    debug(`发现 ${results.length} 个 PlantUML 代码块`);
    return results;
  }

  // 渲染单个代码块
  async function renderSingleBlock(block) {
    if (isElementProcessed(block.element)) {
      return { success: true, skipped: true };
    }
    
    if (!document.contains(block.element)) {
      return { success: true, skipped: true };
    }
    
    try {
      let cached = renderCache.get(block.hash);
      
      if (cached) {
        replaceCodeBlockWithImage(block.element, cached.imageUrl, block.hash, block.code);
        debug('使用缓存的图片 URL');
        return { success: true, cached: true };
      } else {
        const imageUrl = generatePlantUmlUrl(block.code);
        
        renderCache.set(block.hash, {
          imageUrl: imageUrl,
          code: block.code
        });
        
        replaceCodeBlockWithImage(block.element, imageUrl, block.hash, block.code);
        debug('生成新的 PlantUML 图片 URL:', imageUrl);
        
        return { success: true };
      }
    } catch (e) {
      debugError('代码块渲染失败:', e);
      if (document.contains(block.element)) {
        showRenderError(block.element, e.message);
      }
      return { success: false, error: e.message };
    }
  }

  // 主扫描和替换流程
  async function scanAndReplace() {
    if (!RENDER_ENABLED) {
      debug('渲染已关闭，跳过扫描');
      return;
    }
    
    if (isScanning) {
      return;
    }
    
    isScanning = true;
    
    try {
      const codeBlocks = scanDocumentCodeBlocks();
      
      if (codeBlocks.length === 0) {
        debug('未发现待处理的 PlantUML 代码块');
        return;
      }
      
      for (let i = 0; i < codeBlocks.length; i++) {
        await renderSingleBlock(codeBlocks[i]);
      }
      
      debug('扫描流程结束');
    } finally {
      isScanning = false;
    }
  }

  // 恢复所有已渲染的内容
  function restoreAllRenderedBlocks() {
    debug('恢复所有已渲染的内容...');
    
    const renderedElements = document.querySelectorAll('[data-uml-rendered="true"]');
    renderedElements.forEach(el => {
      const nextSibling = el.nextElementSibling;
      if (nextSibling && nextSibling.style.display === 'none') {
        nextSibling.style.display = '';
      }
      el.remove();
    });
    
    debug(`已恢复 ${renderedElements.length} 个渲染块`);
  }

  // 防抖函数
  function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  const debouncedScan = debounce(scanAndReplace, 200);

  // 开始监听 DOM 变化
  function startObserving() {
    if (domObserver) return;
    
    domObserver = new MutationObserver((mutations) => {
      let hasNewContent = false;
      
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasNewContent = true;
          break;
        }
      }
      
      if (hasNewContent) {
        debouncedScan();
      }
    });
    
    domObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    window.addEventListener('scroll', debouncedScan, { passive: true });
    
    debug('已开始监听');
  }

  // 停止监听
  function stopObserving() {
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
    window.removeEventListener('scroll', debouncedScan);
  }

  // 注入动画样式
  function injectStyles() {
    if (document.querySelector('#uml-inline-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'uml-inline-styles';
    style.textContent = `
      @keyframes umlModalFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes umlModalZoomIn {
        from { transform: scale(0.9); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
      @keyframes umlToastIn {
        from { opacity: 0; transform: translate(-50%, 20px); }
        to { opacity: 1; transform: translate(-50%, 0); }
      }
      @keyframes umlToastOut {
        from { opacity: 1; transform: translate(-50%, 0); }
        to { opacity: 0; transform: translate(-50%, -20px); }
      }
      .uml-rendered-container:hover {
        box-shadow: 0 4px 16px rgba(0,0,0,0.15) !important;
      }
    `;
    document.head.appendChild(style);
  }

  // 启动扩展
  async function start() {
    if (isRunning) return;
    isRunning = true;
    
    console.log('[UMLRender] 扩展启动');
    
    injectStyles();
    await scanAndReplace();
    startObserving();
    
    console.log('[UMLRender] 启动完成');
  }

  // 监听来自 background 的消息
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'rescan') {
      // 强制重新渲染：清除缓存并恢复所有已渲染的内容
      debug('收到重新扫描请求，清除缓存');
      renderCache.clear();
      restoreAllRenderedBlocks();
      
      // 延迟一下再扫描，确保DOM已恢复
      setTimeout(() => {
        if (isRunning) {
          scanAndReplace();
        } else {
          start();
        }
      }, 100);
    } else if (message.action === 'updateSettings') {
      if (typeof message.debugMode !== 'undefined') {
        DEBUG = message.debugMode;
      }
      if (typeof message.renderEnabled !== 'undefined') {
        RENDER_ENABLED = message.renderEnabled;
        if (RENDER_ENABLED) {
          if (isRunning) {
            scanAndReplace();
          }
        } else {
          restoreAllRenderedBlocks();
        }
      }
      if (message.serverUrl) {
        SERVER_URL = message.serverUrl;
      }
      if (message.outputFormat) {
        OUTPUT_FORMAT = message.outputFormat;
      }
    }
  });

  // 页面加载完成后自动启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(start, 100);
    });
  } else {
    setTimeout(start, 100);
  }

})();
