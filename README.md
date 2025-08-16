## 一键填充尺码表（Manifest V3 扩展）

### 简介
**一键填充尺码表**：在 `https://csp.aliexpress.com/*` 页面，通过快捷键或弹窗导入 CSV，一键填充尺码表（S~XXXL 或任意自定义数据）。数据存储在 `chrome.storage.sync`，支持多设备同步。

### 功能
- **CSV 导入与预览**：弹窗中选择 CSV，预览前 6 行（前 5 列），保存到云同步存储
- **快捷键触发**：默认 `Alt+Shift+F`，可自定义
- **自动补行**：尝试点击“添加”按钮以补足所需行数
- **受控输入兼容**：通过原生 setter 设置值并触发 `input/change`

### 适配范围
- 仅在 `https://csp.aliexpress.com/*` 页面注入并工作

## 文件结构（建议）
```
day27/
  manifest.json
  background.js
  contentScript.js
  popup.html
  popup.js
  icon-16.png
  icon-32.png
  icon-48.png
  icon-128.png
  README.md
```

## 安装与加载
1. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）
2. 打开右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本项目目录（例如：`C:\Users\if\work\day27\day27`）
5. 在扩展列表中点击“固定”，将图标固定到工具栏

### 更新扩展
- 修改文件后，在 `chrome://extensions` 中点击当前扩展的“重新加载”以生效
- 若图标或清单变更后仍未生效，尝试“移除”再“加载已解压”

## 使用方法
1. 打开 `https://csp.aliexpress.com/*`，进入存在尺码表的页面/弹层
2. 点击扩展图标，打开弹窗：
   - 选择 CSV → 预览无误后点击“保存数据”
   - 点击“填充当前页”立即触发填充
3. 或直接使用快捷键（默认 `Alt+Shift+F`）触发表格填充
4. 如果需要自定义快捷键，点击弹窗中的“自定义快捷键”，进入 `chrome://extensions/shortcuts`

## CSV 格式要求
- 每行至少 5 列（仅使用前 5 列填充，列顺序示例：尺码, 肩宽, 胸围, 衣长, 袖长）
- 允许逗号/分号/制表符分隔，自动检测

示例（逗号分隔）：
```
S,43,92,71,22
M,45,102,74,22
L,48,112,76,23
XL,51,122,79,23
XXL,53,132,82,25
XXXL,56,142,84,25
```

## 快捷键自定义
- 打开 `chrome://extensions/shortcuts`
- 找到“填充当前页面的尺码表”命令，设置你偏好的快捷键组合

## 图标与显示说明
Chrome 推荐提供多尺寸 PNG 图标，分别用于不同位置与 DPI：16/32/48/128。

### 建议的清单配置
```json
{
  "icons": {
    "16": "icon-16.png",
    "32": "icon-32.png",
    "48": "icon-48.png",
    "128": "icon-128.png"
  },
  "action": {
    "default_icon": {
      "16": "icon-16.png",
      "32": "icon-32.png"
    }
  }
}
```

### 从单一 PNG 快速生成多尺寸（Windows PowerShell）
```powershell
Add-Type -AssemblyName System.Drawing
function Resize-Icon {
  param([string]$inPath, [string]$outPath, [int]$size)
  $src = [System.Drawing.Image]::FromFile($inPath)
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($src, 0, 0, $size, $size)
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $src.Dispose()
}
Set-Location "C:\\Users\\if\\work\\day27\\day27"
Resize-Icon ".\icon.png" ".\icon-16.png" 16
Resize-Icon ".\icon.png" ".\icon-32.png" 32
Resize-Icon ".\icon.png" ".\icon-48.png" 48
Resize-Icon ".\icon.png" ".\icon-128.png" 128
```

### 常见图标问题处理
- 扩展卡片不显示图标且无报错：请确认提供了 128×128 PNG，并在清单中正确映射
- 工具栏图标“看起来没显示”：图标可能为白色/高透明，浅色主题下不明显；可为图标加深颜色或添加描边
- 更新图标后不生效：重新加载扩展，必要时“移除”后再“加载已解压”

## 权限说明
- `storage`：保存 CSV 数据到云同步存储，用于后续填充
- `tabs`：向当前活动标签页发送消息以执行填充
- `host_permissions`（`https://csp.aliexpress.com/*`）：仅在该域注入内容脚本

## 常见问题（FAQ）
- **提示“未找到尺码表容器”**：当前页面未渲染到 `.size-chart-table-comp`，请先打开尺码表弹层或页面相应模块
- **无法自动补足行数**：页面上未找到“添加”按钮；可手动添加行后再填充
- **CSV 解析失败**：确认分隔符（逗号/分号/Tab）与编码为 UTF-8，无多余空行
- **快捷键无效**：确保已在 `chrome://extensions/shortcuts` 设置，且当前焦点不在浏览器受限区域

## 版本与变更
- 1.0.1
  - 增加图标尺寸与显示的指引
  - 文档完善
- 1.0.0
  - 初始版本：CSV 导入、快捷键触发、表格填充

## 免责声明
本扩展仅在目标站点内执行表格填充，不进行任何网络请求或数据上传。请在遵守网站规则与当地法规的前提下使用。


