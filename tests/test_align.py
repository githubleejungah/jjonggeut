"""문장 시각 맞추기 시험 (음성 인식 없이 match만). 실행: python -m unittest discover -s tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
from align import match, tokens  # noqa: E402


def w(text, s, e):
    return {"w": text, "s": s, "e": e}


class AlignTest(unittest.TestCase):
    def test_hyphen_split(self):
        self.assertEqual(tokens("Let’s begin with check-in."), ["let's", "begin", "with", "check", "in"])

    def test_hyphen_word_end_not_cut(self):
        # 받아쓰기는 "check" + "-in."으로 따로 적는다. 문장 끝이 "with"에서 끊기면 안 된다.
        words = [w("Let's", 0, 500), w("begin", 500, 800), w("with", 800, 1000),
                 w("check", 1000, 1300), w("-in.", 1300, 1700), w("At", 2000, 2200), w("last.", 2200, 2600)]
        out = match(words, [{"en": "Let’s begin with check-in."}, {"en": "At last."}])
        self.assertEqual(out[0]["end_ms"], 1700)
        self.assertEqual(out[1]["start_ms"], 2000)

    def test_first_word_spelled_differently(self):
        # 원문 "OK", 받아쓰기 "Okay": 문장 시작이 "so"로 밀리면 안 된다.
        words = [w("Done.", 0, 400), w("Okay,", 1000, 1300), w("so", 1300, 1500), w("we", 1500, 1700), w("go.", 1700, 2000)]
        out = match(words, [{"en": "Done."}, {"en": "OK, so we go."}])
        self.assertEqual(out[1]["start_ms"], 1000)
        self.assertEqual(out[0]["end_ms"], 400)


if __name__ == "__main__":
    unittest.main()
