#pragma once

#include <cstddef>

namespace duckdb {
namespace ui {

// One entry per file under frontend/dist, generated at build time by
// scripts/generate_embedded_assets.py from the committed frontend/dist tree.
// See CMakeLists.txt for the generating custom command.
struct EmbeddedAsset {
  const char *path; // request path, e.g. "/index.html" (always leading "/")
  const unsigned char *gzip_data;
  size_t gzip_size;
};

extern const EmbeddedAsset EMBEDDED_ASSETS[];
extern const size_t EMBEDDED_ASSETS_COUNT;

} // namespace ui
} // namespace duckdb
