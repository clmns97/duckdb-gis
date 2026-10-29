#pragma once

#include "duckdb_extension.h"

#include <cstdint>
#include <string>
#include <vector>

namespace gis {

// The UI server: serves the embedded frontend and runs the SQL it sends.
// There is one per process. It runs queries on connections the extension
// opens while loading (see SetServerConnections).
//
// All functions are thread-safe.

// Hands the server the connections to run queries on, replacing (and closing)
// any previous ones: `session` for the UI's stateful SQL, one query at a time,
// and `pool` for its background reads, which run in parallel (requests opt in
// with the header `X-GIS-Connection: pool`). Called while the extension
// loads, because the database handle DuckDB passes to the entrypoint may not
// be kept: the connections keep the database alive instead.
void SetServerConnections(duckdb_connection session, std::vector<duckdb_connection> pool);

// Starts the server on localhost:`port`. Sets `already_started` if it was
// running already (on whatever port it was started with). Throws
// std::runtime_error if it can't listen on the port.
void StartServer(uint16_t port, bool &already_started);

// Stops the server. Returns false if it wasn't running.
bool StopServer();

bool ServerStarted();

// The URL the running server serves the UI on, e.g. "http://localhost:4214/".
// Empty if the server isn't running.
std::string ServerUrl();

} // namespace gis
