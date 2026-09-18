"""Render the beginner guide as a self-contained, printable HTML document."""
from pathlib import Path
import base64
import markdown

root = Path(__file__).resolve().parents[1]
source = root / 'docs/USER-GUIDE.zh-CN.md'
renderer = markdown.Markdown(extensions=['tables', 'toc', 'fenced_code'], extension_configs={'toc': {'toc_depth': '2'}})
article = renderer.convert(source.read_text(encoding='utf-8'))
icon = base64.b64encode((root / 'assets/app.png').read_bytes()).decode('ascii')
page = '''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZZZ Queue OBS · 新手使用手册</title>
<style>
:root{color-scheme:light;--ink:#242922;--accent:#d3ed40;--line:#dce2d5}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:24px}
body{margin:0;background:#f2f4ee;color:var(--ink);font:17px/1.9 "Segoe UI","Microsoft YaHei",sans-serif}
header{background:#21271f;color:#fff;padding:26px max(24px,calc((100vw - 1250px)/2));display:flex;align-items:center;gap:18px}
header img{width:64px;height:64px;border-radius:15px}header strong{font-size:23px}header p{margin:0;color:#c8d0c0;font-size:14px}
.layout{max-width:1290px;margin:auto;display:grid;grid-template-columns:250px minmax(0,1fr);gap:28px;padding:28px 20px}
nav{position:sticky;top:20px;align-self:start;max-height:calc(100vh - 40px);overflow:auto;font-size:14px;padding:16px;background:white;border:1px solid var(--line);border-radius:12px}
nav ul{padding-left:19px}nav li{margin:7px 0}nav a{color:#37402e;text-decoration:none}nav a:hover{text-decoration:underline}
main{background:#fff;padding:32px 42px;border-radius:12px;min-width:0;border:1px solid var(--line)}
h1{font-size:32px;line-height:1.4;margin-top:0}h2{font-size:25px;border-top:2px solid var(--line);padding-top:30px;margin-top:48px;line-height:1.5}h3{font-size:20px;margin-top:30px}
p{margin:15px 0}li{margin:8px 0}a{color:#356000;text-underline-offset:3px;overflow-wrap:anywhere}
strong{font-weight:700}code{background:#eff3e7;padding:2px 5px;border-radius:4px;font:0.9em/1.6 Consolas,monospace;overflow-wrap:anywhere}
table{border-collapse:collapse;width:100%;font-size:15px;margin:20px 0;table-layout:fixed}th,td{border:1px solid var(--line);padding:10px 12px;vertical-align:top;overflow-wrap:anywhere}th{background:#e9f0d6;text-align:left}
button{font:inherit;font-size:14px;cursor:pointer;border:0;border-radius:7px;padding:8px 13px;background:var(--accent);color:#21271f}
.hint{font-size:13px;color:#687260}.actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
@media(max-width:850px){.layout{display:block;padding:12px}nav{position:static;max-height:280px;margin-bottom:15px}main{padding:23px 18px}h1{font-size:27px}h2{font-size:22px}table{font-size:14px}th,td{padding:7px}header{padding:18px}}
@media print{body{background:white;font-size:11pt;line-height:1.65}header,nav,.actions{display:none}.layout{display:block;padding:0}main{border:0;padding:0}h2,h3{break-after:avoid}tr{break-inside:avoid}a{color:inherit}h2{margin-top:24px;padding-top:14px}table{font-size:10pt}code{background:none}@page{margin:18mm}}
</style></head><body>
<header><img alt="应用图标" src="data:image/png;base64,ICON"><div><strong>绳匠委托终端 · 新手手册</strong><p>无需编程知识 · 适用 v1.6.1 · 离线可读</p></div></header>
<div class="layout"><nav aria-label="章节目录"><strong>按步骤开始</strong>TOC<p class="hint">查找问题：按 Ctrl+F，输入“手机”“声音”或“连接失败”。</p></nav>
<main><div class="actions"><button onclick="window.print()">打印 / 保存为 PDF</button><span class="hint">本文件可独立保存或发送给其他主播；外部链接需要联网。</span></div>ARTICLE</main></div>
</body></html>'''
page = page.replace('ICON', icon).replace('TOC', renderer.toc).replace('ARTICLE', article)
target = root / 'docs/USER-GUIDE.zh-CN.html'
target.write_text(page, encoding='utf-8')
print(target)
