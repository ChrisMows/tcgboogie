import unittest
from unittest import mock

from dealfinder import health
from dealfinder.health import SiteHealth, problem_of


class FakeResp:
    def __init__(self, status, body):
        self.status_code, self.body = status, body

    def json(self):
        return self.body


class TestHealth(unittest.TestCase):
    def test_problem_of(self):
        self.assertEqual(problem_of({"ok": True}, 200), "")
        self.assertEqual(problem_of(None, None), "the site didn't answer at all")
        p = problem_of({"ok": False, "database": False, "signIn": False, "missingEssential": ["DATABASE_URL"]}, 503)
        self.assertIn("database", p)
        self.assertIn("sign-in", p)
        self.assertIn("DATABASE_URL", p)
        self.assertEqual(problem_of({}, 500), "health check returned HTTP 500")

    def test_alerts_after_two_failures_then_recovery(self):
        down = {"ok": False, "database": False}
        answers = [FakeResp(503, down), FakeResp(503, down), FakeResp(503, down), FakeResp(200, {"ok": True})]
        sent = []
        site = SiteHealth({"health": {"every_minutes": 5, "admin_email": "a@b.c"}})
        site.notify = lambda text: sent.append(text) or True
        with mock.patch.object(health.requests, "get", side_effect=lambda *a, **k: answers.pop(0)):
            t = 1000.0
            self.assertTrue(site.tick(t))
            self.assertEqual(sent, [])                      # one failure: no message yet
            self.assertIsNone(site.tick(t + 10))            # not due again yet
            self.assertTrue(site.tick(t + 301))
            self.assertEqual(len(sent), 1)                  # two in a row: message
            self.assertTrue(site.tick(t + 602))
            self.assertEqual(len(sent), 1)                  # still down: no repeat
            self.assertEqual(site.tick(t + 903), "")
            self.assertEqual(len(sent), 2)
            self.assertIn("working normally", sent[1])

    def test_disabled(self):
        with mock.patch.object(health.requests, "get", side_effect=AssertionError("called")):
            self.assertIsNone(SiteHealth({"health": {"enabled": False}}).tick(1))


if __name__ == "__main__":
    unittest.main()
