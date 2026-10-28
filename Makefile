.PHONY: clean clean_all frontend

PROJ_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

EXTENSION_NAME=gis

# The stable C extension API version the extension targets (see #88). The
# extension loads on every DuckDB that provides it: v1.2.0 is the oldest
# stable band, so in practice DuckDB 1.4 LTS and every later release (1.2/1.3
# use a different Linux platform name). Raising it unlocks newer C-API
# functions but drops the DuckDB versions that lack them.
USE_UNSTABLE_C_API=0
TARGET_DUCKDB_VERSION=v1.2.0

all: configure release

# Include makefiles from DuckDB
include extension-ci-tools/makefiles/c_api_extensions/base.Makefile
include extension-ci-tools/makefiles/c_api_extensions/c_cpp.Makefile

configure: venv platform extension_version

debug: build_extension_library_debug build_extension_with_metadata_debug
release: build_extension_library_release build_extension_with_metadata_release

# The tests run against the duckdb Python package installed into the venv
# (latest by default; set DUCKDB_TEST_VERSION, e.g. 1.4.5, for another).
test: test_debug
test_debug: test_extension_debug
test_release: test_extension_release

clean: clean_build clean_cmake
clean_all: clean clean_configure

# Rebuilds frontend/dist, which is committed and embedded into the extension
# binary (see CMakeLists.txt / scripts/generate_embedded_assets.py). Not a
# dependency of `release`/`debug`: the community-extensions CI has no Node,
# so this must be run and the result committed deliberately.
frontend:
	cd frontend && pnpm install && pnpm build
