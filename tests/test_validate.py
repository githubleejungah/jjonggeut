"""콘텐츠 데이터 검사 시험. 실행: python -m unittest discover -s tests"""
import copy
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
from validate import validate  # noqa: E402

LICENSE = {
    "id": "voa-public-domain", "name": "VOA", "kind": "public_domain", "holder": "VOA",
    "terms_url": "https://example.org", "checked_at": "2026-11-11", "attribution": "출처: VOA",
}
CONTENT = {
    "id": "voa-travel-001", "title": "At the Airport", "title_ko": "공항에서", "level": "A2",
    "topics": ["travel"], "license_id": "voa-public-domain", "source_url": "https://example.org/1",
    "audio": {"src": "audio/a.mp3", "duration_ms": 10000}, "added_at": "2026-11-12", "reviewed": True,
    "sentences": [
        {"start_ms": 0, "end_ms": 3000, "en": "Hello.", "ko": "안녕하세요."},
        {"start_ms": 3100, "end_ms": 6000, "en": "Where is gate 5?", "ko": "5번 탑승구가 어디예요?"},
    ],
    "scenes": [{"from": 0, "to": 1}],
}


class ValidateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.site = Path(self.tmp.name)
        (self.site / "audio").mkdir()
        (self.site / "audio" / "a.mp3").write_bytes(b"x")

    def tearDown(self):
        self.tmp.cleanup()

    def run_with(self, content=None, license_=None, today="2026-11-12"):
        data = {"format": 1, "licenses": [license_ or copy.deepcopy(LICENSE)],
                "contents": [content or copy.deepcopy(CONTENT)]}
        return validate(data, self.site, today)

    def test_good_data_passes(self):
        self.assertEqual(self.run_with(), [])

    def test_missing_license_blocks_publishing(self):
        c = copy.deepcopy(CONTENT)
        c["license_id"] = "unknown"
        self.assertTrue(any("라이선스" in e for e in self.run_with(c)))

    def test_expired_license_blocks_publishing(self):
        lic = dict(LICENSE, expires_at="2026-11-01")
        self.assertTrue(any("만료" in e for e in self.run_with(license_=lic)))

    def test_overlapping_sentences_fail(self):
        c = copy.deepcopy(CONTENT)
        c["sentences"][1]["start_ms"] = 2500          # 앞 문장과 500ms 겹침
        self.assertTrue(any("겹칩니다" in e for e in self.run_with(c)))

    def test_small_overlap_within_tolerance_passes(self):
        c = copy.deepcopy(CONTENT)
        c["sentences"][1]["start_ms"] = 2900          # 100ms 겹침은 허용
        self.assertEqual(self.run_with(c), [])

    def test_missing_audio_file_fails(self):
        c = copy.deepcopy(CONTENT)
        c["audio"]["src"] = "audio/none.mp3"
        self.assertTrue(any("음성 파일" in e for e in self.run_with(c)))

    def test_unknown_topic_fails(self):
        c = copy.deepcopy(CONTENT)
        c["topics"] = ["travel", "cooking"]
        self.assertTrue(any("topics" in e for e in self.run_with(c)))

    def test_empty_translation_fails(self):
        c = copy.deepcopy(CONTENT)
        c["sentences"][0]["ko"] = " "
        self.assertTrue(any("'ko'" in e for e in self.run_with(c)))


if __name__ == "__main__":
    unittest.main()


class ScenesTest(unittest.TestCase):
    """장면 나누기 규칙 (pipeline/scenes.py)"""

    def setUp(self):
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
        from scenes import split_scenes
        self.split = split_scenes
        # 4초짜리 문장 20개, 문장 사이 0.5초. 10번째 뒤만 2초 쉼(장면이 바뀌는 곳)
        self.s, t = [], 0
        for i in range(20):
            self.s.append({"start_ms": t, "end_ms": t + 4000, "speaker": "A"})
            t += 4000 + (2000 if i == 9 else 500)

    def test_scenes_cover_all_in_order(self):
        sc = self.split(self.s, "A2")
        self.assertEqual(sc[0]["from"], 0)
        self.assertEqual(sc[-1]["to"], 19)
        for a, b in zip(sc, sc[1:]):
            self.assertEqual(b["from"], a["to"] + 1)

    def test_a2_scene_is_at_most_30_seconds(self):
        for sc in self.split(self.s, "A2"):
            self.assertLessEqual(self.s[sc["to"]]["end_ms"] - self.s[sc["from"]]["start_ms"], 30000)

    def test_cut_at_longest_pause(self):
        # B1(최대 60초)이면 2초 쉼이 있는 10번째 문장 뒤에서 자른다
        self.assertEqual(self.split(self.s, "B1")[0]["to"], 9)
