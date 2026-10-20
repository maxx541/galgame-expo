"""
build_quiz_hard.py — 把「婆羅門級」題庫 JSON 轉成網站用的 assets/js/quiz-hard-data.js

用法：
  pip install opencc-python-reimplemented
  python tools/build_quiz_hard.py "C:/Users/maxx/Downloads/quiz_questions (1).json"

JSON 格式（題庫匯出）：
  questions[]：type = single / multiple / judge / fill_blank
    single、multiple、judge：options 是選項，answer 是「正確選項的索引」陣列
    fill_blank：填空題，網站不收（直接略過）
  explanation：解析（可空）
  settings：網站固定「每次從題庫隨機抽 25 題、不限時、多選題要全對才算對」，不採用 JSON 的 pick_count / time_limit

轉換時做的事：
  1. 簡體轉台灣繁體字（只轉字形，不改用語，專有名詞維持原樣）
  2. 題目結尾括號裡的「出處標籤」（例如 (FDU2026孵蛋群新春答題)）拆出來另外存
  3. 略過填空題
  4. 題庫匯出時，有幾題的選項尾端混進了下一題的題幹（例如「閱讀下面的片段，回答第 26-30 題」），
     這種選項會被丟掉
"""
import json, os, re, sys

from opencc import OpenCC

src = sys.argv[1] if len(sys.argv) > 1 else r"C:/Users/maxx/Downloads/quiz_questions (1).json"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cc = OpenCC('s2tw')

data = json.loads(open(src, 'rb').read().decode('utf-8-sig'))
settings = data.get('settings', {})
out = []
skipped = 0
JUNK = re.compile(r'請回答|回答第|選對得|[（(]\s*[ABCD]{1,4}\s*[）)]$')
for i, q in enumerate(data['questions']):
    if q['type'] == 'fill_blank':
        skipped += 1
        continue
    text = q['question'].strip()
    m = re.search(r'\s*[（(]([^（()）]{2,40})[）)]\s*$', text)
    source = m.group(1) if m else ''
    if m:
        text = text[:m.start()].rstrip()
    item = {
        't': {'single': 's', 'multiple': 'm', 'judge': 'j', 'fill_blank': 'f'}[q['type']],
        'q': cc.convert(text),
        's': cc.convert(source),
    }
    if True:
        opts = q['options']
        # 丟掉混進來的題幹殘片（必須是尾端的選項，不能動到正確答案的索引）
        while len(opts) > 2 and JUNK.search(cc.convert(opts[-1])):
            opts = opts[:-1]
        ans = sorted(set(q['answer']))
        assert ans and all(isinstance(a, int) and 0 <= a < len(opts) for a in ans), (i, ans)
        assert q['type'] != 'single' and q['type'] != 'judge' or len(ans) == 1, (i, ans)
        item['o'] = [cc.convert(o) for o in opts]
        item['a'] = ans
    if q.get('explanation'):
        item['e'] = cc.convert(re.sub(r'^解析[：:]\s*', '', q['explanation'].strip()))
    out.append(item)

meta = {
    'title': '婆羅門級',
    'pick': 25,
    'points': 4,  # 每次抽 25 題 × 4 分 = 滿分 100
    'tiers': [
        {'below': 0.34, 'name': '剛入坑的萌新', 'note': '這份題庫連老玩家都會被考倒，能走進來就很勇敢了。'},
        {'below': 0.6, 'name': 'Gal 新人', 'note': '在婆羅門級拿到這個成績，已經不是等閒之輩。'},
        {'below': 0.8, 'name': 'Gal 老手', 'note': '許多冷門細節都難不倒你，相當熟悉這個圈子。'},
        {'below': 0.9, 'name': 'Gal 老資歷', 'note': '幾乎全部答對，連藏在角落的設定都記得。'},
        {'below': 1e9, 'name': '婆羅門', 'note': '站在 Galgame 知識的頂端，向你致敬。'},
    ],
    'questions': out,
}
js = '/* 由 tools/build_quiz_hard.py 產生，不要手動編輯。要換題庫請重新執行該腳本。 */\n'
js += 'window.QUIZ_HARD = ' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')).replace('1000000000.0', 'Infinity') + ';\n'
dst = os.path.join(ROOT, 'assets', 'js', 'quiz-hard-data.js')
open(dst, 'w', encoding='utf-8').write(js)
print(len(out), 'questions (skipped fill-in:', skipped, ') ->', dst, os.path.getsize(dst) // 1024, 'KB')
