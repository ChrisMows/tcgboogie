"""The programs the server runs must at least load (a syntax error there takes the bot down)."""
import importlib
import unittest


class EntryPointTests(unittest.TestCase):
    def test_runners_import(self):
        for name in ("run_web", "run_finder"):
            importlib.import_module(name)


if __name__ == "__main__":
    unittest.main()
