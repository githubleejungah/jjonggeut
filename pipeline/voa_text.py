"""VOA Learning English 기사 페이지(HTML)에서 본문 글만 뽑는다.

실행: python pipeline/voa_text.py pipeline/inbox/voa/파일.html > pipeline/inbox/voa/파일.txt
- 본문은 <div class="wsw"> 안의 문단(<p>)과 소제목(<h2>, <h3>)이다.
- 사진 설명·관련 기사·광고 영역(embed)은 뺀다. 통신사(AP·로이터·AFP) 사진 설명이 섞이지 않게 하기 위해서다.
- 한 줄에 문단 하나를 쓴다. 이 파일은 사람이 검토한 뒤 문장 나누기에 쓴다.
"""
from __future__ import annotations

import sys
from html import unescape
from html.parser import HTMLParser
from pathlib import Path


class WswText(HTMLParser):
    KEEP = {"p", "h2", "h3"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0          # wsw 안의 div 깊이 (0이면 본문 밖)
        self.skip = 0           # embed·figure 안이면 1 이상
        self.buf: list[str] | None = None
        self.lines: list[str] = []

    def handle_starttag(self, tag, attrs):
        cls = dict(attrs).get("class", "") or ""
        if tag == "div":
            if self.depth == 0 and "wsw" in cls.split():
                self.depth = 1
                return
            if self.depth:
                self.depth += 1
                if "embed" in cls or "media" in cls:
                    self.skip += 1
        elif self.depth and tag in {"figure", "figcaption", "script", "style"}:
            self.skip += 1
        elif self.depth and not self.skip and tag in self.KEEP:
            self.buf = []
        elif self.depth and tag == "br" and self.buf is not None:
            self.buf.append(" ")

    def handle_endtag(self, tag):
        if tag == "div" and self.depth:
            self.depth -= 1
            if self.skip:
                self.skip -= 1
        elif self.depth and tag in {"figure", "figcaption", "script", "style"} and self.skip:
            self.skip -= 1
        elif tag in self.KEEP and self.buf is not None:
            text = " ".join("".join(self.buf).split())
            if text:
                self.lines.append(text)
            self.buf = None

    def handle_data(self, data):
        if self.buf is not None and not self.skip:
            self.buf.append(unescape(data))


def extract(html: str) -> list[str]:
    p = WswText()
    p.feed(html)
    return p.lines


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    for line in extract(Path(sys.argv[1]).read_text(encoding="utf-8")):
        print(line)
