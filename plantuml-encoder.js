// PlantUML Encoder - 使用正确的 Deflate 压缩
// 将 PlantUML 文本编码为 PlantUML 服务器可识别的格式
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

(function(global) {
  'use strict';

  // PlantUML 使用的特殊 Base64 字符集
  function encode6bit(b) {
    if (b < 10) {
      return String.fromCharCode(48 + b);
    }
    b -= 10;
    if (b < 26) {
      return String.fromCharCode(65 + b);
    }
    b -= 26;
    if (b < 26) {
      return String.fromCharCode(97 + b);
    }
    b -= 26;
    if (b === 0) {
      return '-';
    }
    if (b === 1) {
      return '_';
    }
    return '?';
  }

  function append3bytes(b1, b2, b3) {
    var c1 = b1 >> 2;
    var c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
    var c3 = ((b2 & 0xF) << 2) | (b3 >> 6);
    var c4 = b3 & 0x3F;
    var r = "";
    r += encode6bit(c1 & 0x3F);
    r += encode6bit(c2 & 0x3F);
    r += encode6bit(c3 & 0x3F);
    r += encode6bit(c4 & 0x3F);
    return r;
  }

  function encode64(data) {
    var r = "";
    var i;
    for (i = 0; i < data.length; i += 3) {
      if (i + 2 === data.length) {
        r += append3bytes(data[i], data[i + 1], 0);
      } else if (i + 1 === data.length) {
        r += append3bytes(data[i], 0, 0);
      } else {
        r += append3bytes(data[i], data[i + 1], data[i + 2]);
      }
    }
    return r;
  }

  // 主编码函数
  function encodePlantUml(plantUmlCode) {
    try {
      console.log('[PlantUML Encoder] 开始编码');
      console.log('[PlantUML Encoder] 原始代码长度:', plantUmlCode.length);
      console.log('[PlantUML Encoder] 原始代码:', plantUmlCode.substring(0, 200) + (plantUmlCode.length > 200 ? '...' : ''));
      
      // 确保代码以 @startuml 开头
      var code = plantUmlCode.trim();
      if (!code.startsWith('@startuml') && !code.startsWith('@startmindmap') && 
          !code.startsWith('@startsalt') && !code.startsWith('@startditaa')) {
        code = '@startuml\n' + code + '\n@enduml';
      }
      
      console.log('[PlantUML Encoder] 处理后的代码:', code.substring(0, 200) + (code.length > 200 ? '...' : ''));
      
      // 使用 pako 进行 Deflate 压缩
      if (typeof pako === 'undefined') {
        console.error('[PlantUML Encoder] pako library not loaded');
        return null;
      }
      
      // 转换为 UTF-8 字节数组
      var utf8Bytes = new TextEncoder().encode(code);
      console.log('[PlantUML Encoder] UTF-8 字节数组长度:', utf8Bytes.length);
      
      // Deflate 压缩
      var compressed = pako.deflateRaw(utf8Bytes, { level: 9 });
      console.log('[PlantUML Encoder] 压缩后字节数组长度:', compressed.length);
      
      // 使用 PlantUML 专用 Base64 编码
      var encoded = encode64(compressed);
      console.log('[PlantUML Encoder] Base64 编码结果长度:', encoded.length);
      console.log('[PlantUML Encoder] Base64 编码结果（前50字符）:', encoded.substring(0, 50));
      
      return encoded;
    } catch (e) {
      console.error('[PlantUML Encoder] 编码失败:', e);
      return null;
    }
  }

  // 导出到全局对象
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { encode: encodePlantUml };
  } else {
    global.plantumlEncoder = { encode: encodePlantUml };
  }

})(typeof window !== 'undefined' ? window : this);
