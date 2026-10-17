import re, sys, json, html as H
from html.parser import HTMLParser

KEEP_CHAT=False
VOID={'br','img','input','hr','meta','link'}
INLINE={'span','sup','sub','b','i','em','strong','a','u','small','code','label'}
ATTR_MAP={'class':'className','for':'htmlFor','colspan':'colSpan','rowspan':'rowSpan','tabindex':'tabIndex','contenteditable':'contentEditable','readonly':'readOnly','maxlength':'maxLength','autocomplete':'autoComplete'}
FONT_MAP=[("'Architects Daughter',ui-rounded,system-ui,sans-serif","'IBM Plex Sans',system-ui,sans-serif"),("'Architects Daughter'","'IBM Plex Sans'"),("Georgia,serif","'IBM Plex Serif',Georgia,serif"),("Georgia, serif","'IBM Plex Serif',Georgia,serif"),("-apple-system, BlinkMacSystemFont, sans-serif","'IBM Plex Sans',system-ui,sans-serif"),("-apple-system,BlinkMacSystemFont,sans-serif","'IBM Plex Sans',system-ui,sans-serif")]

class Node:
    def __init__(s,tag,attrs): s.tag=tag; s.attrs=dict(attrs); s.children=[]
class Text:
    def __init__(s,t): s.t=t

class TreeBuilder(HTMLParser):
    def __init__(s):
        super().__init__(convert_charrefs=True); s.root=Node('#root',[]); s.stack=[s.root]
    def handle_starttag(s,tag,attrs):
        n=Node(tag,attrs); s.stack[-1].children.append(n)
        if tag not in VOID: s.stack.append(n)
    def handle_startendtag(s,tag,attrs):
        s.stack[-1].children.append(Node(tag,attrs))
    def handle_endtag(s,tag):
        for i in range(len(s.stack)-1,0,-1):
            if s.stack[i].tag==tag:
                del s.stack[i:]; return
    def handle_data(s,data):
        s.stack[-1].children.append(Text(data))

def parse(htmls):
    b=TreeBuilder(); b.feed(htmls); return b.root

def css_key(k):
    k=k.strip()
    if k.startswith('--'): return f'"{k}"'
    parts=k.split('-'); return parts[0]+''.join(p.capitalize() for p in parts[1:])

def style_obj(st):
    for a,b in FONT_MAP: st=st.replace(a,b)
    out={}
    for decl in st.split(';'):
        if ':' not in decl: continue
        k,v=decl.split(':',1); v=v.strip()
        if not v: continue
        out[css_key(k)]=json.dumps(v)
    return '{{ '+', '.join(f'{k}: {v}' for k,v in out.items())+' }}'

def expr(e,scope):
    e=e.strip()
    if e in ('true','false') or re.match(r'^-?\d+(\.\d+)?$',e): return e
    root=re.match(r'[A-Za-z_$][\w$]*',e).group(0)
    return e if root in scope else 'd.'+e

BIND=re.compile(r'\{\{\s*(.*?)\s*\}\}')

def jsx_text(t,scope):
    # split bindings
    parts=[]; i=0
    for m in BIND.finditer(t):
        if m.start()>i: parts.append(('t',t[i:m.start()]))
        parts.append(('e',expr(m.group(1),scope))); i=m.end()
    if i<len(t): parts.append(('t',t[i:]))
    out=''
    for kind,val in parts:
        if kind=='e': out+='{'+val+'}'
        else:
            s=re.sub(r'\s+',' ',val)
            if s=='' : continue
            if s==' ': out+='{" "}'; continue
            if re.search(r'[{}<>]',s) or s!=s.strip() or ' ' in s:
                out+='{'+json.dumps(s,ensure_ascii=False)+'}'
            else: out+=s
    return out

def render(n,scope,ind=0):
    pad='  '*ind
    if isinstance(n,Text):
        return jsx_text(n.t,scope)
    tag=n.tag
    if tag=='sc-for':
        lst=expr(BIND.search(n.attrs['list']).group(1),scope); var=n.attrs['as']
        inner=''.join(render(c,scope|{var},ind+2) for c in n.children)
        return f'\n{pad}{{{lst}.map(({var}, {var}_i) => (\n{pad}  <Fragment key={{{var}_i}}>{inner}\n{pad}  </Fragment>\n{pad}))}}'
    if tag=='sc-if':
        cond=BIND.search(n.attrs['value']).group(1).strip()
        if cond=='showChatPanel' and not KEEP_CHAT: return ''
        if cond in ('showNotes','showToc','showBadges','true'):
            return ''.join(render(c,scope,ind) for c in n.children)
        inner=''.join(render(c,scope,ind+2) for c in n.children)
        return f'\n{pad}{{{expr(cond,scope)} && (<>{inner}\n{pad}</>)}}'
    attrs=[]
    for k,v in n.attrs.items():
        if k.startswith('hint-') or k in ('selected',): continue
        if k=='style': attrs.append(f'style={style_obj(v)}'); continue
        if k.startswith('on') and v and BIND.search(v):
            attrs.append(f'{k[:2]}{k[2:].capitalize()}={{{expr(BIND.search(v).group(1),scope)}}}'); continue
        if k=='value': k='defaultValue'
        elif k=='checked': attrs.append('defaultChecked'); continue
        elif k=='disabled': attrs.append('disabled'); continue
        k=ATTR_MAP.get(k,k)
        if v is None: attrs.append(k); continue
        if BIND.search(v):
            attrs.append(f'{k}={{{"`"+BIND.sub(lambda m: "${"+expr(m.group(1),scope)+"}",v)+"`"}}}')
        else: attrs.append(f'{k}={json.dumps(v,ensure_ascii=False)}')
    a=(' '+' '.join(attrs)) if attrs else ''
    if tag in VOID: return f'\n{pad}<{tag}{a} />'
    kids=n.children
    # drop whitespace-only text between block siblings
    rendered=[]
    for i,c in enumerate(kids):
        if isinstance(c,Text) and c.t.strip()=='':
            prev=kids[i-1] if i>0 else None; nxt=kids[i+1] if i+1<len(kids) else None
            def inl(x): return isinstance(x,Text) or (x is not None and x.tag in INLINE)
            if prev is not None and nxt is not None and inl(prev) and inl(nxt): rendered.append('{" "}')
            continue
        rendered.append(render(c,scope,ind+1))
    inner=''.join(rendered)
    block = any(isinstance(c,Node) for c in kids) and tag not in INLINE
    if block: return f'\n{pad}<{tag}{a}>{inner}\n{pad}</{tag}>'
    return f'\n{pad}<{tag}{a}>{inner}</{tag}>' if (tag not in INLINE) else f'<{tag}{a}>{inner}</{tag}>'

def first_el(children):
    return [c for c in children if isinstance(c,Node)]

def convert(fid,htmls):
    root=parse(htmls); frame=first_el(root.children)[0]
    st=frame.attrs.get('style','')
    kind='shell'
    top=[]; tabs=None; content=[]
    kids=first_el(frame.children)
    if 'padding:26px' in st: kind='modal'; content=frame.children
    elif kids and ('width:52px' in kids[0].attrs.get('style','') or 'width:206px' in kids[0].attrs.get('style','')):
        main=kids[1]; mk=first_el(main.children)
        for c in mk:
            cs=c.attrs.get('style','')
            if ('height:48px' in cs or 'padding:11px 18px' in cs) and 'border-bottom' in cs and not top and not content: top=c.children
            elif ('height:46px' in cs or 'height:44px' in cs or ('gap:24px' in cs and 'border-bottom' in cs)) and tabs is None and len(content)==0: tabs=c.children
            else: content.append(c)
    else:
        kind='content'
        mk=kids
        for c in mk:
            cs=c.attrs.get('style','')
            if ('height:48px' in cs or 'padding:11px 18px' in cs) and 'border-bottom' in cs and not top and not content: top=c.children
            else: content.append(c)
    # frame style minus fixed height/width; shell frames wrap content in the main column's style
    base=';'.join(x for x in st.split(';') if re.match(r'\s*(font-size|color|background):',x))
    if kind=='shell':
        ms=kids[1].attrs.get('style','')
        fst=base+';'+';'.join(x for x in ms.split(';') if not re.match(r'\s*(height|width):',x))
    else:
        fst=';'.join(x for x in st.split(';') if not re.match(r'\s*(height|width):',x))
    def body(nodes,ind): return ''.join(render(c,set(),ind) for c in nodes if not (isinstance(c,Text) and c.t.strip()==''))
    out=['/* Generated from Legal Drafting Wireframes (2).html — frame '+fid+'. Edit by hand after generation. */',
         'import { Fragment } from "react";','import type { WF } from "../data";','type D = typeof WF;','']
    if top: out.append('export function Topbar({ d }: { d: D }) {\n  return (<>'+body(top,2)+'\n  </>);\n}\n')
    if tabs: out.append('export function Tabs({ d }: { d: D }) {\n  return (<>'+body(tabs,2)+'\n  </>);\n}\n')
    wrap_style=style_obj(fst+';flex:1;min-height:0;min-width:0') if kind!='modal' else style_obj(';'.join(x for x in fst.split(';') if not re.match(r'\s*(background|padding):',x)))
    out.append(f'export default function Content({{ d }}: {{ d: D }}) {{\n  return (\n    <div data-frame="{fid}" style={wrap_style}>'+body(content,3)+'\n    </div>\n  );\n}\n')
    return '\n'.join(out), kind

if __name__=='__main__':
    import os
    os.makedirs('frames',exist_ok=True)
    kinds={}
    for f in sorted(os.listdir('.')):
        m=re.match(r'frame_(\w+)\.html$',f)
        if not m: continue
        fid=m.group(1)
        globals()['KEEP_CHAT']= fid in ('4f','4g')
        tsx,kind=convert(fid,open(f).read()); kinds[fid]=kind
        open(f'frames/F{fid}.tsx','w').write(tsx)
    print(kinds)
