#!/usr/bin/env python
"""
Runner directo de `test_cesfam_core.py` en la raíz del proyecto para ejecución con
`python test_cesfam_core.py` o `python backend/manage.py test core.test_cesfam_core`.
"""
import os
import sys
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "cesfam_project.settings")

import django

django.setup()

from core.test_cesfam_core import CesfamCoreQATestSuite  # noqa: E402

__all__ = ["CesfamCoreQATestSuite"]

if __name__ == "__main__":
    from django.test.runner import DiscoverRunner

    runner = DiscoverRunner(verbosity=2)
    failures = runner.run_tests(["core.test_cesfam_core", "core.tests"])
    sys.exit(bool(failures))
