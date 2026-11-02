import unittest
from scripts.validate_claude_review import validate

SHA = "a" * 40

class VerdictTests(unittest.TestCase):
    def test_pass_exact_sha_no_findings(self):
        self.assertTrue(validate({"verdict":"PASS","head_sha":SHA,"findings":[]}, SHA))

    def test_fail_closed(self):
        base = {"verdict":"PASS","head_sha":SHA,"findings":[]}
        cases = [
            {}, [], "PASS", None,
            {**base, "verdict":"FAIL"},
            {**base, "verdict":"INCONCLUSIVE"},
            {**base, "verdict":"pass"},
            {**base, "head_sha":"b"*40},
            {**base, "findings":["security issue"]},
            {**base, "findings":None},
            {**base, "extra":"ignored"},
        ]
        for item in cases:
            with self.subTest(item=item):
                self.assertFalse(validate(item, SHA))
        self.assertFalse(validate(base, "invalid"))

if __name__ == "__main__":
    unittest.main()
