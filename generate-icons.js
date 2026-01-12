// Node.js 脚本：生成 UML Render 图标
// 使用纯 JavaScript 生成 PNG 图标（不依赖 canvas）

const fs = require('fs');
const path = require('path');

// 简化的 PNG 生成器
function createPNG(width, height, drawFn) {
  // 创建 RGBA 像素数组
  const pixels = new Uint8Array(width * height * 4);
  
  // 填充背景
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const color = drawFn(x, y, width, height);
      pixels[idx] = color.r;
      pixels[idx + 1] = color.g;
      pixels[idx + 2] = color.b;
      pixels[idx + 3] = color.a;
    }
  }
  
  return pixels;
}

// 渐变青草绿色计算（Light Green - 清新自然风格）
function getGradientColor(x, y, width, height) {
  const ratio = (x + y) / (width + height);
  const r1 = 102, g1 = 187, b1 = 106;   // #66BB6A
  const r2 = 67, g2 = 160, b2 = 71;     // #43A047
  
  return {
    r: Math.round(r1 + (r2 - r1) * ratio),
    g: Math.round(g1 + (g2 - g1) * ratio),
    b: Math.round(b1 + (b2 - b1) * ratio),
    a: 255
  };
}

// 绘制专业的流程图树状图标（参考iconbuddy设计）
function drawUMLIcon(x, y, width, height) {
  const scale = width / 128;
  const centerX = width / 2;
  const centerY = height / 2;
  
  // 渐变背景
  const bgColor = getGradientColor(x, y, width, height);
  
  // === 树状流程图设计 ===
  
  // 顶部节点（矩形）
  const topNodeWidth = 28 * scale;
  const topNodeHeight = 18 * scale;
  const topNodeLeft = centerX - topNodeWidth / 2;
  const topNodeTop = centerY - 35 * scale;
  const topNodeRight = topNodeLeft + topNodeWidth;
  const topNodeBottom = topNodeTop + topNodeHeight;
  const nodeRadius = 3 * scale;
  
  // 底部三个节点
  const bottomNodeWidth = 20 * scale;
  const bottomNodeHeight = 15 * scale;
  const bottomY = centerY + 20 * scale;
  const spacing = 30 * scale;
  
  const nodes = [
    // 顶部节点
    { left: topNodeLeft, top: topNodeTop, right: topNodeRight, bottom: topNodeBottom },
    // 底部左节点
    { left: centerX - spacing - bottomNodeWidth/2, top: bottomY, 
      right: centerX - spacing + bottomNodeWidth/2, bottom: bottomY + bottomNodeHeight },
    // 底部中节点
    { left: centerX - bottomNodeWidth/2, top: bottomY, 
      right: centerX + bottomNodeWidth/2, bottom: bottomY + bottomNodeHeight },
    // 底部右节点
    { left: centerX + spacing - bottomNodeWidth/2, top: bottomY, 
      right: centerX + spacing + bottomNodeWidth/2, bottom: bottomY + bottomNodeHeight }
  ];
  
  // 绘制节点（白色矩形）
  for (const node of nodes) {
    const inNode = (
      x >= node.left + nodeRadius && x < node.right - nodeRadius &&
      y >= node.top && y < node.bottom
    ) || (
      x >= node.left && x < node.right &&
      y >= node.top + nodeRadius && y < node.bottom - nodeRadius
    );
    
    // 圆角处理
    const corners = [
      { cx: node.left + nodeRadius, cy: node.top + nodeRadius },
      { cx: node.right - nodeRadius, cy: node.top + nodeRadius },
      { cx: node.left + nodeRadius, cy: node.bottom - nodeRadius },
      { cx: node.right - nodeRadius, cy: node.bottom - nodeRadius }
    ];
    
    for (const corner of corners) {
      const dx = x - corner.cx;
      const dy = y - corner.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nodeRadius) {
        return { r: 255, g: 255, b: 255, a: 255 };
      }
    }
    
    if (inNode) {
      return { r: 255, g: 255, b: 255, a: 255 };
    }
  }
  
  // 连接线（白色，粗线）
  const lineThickness = 3 * scale;
  
  // 垂直主线（从顶部节点中心到分叉点）
  const vLineX1 = centerX - lineThickness / 2;
  const vLineX2 = centerX + lineThickness / 2;
  const vLineY1 = topNodeBottom;
  const vLineY2 = bottomY - 8 * scale;
  
  if (x >= vLineX1 && x < vLineX2 && y >= vLineY1 && y < vLineY2) {
    return { r: 255, g: 255, b: 255, a: 255 };
  }
  
  // 水平分叉线
  const hLineY1 = vLineY2 - lineThickness / 2;
  const hLineY2 = vLineY2 + lineThickness / 2;
  const hLineX1 = centerX - spacing;
  const hLineX2 = centerX + spacing;
  
  if (y >= hLineY1 && y < hLineY2 && x >= hLineX1 && x < hLineX2) {
    return { r: 255, g: 255, b: 255, a: 255 };
  }
  
  // 三条垂直分支线
  const branchY1 = vLineY2;
  const branchY2 = bottomY;
  
  const branches = [
    centerX - spacing,  // 左
    centerX,            // 中
    centerX + spacing   // 右
  ];
  
  for (const branchX of branches) {
    if (x >= branchX - lineThickness / 2 && x < branchX + lineThickness / 2 &&
        y >= branchY1 && y < branchY2) {
      return { r: 255, g: 255, b: 255, a: 255 };
    }
  }
  
  return bgColor;
}

// 生成 PNG 文件数据
function generatePNGData(pixels, width, height) {
  const DEFLATE_PRESET = 0; // 不压缩，简化处理
  
  // PNG 文件头
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);  // bit depth
  ihdr.writeUInt8(6, 9);  // color type (RGBA)
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace
  
  const ihdrChunk = createChunk('IHDR', ihdr);
  
  // IDAT chunk (简化：不压缩)
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  const pixelBuffer = Buffer.from(pixels);
  for (let y = 0; y < height; y++) {
    scanlines[y * (1 + width * 4)] = 0; // filter type
    pixelBuffer.copy(scanlines, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  
  // 使用 zlib 压缩
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(scanlines, { level: 9 });
  const idatChunk = createChunk('IDAT', compressed);
  
  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = calculateCRC(Buffer.concat([typeBuffer, data]));
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function calculateCRC(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// 生成指定尺寸的图标
function generateIcon(size) {
  console.log(`正在生成 ${size}x${size} 图标...`);
  
  const pixels = createPNG(size, size, drawUMLIcon);
  const pngData = generatePNGData(pixels, size, size);
  
  const filename = path.join(__dirname, 'icons', `icon${size}.png`);
  fs.writeFileSync(filename, pngData);
  
  console.log(`✓ ${filename} 生成成功`);
}

// 主函数
function main() {
  console.log('UML Render 图标生成器\n');
  
  // 确保 icons 目录存在
  const iconsDir = path.join(__dirname, 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir);
    console.log('✓ 创建 icons 目录\n');
  }
  
  // 生成三个尺寸的图标
  [16, 48, 128].forEach(generateIcon);
  
  console.log('\n全部图标生成完成！');
}

main();
