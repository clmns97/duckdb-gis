#pragma once

#include "duckdb_extension.h"

#include <string>

namespace gis {

// Runs every statement in `sql` on `connection`, in order. The last
// statement's result is written to `out` as an Arrow IPC stream (schema,
// record batches, end-of-stream marker). Returns an empty string on success,
// otherwise the error message of the first statement that failed.
//
// Runs on the calling thread; duckdb_interrupt(connection) from another
// thread cancels it.
std::string RunToArrowIpc(duckdb_connection connection, const std::string &sql,
                          std::string &out);

} // namespace gis
