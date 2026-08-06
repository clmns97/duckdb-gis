PROJ_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

# Configuration of extension
EXT_NAME=gis
EXT_CONFIG=${PROJ_DIR}extension_config.cmake

# Include the Makefile from extension-ci-tools
include extension-ci-tools/makefiles/duckdb_extension.Makefile

# OpenSSL's ./Configure needs Perl core modules (FindBin, File::Basename,
# File::Path, ...). The linux_amd64 LTS build image ships only perl-IPC-Cmd, so
# building OpenSSL *from source* fails there with a missing-Perl-module error.
# Install perl-core before the build runs. Guarded so it is a no-op anywhere
# without yum (macOS, Windows) and when OpenSSL is restored from the vcpkg cache.
#
# Not version-specific: 3.5.4 and 3.6.0 have byte-identical `use` lines in
# Configure, so pinning an older OpenSSL in vcpkg.json does NOT avoid this (and
# a non-default pin makes a binary-cache miss, i.e. a source build, more likely).
# The only way to retire this hack is to drop the OpenSSL dependency outright
# — see T-056.
release debug: | install-build-prereqs

install-build-prereqs:
	@command -v yum >/dev/null 2>&1 && yum install -y perl-core || true

# Rebuilds frontend/dist, which is committed and embedded into the extension
# binary (see CMakeLists.txt / scripts/generate_embedded_assets.py). Not a
# dependency of `release`/`debug`: the community-extensions CI has no Node,
# so this must be run and the result committed deliberately.
frontend:
	cd frontend && pnpm install && pnpm build
