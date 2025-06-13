# DuckDB UI Extension

A [DuckDB extension](https://duckdb.org/docs/stable/core_extensions/ui.html) providing a browser-based user interface.

This repository contains both the extension, implemented in C++, and some packages used by the user interface, implemented in TypeScript.

While most of the user interface code is not yet publicly available, more of it will added here over time.

## Extension

The primary structure of this repository is based on the [DuckDB extension template](https://github.com/duckdb/extension-template).

To build the extension:

```sh
make
```

This will create the following binaries:

```sh
./build/release/duckdb                              # DuckDB shell with UI extension
./build/release/test/unittest                       # Test runner
./build/release/extension/ui/ui.duckdb_extension    # Loadable extension binary
```

- `duckdb` is the binary for the duckdb shell with the extension code automatically loaded.
- `unittest` is the test runner of duckdb. Again, the extension is already linked into the binary.
- `ui.duckdb_extension` is the loadable binary as it would be distributed.

To run the extension code, simply start the shell with `./build/release/duckdb`.

To start the UI from the command line:

```
./build/release/duckdb -ui
```

To start the UI from SQL:
```
call start_ui();
```

For more usage details, see the [documentation](https://duckdb.org/docs/stable/core_extensions/ui.html).

## User Interface Packages

Some packages used by the browser-based user interface can be found in the `ts` directory.

See the [README](ts/README.md) in that directory for details.

## Architectural Overview

The extension starts an HTTP server that both serves the UI assets (HTML, JavaScript, etc.)
and handles requests to run SQL and perform other DuckDB operations.

The server proxies requests for UI assets and fetches them from a remote server.
By default, this is `https://ui.duckdb.org`, but it can be [overridden](https://duckdb.org/docs/stable/core_extensions/ui.html#remote-url).

The server also exposes a number of HTTP endpoints for performing DuckDB operations.
These include running SQL, interrupting runs, tokenizing SQL text, and receiving events (such as catalog updates).
For details, see the `HttpServer::Run` method in [http_server.cpp](src/http_server.cpp).

The UI uses the TypeScript package [duckdb-ui-client](ts/pkgs/duckdb-ui-client/package.json) for communicating with the server.
See the [DuckDBUIClient](ts/pkgs/duckdb-ui-client/src/client/classes/DuckDBUIClient.ts) and [DuckDBUIClientConnection](ts/pkgs/duckdb-ui-client/src/client/classes/DuckDBUIClientConnection.ts) classes exposed by this package for details.
