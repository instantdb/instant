from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as _get_version

try:
    __version__ = _get_version("instantdb")
except PackageNotFoundError:
    __version__ = "0.0.0+unknown"
