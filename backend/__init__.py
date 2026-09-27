"""Backend package.

Windows DLL note: importing lancedb before torch makes torch fail with
OSError [WinError 1114] while loading c10.dll. Importing torch here, at
package import time, guarantees it always loads first, whichever backend
module is imported.
"""
try:
    import torch  # noqa: F401  (import order matters, see above)
except Exception:  # torch is optional for some tooling; don't block imports
    pass
