"""生成 brand-identity 的 sets.json。改这里，再重新运行，不手改 sets.json。"""
import json
import pathlib

ROOT = pathlib.Path(__file__).parent
WORK = ROOT / 'novelai-prompt-studio'
MISANS = str((ROOT / 'local-fonts' / 'MiSansVF.ttf').resolve())
NAME = 'NovelAI Prompt Studio'

MISANS_TEXT = {
    'family': 'MiSans VF', 'source': 'user', 'license': 'commercial', 'weights': [400, 500],
    'location': {'wght': 400}, 'features': ['tnum'], 'case': 'as-is', 'tracking': 0,
    'fallback': '"Segoe UI", "Microsoft YaHei UI", sans-serif', 'file': MISANS,
}
MISANS_NOTE = {
    'claim': '正文用 MiSans VF：技能自带的字库里没有覆盖中文的字体；MiSans 的中英文字符和等宽数字检查通过。它有自己的授权条款（可免费商用、可随软件分发、不得修改、不得单独分发字体文件），这里按商业字体登记。',
    'evidence': 'measured', 'source': 'brand.py fonts audit',
}


def face(family, wght, case='as-is', tracking=0, extra=None, fallback='system-ui, sans-serif', features=None):
    loc = {'wght': wght}
    loc.update(extra or {})
    return {'family': family, 'source': 'google', 'license': 'OFL-1.1', 'weights': [wght], 'location': loc,
            'features': features or [], 'case': case, 'tracking': tracking, 'fallback': fallback, 'file': None}


def brand(i, name, hexv, usage):
    return {'id': f'brand-{i}', 'name': name, 'hex': hexv, 'source': 'chosen', 'locked': True, 'usage': usage}


def logo(kind, concept, colors, tags, tracking, case, symbol=True, px=16):
    return {
        'type': kind, 'concept': concept, 'symbol': 'logo/symbol.svg' if symbol else None,
        'wordmark': {'text': NAME, 'role': 'display', 'location': None, 'tracking': tracking, 'case': case},
        'monogram': None, 'lockups': ['horizontal', 'stacked'] if symbol else ['horizontal'],
        'colors': colors, 'tags': tags,
        'clear_space': {'unit': 'cap-height', 'multiple': 1, 'inferred': True},
        'min_size': {'px': px, 'mm': 6},
    }


def build(strategy=None, light_bg=None, dark_bg=None, neutral_tint=None, neutral_chroma=None, extra=None):
    return {'strategy': strategy, 'accent': None, 'light_bg': light_bg, 'dark_bg': dark_bg,
            'neutral_tint': neutral_tint, 'neutral_chroma': neutral_chroma, 'extra': extra or []}


# ---------- A 加权 ----------
A_SYMBOL = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
    '<g id="dots" data-color="text">'
    '<circle id="dot-top-left" cx="25" cy="35" r="11"/>'
    '<circle id="dot-bottom-left" cx="25" cy="75" r="11"/>'
    '<circle id="dot-bottom-right" cx="65" cy="75" r="11"/>'
    '</g>'
    '<circle id="weighted" cx="65" cy="35" r="19.5" data-color="primary"/>'
    '</svg>'
)
A = {
    'identity': {
        'set': {
            'id': 'A', 'name': '加权', 'recommended': False,
            'mechanism': '双冒号“::”的四个点里，有一个被加重：标志、等宽的字标和唯一的一处颜色，都来自“给一个词加权”这个动作。',
            'expression_move': '那一个被加重的蓝点，是整套里唯一的颜色。',
            'differs_by': 'NovelAI 是深海军蓝的沉浸式界面，ComfyUI 是荧光黄，Eagle 是亮蓝；这一套几乎没有颜色，中性灰的界面把颜色全部让给图片。',
        },
        'axes': {'quiet_loud': -2, 'warm_cool': 1, 'playful_serious': 2, 'classic_contemporary': 1},
        'type': {
            'pairing_mode': 'data-face',
            'display': face('Azeret Mono', 500, tracking=-20, fallback='ui-monospace, Consolas, monospace'),
            'text': MISANS_TEXT,
            'mono': face('Azeret Mono', 400, fallback='ui-monospace, Consolas, monospace', features=['tnum']),
        },
        'logo': logo('symbol+wordmark', '两个冒号的四个点，右上那个被加权放大。',
                     {'dots': 'text', 'weighted': 'primary', 'wordmark': 'text'}, ['abstract-geometric'], -20, 'as-is'),
        'palette_build': build(strategy='mono', light_bg='#fcfcfb', dark_bg='#151515', neutral_chroma=0.004),
        'defaults_used': [{'id': 'navy-primary', 'why': '现有资产：用户另一款软件 DispatchDock 的品牌色就是克莱因蓝 #002FA7；并且它只用在标志的一个点和键盘焦点环上，不作为大面积主色。'}],
        'rationale': [
            {'claim': '“数字::词::”是 V4.5 和 V5 的权重写法，用户每天都在打这四个点。', 'evidence': 'measured',
             'source': '用户图库里的 V5 Prompt'},
            {'claim': '克莱因蓝与 DispatchDock 的品牌色相同，两个软件看起来出自同一个作者。', 'evidence': 'judgement',
             'source': '设计负责人'},
            MISANS_NOTE,
        ],
    },
    'palette': {
        'schema': 'brand-identity/palette@1', 'name': '加权',
        'direction': '中性灰的深浅两套界面，只有一处克莱因蓝。',
        'brand': [brand(1, '克莱因蓝', '#002FA7', '标志里被加权的点、键盘焦点环；不用于大面积')],
        'feels': ['安静', '精确', '让位于图片'],
    },
    'symbol_svg': A_SYMBOL, 'symbol_small_svg': None, 'wordmark_detail_svg': None,
}

# ---------- B 括号里的图 ----------
B_SYMBOL = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
    '<path id="brace-open" data-glyphs="{" data-cap="66" data-x="15" data-baseline="78" data-anchor="middle" data-wght="700" data-color="text"/>'
    '<path id="brace-close" data-glyphs="}" data-cap="66" data-x="85" data-baseline="78" data-anchor="middle" data-wght="700" data-color="text"/>'
    '<rect id="picture" x="35" y="33" width="30" height="30" data-color="primary"/>'
    '</svg>'
)
B_SMALL = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
    '<path id="brace-open" data-glyphs="{" data-cap="74" data-x="14" data-baseline="82" data-anchor="middle" data-wght="800" data-color="text"/>'
    '<path id="brace-close" data-glyphs="}" data-cap="74" data-x="86" data-baseline="82" data-anchor="middle" data-wght="800" data-color="text"/>'
    '<rect id="picture" x="33" y="32" width="34" height="34" data-color="primary"/>'
    '</svg>'
)
B = {
    'identity': {
        'set': {
            'id': 'B', 'name': '括号里的图', 'recommended': True,
            'mechanism': 'Prompt 的花括号里放着一张图：衬线体的括号是文字，朱红的方块是图，也是盖在纸上的一方印。',
            'expression_move': '那一块朱红的方形，标志里的图，界面里只用于“这一张”。',
            'differs_by': '同类产品几乎都以深色界面为主；这一套以白纸黑字为主，用衬线体和一方朱印，像画室而不像控制台。',
        },
        'axes': {'quiet_loud': 0, 'warm_cool': -2, 'playful_serious': 1, 'classic_contemporary': -1},
        'type': {
            'pairing_mode': 'contrast',
            'display': face('Newsreader', 500, tracking=-10, extra={'opsz': 72}, fallback='Georgia, "Songti SC", serif'),
            'text': MISANS_TEXT,
            'mono': face('IBM Plex Mono', 400, fallback='ui-monospace, Consolas, monospace', features=['tnum']),
        },
        'logo': logo('symbol+wordmark', '现有的 {N} 标志去掉 N，换成一个实心方块：括号是 Prompt，方块是图。',
                     {'brace-open': 'text', 'brace-close': 'text', 'picture': 'primary', 'wordmark': 'text'},
                     ['letterform'], -10, 'as-is', px=20),
        'palette_build': build(strategy='mono', light_bg='#fbfbfa', dark_bg='#161514', neutral_chroma=0.006),
        'defaults_used': [],
        'rationale': [
            {'claim': '保留现有标志的花括号，延续已有的辨识度；去掉字母 N，标志不再以 NovelAI 的首字母为主体。',
             'evidence': 'judgement', 'source': '设计负责人'},
            {'claim': '已测量的三个同类产品网站，主色分别是深海军蓝、荧光黄和亮蓝，没有红橙色系。', 'evidence': 'measured',
             'source': 'brand.py site competitors'},
            MISANS_NOTE,
        ],
    },
    'palette': {
        'schema': 'brand-identity/palette@1', 'name': '括号里的图',
        'direction': '白纸、墨色，一方朱印。',
        'brand': [brand(1, '朱砂', '#D4351C', '标志里的方块、当前选中的那一张图、主要操作')],
        'feels': ['画室', '手边的', '有分量'],
    },
    'symbol_svg': B_SYMBOL, 'symbol_small_svg': B_SMALL, 'wordmark_detail_svg': None,
}

# 选定 B 之后补上的错误用法：4 条通用的，2 条只有这个标志才会犯的
_master = (WORK / 'sets' / 'B' / 'logo' / 'build' / 'master-symbol.svg')
if _master.exists():
    _m = _master.read_text(encoding='utf-8')
    _pic = '<path id="picture" data-color="primary" data-parts="picture" d="M35 33L65 33L65 63L35 63Z"/>'
    assert _pic in _m
    B['identity']['logo']['misuse'] = [
        {'do': 'stretch'}, {'do': 'recolour'}, {'do': 'crowd'}, {'do': 'rearrange'},
        {'svg': 'logo/misuse-1.svg', 'label': '不要把方块画成空心'},
        {'svg': 'logo/misuse-2.svg', 'label': '不要把方块换成别的形状'},
    ]
    B['misuse_svgs'] = {
        'misuse-1': _m.replace(_pic, '<path id="picture" data-color="primary" d="M35 33H65V37H35Z M35 59H65V63H35Z M35 33H39V63H35Z M61 33H65V63H61Z"/>'),
        'misuse-2': _m.replace(_pic, '<circle id="picture" cx="50" cy="48" r="15" data-color="primary"/>'),
    }

# ---------- C 逗号 ----------
C_SMALL = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
    '<path id="comma" data-glyphs="," data-cap="230" data-x="50" data-baseline="58" data-anchor="middle" data-wght="900" data-color="primary"/>'
    '</svg>'
)
C_DETAIL = (
    '<svg xmlns="http://www.w3.org/2000/svg">'
    '<path id="comma" data-color="primary" d="M1862 72H1890V100L1872 128H1857L1871 100H1862Z"/>'
    '</svg>'
)
C = {
    'identity': {
        'set': {
            'id': 'C', 'name': '逗号', 'recommended': False,
            'mechanism': '名字像一个 Tag 那样写出来，后面跟一个逗号：一个词和下一个词之间、一张图和下一张图之间的那一下停顿。',
            'expression_move': '暗底上那个琥珀色的逗号，放得很大。',
            'differs_by': '不画图形标志，只有字和一个标点；暗房一样的深色底上只有一种琥珀色，比 ComfyUI 的荧光黄暖，比 NovelAI 的海军蓝更暗、更中性。',
        },
        'axes': {'quiet_loud': 2, 'warm_cool': -1, 'playful_serious': -1, 'classic_contemporary': 2},
        'type': {
            'pairing_mode': 'contrast',
            'display': face('Archivo', 700, case='lower', tracking=-10, extra={'wdth': 125}),
            'text': MISANS_TEXT,
            'mono': face('Reddit Mono', 400, fallback='ui-monospace, Consolas, monospace', features=['tnum']),
        },
        'logo': logo('wordmark', '小写的名字后面跟一个琥珀色的逗号；小尺寸下只留逗号。',
                     {'wordmark': 'text', 'comma': 'primary'}, [], -10, 'lower', symbol=False),
        'card': {'ground': 'dark'},
        'palette_build': build(strategy='mono', light_bg='#f7f5f1', dark_bg='#121110', neutral_chroma=0.008),
        'defaults_used': [{'id': 'gold-brass-accent', 'why': '它不是配在奶油底上的金色点缀，而是深色底上唯一的颜色；已测量的同类产品主色里没有与它 ΔE2000 小于 10 的颜色。'}],
        'rationale': [
            {'claim': 'Prompt 里的每个 Tag 都以逗号结尾；软件的口号“从一张图，到下一张图”中间也正好是一个逗号。',
             'evidence': 'judgement', 'source': '设计负责人'},
            {'claim': '黄色只有在明度高时才鲜艳，所以它需要深色的底；这一套以深色界面为主。', 'evidence': 'strong',
             'source': 'references/color.md'},
            MISANS_NOTE,
        ],
    },
    'palette': {
        'schema': 'brand-identity/palette@1', 'name': '逗号',
        'direction': '暗房的黑，一盏琥珀色的安全灯。',
        'brand': [brand(1, '安全灯琥珀', '#F2A20C', '逗号、正在生成的状态、主要操作；只在深色底上使用')],
        'feels': ['暗房', '直接', '有节奏'],
    },
    'symbol_svg': None, 'symbol_small_svg': C_SMALL, 'wordmark_detail_svg': C_DETAIL,
}

out = {'schema': 'brand-identity/sets@1', 'sets': [A, B, C]}
(WORK / 'sets.json').write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
print('written', WORK / 'sets.json')
