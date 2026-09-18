# =============================================================================
# 產生 og-image.png（1200 x 630）—— 分享到 LINE / Discord / Twitter 時的預覽圖
# 用 .NET 的 System.Drawing 直接畫，配色與站上的夜間主題一致。
# =============================================================================
Add-Type -AssemblyName System.Drawing

$W = 1200
$H = 630
$out = 'D:\claude工作區\Galgame週邊線上展覽\assets\img\og-image.png'

$bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# ---- 底色：對角漸層（#120c1f -> #2a1740 -> #4a1f4b）-------------------------
$rect = New-Object System.Drawing.Rectangle(0, 0, $W, $H)
$c1 = [System.Drawing.Color]::FromArgb(255, 18, 12, 31)
$c2 = [System.Drawing.Color]::FromArgb(255, 74, 31, 75)
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 25.0)
$blend = New-Object System.Drawing.Drawing2D.ColorBlend(3)
$blend.Colors = @(
  [System.Drawing.Color]::FromArgb(255, 15, 10, 26),
  [System.Drawing.Color]::FromArgb(255, 42, 23, 64),
  [System.Drawing.Color]::FromArgb(255, 92, 37, 72)
)
$blend.Positions = @(0.0, 0.55, 1.0)
$bg.InterpolationColors = $blend
$g.FillRectangle($bg, $rect)

# ---- 右上角的逆光暈 ---------------------------------------------------------
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddEllipse(700, -260, 900, 760)
$glow = New-Object System.Drawing.Drawing2D.PathGradientBrush($path)
$glow.CenterColor = [System.Drawing.Color]::FromArgb(110, 255, 158, 196)
$glow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 158, 196))
$g.FillPath($glow, $path)

# ---- 散落的櫻花光點（固定位置，不隨機，避免每次重跑都不一樣）----------------
$dots = @(
  @(120, 470, 46, 26), @(1010, 150, 60, 20), @(880, 520, 34, 22),
  @(250, 110, 28, 18), @(640, 560, 22, 16), @(1120, 380, 40, 18),
  @(70, 230, 20, 14), @(430, 470, 16, 12)
)
foreach ($d in $dots) {
  $dp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $dp.AddEllipse($d[0], $d[1], $d[2], $d[2])
  $db = New-Object System.Drawing.Drawing2D.PathGradientBrush($dp)
  $db.CenterColor = [System.Drawing.Color]::FromArgb($d[3], 255, 201, 222)
  $db.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 201, 222))
  $g.FillPath($db, $dp)
  $db.Dispose(); $dp.Dispose()
}

# ---- ADV 對話框風格的四角框線 -----------------------------------------------
$penEdge = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 255, 173, 205), 1.5)
$m = 36; $len = 54
# 左上
$g.DrawLine($penEdge, $m, $m, ($m + $len), $m)
$g.DrawLine($penEdge, $m, $m, $m, ($m + $len))
# 右下
$g.DrawLine($penEdge, ($W - $m), ($H - $m), ($W - $m - $len), ($H - $m))
$g.DrawLine($penEdge, ($W - $m), ($H - $m), ($W - $m), ($H - $m - $len))

# ---- 主標題 ATELIER SAKURA（Georgia，粉→紫漸層）-----------------------------
$titleFont = New-Object System.Drawing.Font('Georgia', 78, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$titleText = 'ATELIER SAKURA'
$tRect = New-Object System.Drawing.Rectangle(90, 200, 1020, 110)
$tBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $tRect,
  [System.Drawing.Color]::FromArgb(255, 255, 222, 236),
  [System.Drawing.Color]::FromArgb(255, 169, 139, 255),
  0.0)
$g.DrawString($titleText, $titleFont, $tBrush, 88, 198)

# ---- 日文副標（逐字繪製以做出字距）-----------------------------------------
$jaFont = New-Object System.Drawing.Font('Yu Mincho', 22, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$jaBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200, 180, 166, 200))
$ja = 'アトリエ・サクラ'
$x = 94.0
foreach ($ch in $ja.ToCharArray()) {
  $g.DrawString([string]$ch, $jaFont, $jaBrush, $x, 322)
  $sz = $g.MeasureString([string]$ch, $jaFont)
  $x += $sz.Width - 4 + 9   # -4 抵銷 MeasureString 的內建留白，+9 是字距
}

# ---- 中文主述 ---------------------------------------------------------------
$zhFont = New-Object System.Drawing.Font('Microsoft JhengHei', 30, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$zhBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 244, 236, 248))
$g.DrawString('Galgame 週邊線上展覽', $zhFont, $zhBrush, 90, 372)

# ---- 分類列 -----------------------------------------------------------------
$catFont = New-Object System.Drawing.Font('Microsoft JhengHei', 20, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$catBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(215, 255, 158, 196))
$g.DrawString('立牌　掛畫　色紙　原畫集　限定特典　初回限定', $catFont, $catBrush, 92, 432)

# ---- 上方的小標籤 -----------------------------------------------------------
$eyeFont = New-Object System.Drawing.Font('Georgia', 17, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$eyeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 255, 158, 196))
$penRule = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(150, 255, 158, 196), 1.0)
$g.DrawLine($penRule, 92, 168, 142, 168)
$g.DrawString('PERMANENT EXHIBITION', $eyeFont, $eyeBrush, 152, 158)

# ---- 右側的櫻花標記（五瓣，用貝茲曲線畫，跟 favicon 同一個造型）----------
$petalBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(115, 255, 158, 196))
$petalPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 255, 222, 236), 1.2)
$cx = 1012.0; $cy = 300.0
$r = 82.0            # 花瓣長度（從花心到瓣尖）
$b = $r * 0.20       # 花瓣根部離花心的距離
$w = $r * 0.40       # 花瓣最寬處
for ($i = 0; $i -lt 5; $i++) {
  $st = $g.Save()
  $g.TranslateTransform($cx, $cy)
  $g.RotateTransform([float]($i * 72 + 18))
  $pp = New-Object System.Drawing.Drawing2D.GraphicsPath
  # 右半邊：根部 -> 瓣尖
  $pp.AddBezier(0, -$b,  $w, -($b + ($r - $b) * 0.30),  ($w * 0.72), -($r - ($r - $b) * 0.18),  0, -$r)
  # 左半邊：瓣尖 -> 根部
  $pp.AddBezier(0, -$r,  -($w * 0.72), -($r - ($r - $b) * 0.18),  -$w, -($b + ($r - $b) * 0.30),  0, -$b)
  $pp.CloseFigure()
  $g.FillPath($petalBrush, $pp)
  $g.DrawPath($petalPen, $pp)
  $pp.Dispose()
  $g.Restore($st)
}
# 花心
$coreBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 255, 240, 247))
$g.FillEllipse($coreBrush, ($cx - 9), ($cy - 9), 18, 18)

# ---- 底部細線 ---------------------------------------------------------------
$penBottom = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(55, 255, 173, 205), 1.0)
$g.DrawLine($penBottom, 90, 520, 1110, 520)

$footFont = New-Object System.Drawing.Font('Microsoft JhengHei', 17, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$footBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(165, 151, 137, 173))
$g.DrawString('個人收藏・非商業性展示', $footFont, $footBrush, 90, 542)

$g.Dispose()
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$len = (Get-Item $out).Length
Write-Output "Saved: $out ($len bytes)"
