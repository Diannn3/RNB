import os
from pathlib import Path
import subprocess
import sys
import unittest


class BackendCliTest(unittest.TestCase):
    def test_invalid_environment_profile_is_a_usage_error(self):
        result = subprocess.run(
            [sys.executable, "-m", "backend"],
            cwd=Path(__file__).resolve().parents[1],
            env={**os.environ, "PAPELLESS_MODEL_PROFILE": "unsupported"},
            capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(result.returncode, 2)
